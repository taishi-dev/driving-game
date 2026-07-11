"use client";

import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  FaceLandmarker,
  HandLandmarker,
  DrawingUtils,
  PoseLandmarker,
  type HandLandmarkerResult,
  type PoseLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";
import { useDrivingStore } from "@/lib/store";
import { STABILITY_DURATION_MS } from "@/lib/footPedalRecognition";
import { PoseLandmarkFilterManager } from "@/lib/oneEuroFilter";
import { computeSteeringAndGear } from "@/lib/vision/steeringGear";
import { decidePedalActions } from "@/lib/vision/pedalDecision";
import { computeHeadPose } from "@/lib/vision/headPose";
import {
  getVisionStatusDisplay,
  cameraErrorMessage,
  type CameraErrorKind,
  type VisionStatusTone,
} from "@/lib/pcVisionStatus";

/**
 * P11 — the PlayCanvas PRODUCT webcam/MediaPipe vision layer.
 *
 * A from-scratch, product-shell rewrite of the original R3F
 * `src/components/vision/VisionController.tsx`, keeping the store contract and
 * camera/MediaPipe lifecycle faithful while:
 *   - reusing the frozen pure modules AS-IS (computeSteeringAndGear /
 *     decidePedalActions / PoseLandmarkFilterManager / STABILITY_DURATION_MS),
 *   - localizing the preview status panel + camera-error overlay in BOTH
 *     languages (the original hard-coded English) via the pure pcVisionStatus.ts,
 *   - collapsing the original's four `useCallback`s (which carried the known
 *     exhaustive-deps warnings) into a SINGLE strict-mode-safe mount effect using
 *     a `disposed` guard + effect-local model/stream holders, so a StrictMode
 *     double-mount never double-acquires the camera or leaks a model, and
 *   - dropping the original `isPaused` prop: the product has no in-drive pause, so
 *     the lifecycle is simply acquire-on-mount / stop-on-unmount (leaving the
 *     driving or tutorial screen unmounts this and turns the camera off).
 *
 * Store writes are identical to the original: hands -> setSteering + setGear
 * (D/R), face -> setHeadRotation (feeds the mirror/safety checkpoints) + setGaze,
 * feet -> updatePedalState (throttle/brake) when calibrated, plus setVisionReady
 * and setDebugInfo. Steering is written EVERY frame while the loop runs (0 when
 * no hands) — so the camera overrides keyboard steer whenever it is active,
 * exactly as the original documented; keyboard steer is the fallback only when
 * no camera loop is running (denied / unavailable / models not loaded).
 *
 * P11 PERF/SIZE DEVIATION (settled E1 decision): the original also loaded a
 * MediaPipe ObjectDetector (efficientdet_lite0, ~6.9 MB) whose output was used
 * ONLY to append an "| Obj: <name>" suffix to the debug string (see
 * steeringGear.ts — it never touches gear/steering/pedals). Dropping it removes
 * ~6.9 MB from the download and its per-frame-adjacent inference; the only
 * observable effect is the debug panel string losing that developer-only suffix.
 * Driving behavior is unchanged (`detections` is passed as null downstream).
 */

// How often (ms) the human-readable status string is written to the store; the
// detection loop runs at display rate, the panel only needs a few Hz. (Original.)
const DEBUG_THROTTLE_MS = 150;

const TONE_COLORS: Record<VisionStatusTone, { color: string; bg: string }> = {
  info: { color: "#FFFFFF", bg: "rgba(0,0,0,0.8)" },
  calibrating: { color: "#FFFF00", bg: "rgba(255,255,0,0.2)" },
  brake: { color: "#FF0000", bg: "rgba(255,0,0,0.2)" },
  accel: { color: "#00FF00", bg: "rgba(0,255,0,0.2)" },
  idle: { color: "#FFFFFF", bg: "rgba(255,255,255,0.1)" },
};

export default function VisionController() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // User-facing camera failure kind (drives the localized retry overlay).
  const [cameraError, setCameraError] = useState<CameraErrorKind | null>(null);
  // Re-acquire hook, assigned inside the mount effect so the Retry button can
  // call it without the effect depending on a render-scope callback.
  const retryRef = useRef<() => void>(() => {});

  // Subscribed store fields for the localized status panel only.
  const language = useDrivingStore((s) => s.language);
  const debugInfo = useDrivingStore((s) => s.debugInfo);
  const calibrationStage = useDrivingStore((s) => s.calibrationStage);
  const pedalState = useDrivingStore((s) => s.pedalState);
  const footCalibrated = useDrivingStore((s) => Boolean(s.footCalibration?.isCalibrated));

  useEffect(() => {
    let disposed = false;

    const faceRef: { v: FaceLandmarker | null } = { v: null };
    const handRef: { v: HandLandmarker | null } = { v: null };
    const poseRef: { v: PoseLandmarker | null } = { v: null };
    const streamRef: { v: MediaStream | null } = { v: null };

    let rafId = 0;
    let lastVideoTime = -1;
    let lastFrameTime = 0;
    let lastDebugTime = 0;
    // Inference stagger (perf): new-video-frame counter + the time of the last
    // POSE inference (its decision deltaTime must span pose-to-pose, not
    // frame-to-frame, once pose runs at half rate).
    let videoFrameIndex = 0;
    let lastPoseTime = 0;
    let drawingUtils: DrawingUtils | null = null;
    const poseFilter = new PoseLandmarkFilterManager(1.0, 0.004, 1.5);

    // ── Overlay draw cache (flicker fix). Face + pose inference run at HALF the
    // camera rate (staggered for perf), but the preview canvas is cleared and
    // repainted EVERY camera frame. Drawing each skeleton only on its own
    // inference frame made it blink on/off at ~15 Hz — the reported red/gray/
    // green flicker that's hard on the eyes. Fix: cache the latest landmarks (+
    // the foot's state colours) and REDRAW them every frame, so overlays stay
    // steady while inference stays staggered. A cache is nulled only when its
    // detector actually RAN and found nothing (a genuine loss), never on the
    // frames it simply didn't run — that's what removes the blink.
    let lastFaceLandmarks: NormalizedLandmark[][] | null = null;
    let lastHandLandmarks: NormalizedLandmark[][] | null = null;
    let lastFootDraw:
      | { landmarks: NormalizedLandmark[]; footColor: string; landmarkColor: string }
      | null = null;

    // Draw all cached overlays onto the (already video-painted) preview canvas.
    // Called EVERY camera frame, after inference has refreshed whatever caches ran.
    const drawOverlays = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas || !drawingUtils) return;

      // Face tessellation (subtle grey).
      if (lastFaceLandmarks) {
        for (const lms of lastFaceLandmarks) {
          drawingUtils.drawConnectors(lms, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {
            color: "#C0C0C070",
            lineWidth: 1,
          });
        }
      }

      // Hands (green connectors + red joints).
      if (lastHandLandmarks) {
        for (const lms of lastHandLandmarks) {
          drawingUtils.drawConnectors(lms, HandLandmarker.HAND_CONNECTIONS, {
            color: "#00FF00",
            lineWidth: 3,
          });
          drawingUtils.drawLandmarks(lms, { color: "#FF0000", lineWidth: 2 });
        }
      }

      // Right-leg skeleton, coloured by pedal state (cached from the last pose frame).
      if (lastFootDraw) {
        const { landmarks, footColor, landmarkColor } = lastFootDraw;
        const rightFootConnections = [
          [24, 26],
          [26, 28],
          [28, 30],
          [30, 32],
        ];
        ctx.save();
        ctx.strokeStyle = footColor;
        ctx.lineWidth = 4;
        for (const [start, end] of rightFootConnections) {
          if (landmarks[start] && landmarks[end]) {
            const sp = landmarks[start];
            const ep = landmarks[end];
            ctx.beginPath();
            ctx.moveTo(sp.x * canvas.width, sp.y * canvas.height);
            ctx.lineTo(ep.x * canvas.width, ep.y * canvas.height);
            ctx.stroke();
          }
        }
        ctx.restore();

        const rightFootLandmarkIndices = [23, 24, 26, 28, 30, 32];
        const footLandmarks = rightFootLandmarkIndices.map((i) => landmarks[i]).filter(Boolean);
        if (footLandmarks.length > 0) {
          drawingUtils.drawLandmarks(footLandmarks, { color: landmarkColor, lineWidth: 3, radius: 4 });
        }
      }
    };

    const store = () => useDrivingStore.getState();

    const setDebugInfoThrottled = (info: string) => {
      const now = performance.now();
      if (now - lastDebugTime < DEBUG_THROTTLE_MS) return;
      lastDebugTime = now;
      store().setDebugInfo(info);
    };

    // ---- Steering + gear (delegates to the frozen pure module). ----
    // `detections` is always null now that the object detector is dropped (P11);
    // the pure module simply omits the debug-only "Obj:" suffix.
    const processSteeringAndGear = (handResult: HandLandmarkerResult): string => {
      const s = store();
      const result = computeSteeringAndGear({
        landmarks: handResult.landmarks,
        detections: null,
      });
      if (s.gear !== result.newGear) s.setGear(result.newGear);
      s.setSteering(result.steering);
      return result.info;
    };

    // ---- Pose -> pedals (delegates to the frozen pure decision module). ----
    const processPoseForPedals = (
      result: PoseLandmarkerResult,
      deltaTime: number,
      handInfo: string,
    ) => {
      // Keyboard pedal mode: the camera must not touch the pedals so the
      // keyboard's setPedals() stays authoritative. Steering still uses the camera.
      if (store().pedalInputMode === "keyboard") return;

      // One-Euro-filter the pose landmarks (jitter reduction) before deciding.
      let filteredLandmarks =
        result.landmarks && result.landmarks.length > 0 ? result.landmarks[0] : null;
      if (filteredLandmarks) {
        const timestamp = performance.now();
        filteredLandmarks = filteredLandmarks.map((lm, index) => {
          const f = poseFilter.filterLandmark(index, { x: lm.x, y: lm.y, z: lm.z }, timestamp);
          return { x: f.x, y: f.y, z: f.z, visibility: lm.visibility };
        });
      }

      const currentCalibrationStage = store().calibrationStage;
      const currentPedalState = store().pedalState;
      const currentFootCalibration = store().footCalibration;

      // Right-leg overlay color by state (verbatim palette from the original).
      let footColor = "#0000FF";
      let landmarkColor = "#8080FF";
      if (currentCalibrationStage === "waiting_for_brake") {
        if (currentFootCalibration && currentFootCalibration.stabilityCheckStartTime) {
          const elapsed = performance.now() - currentFootCalibration.stabilityCheckStartTime;
          const progress = Math.min(elapsed / STABILITY_DURATION_MS, 1.0);
          const r = Math.floor(255 * (1 - progress));
          footColor = `rgb(${r}, 255, 0)`;
          landmarkColor = `rgb(${Math.min(r + 80, 255)}, 255, 80)`;
        } else {
          footColor = "#FFFF00";
          landmarkColor = "#FFFF80";
        }
      } else if (
        currentCalibrationStage === "calibrated" &&
        currentPedalState &&
        currentFootCalibration?.isCalibrated
      ) {
        if (currentPedalState.isBrakePressed) {
          footColor = "#FF0000";
          landmarkColor = "#FF8080";
        } else if (currentPedalState.isAccelPressed) {
          footColor = "#00FF00";
          landmarkColor = "#80FF80";
        } else {
          footColor = "#0000FF";
          landmarkColor = "#8080FF";
        }
      } else {
        footColor = "#888888";
        landmarkColor = "#AAAAAA";
      }

      // Cache the foot skeleton for drawOverlays to repaint every frame (flicker
      // fix). Pose runs at half rate, so on the frames it DID run we refresh the
      // cache; a genuine no-detection frame clears it (skeleton disappears), but
      // the every-other-frame gaps keep the last one so it never blinks.
      lastFootDraw = filteredLandmarks
        ? { landmarks: filteredLandmarks, footColor, landmarkColor }
        : null;

      // Pure calibration/pedal decision, then apply the resulting store writes.
      const decision = decidePedalActions({
        filteredLandmarks,
        calibrationStage: currentCalibrationStage,
        pedalState: currentPedalState,
        footCalibration: currentFootCalibration,
        screen: store().screen,
        currentTime: performance.now(),
        deltaTime,
        handInfo,
      });
      if (decision.setFootCalibration) store().setFootCalibration(decision.setFootCalibration.value);
      if (decision.setCalibrationStage) store().setCalibrationStage(decision.setCalibrationStage);
      if (decision.updatePedalState) store().updatePedalState(decision.updatePedalState);
      setDebugInfoThrottled(decision.debugInfo);
    };

    // ---- Per-frame inference loop. ----
    const predictWebcam = () => {
      if (disposed || !videoRef.current || !canvasRef.current || !streamRef.v) return;

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (
        faceRef.v &&
        handRef.v &&
        video.readyState >= 2 &&
        video.videoWidth > 0 &&
        video.videoHeight > 0 &&
        video.currentTime !== lastVideoTime
      ) {
        const startTimeMs = performance.now();
        const deltaTime = lastFrameTime === 0 ? 16 : startTimeMs - lastFrameTime;
        lastFrameTime = startTimeMs;
        lastVideoTime = video.currentTime;
        videoFrameIndex++;

        // Preview redraw only when there IS a new camera frame — the old
        // unconditional per-rAF drawImage repainted identical frames (the
        // camera runs ~30 fps, the render loop 60).
        if (ctx) {
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        }

        try {
          if (ctx && !drawingUtils) drawingUtils = new DrawingUtils(ctx);

          // ── Inference stagger (perf; the 49-fps root cause was three GPU
          // inferences per camera frame contending with the renderer on the
          // shared iGPU). Hands stay at FULL camera rate — steering latency is
          // the feel-critical path. Face (head yaw for mirror checks + gaze)
          // and pose (feet; already One-Euro-filtered and driven by absolute-
          // time stability windows) alternate camera frames at half rate on
          // opposite phases: 2 inferences per camera frame instead of 3, and
          // the store contract is unchanged — values persist between their
          // frames exactly as they persisted between rAFs before.
          const runFace = videoFrameIndex % 2 === 0;
          const runPose = videoFrameIndex % 2 === 1;

          // Face -> head rotation (yaw) + gaze. DRAW is deferred to drawOverlays
          // (cache the landmarks); only refresh/clear the cache on frames face ran.
          const faceResult = runFace ? faceRef.v.detectForVideo(video, startTimeMs) : null;
          if (runFace) {
            lastFaceLandmarks =
              faceResult && faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0
                ? faceResult.faceLandmarks
                : null;
          }
          if (faceResult && faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
            // Head yaw (mirror/safety checks) + gaze — pure module (headPose.ts).
            const pose = computeHeadPose(faceResult.faceLandmarks[0]);
            if (pose) {
              store().setHeadRotation({ pitch: 0, yaw: pose.yaw, roll: 0 });
              store().setGaze(pose.gaze);
            }
          }

          // Hands -> steering + gear. Hands run EVERY frame; cache for drawOverlays.
          const handResult = handRef.v.detectForVideo(video, startTimeMs);
          lastHandLandmarks =
            handResult.landmarks && handResult.landmarks.length > 0 ? handResult.landmarks : null;
          const handInfo = processSteeringAndGear(handResult);

          // Pose -> pedals (half rate; deltaTime spans pose-to-pose). detectForVideo
          // always returns a result (possibly with empty landmarks), so a genuine
          // no-detection frame flows through and clears the foot-skeleton cache.
          if (runPose && poseRef.v) {
            const poseResult = poseRef.v.detectForVideo(video, startTimeMs);
            const poseDelta = lastPoseTime === 0 ? deltaTime : startTimeMs - lastPoseTime;
            lastPoseTime = startTimeMs;
            processPoseForPedals(poseResult, poseDelta, handInfo);
          }

          // Repaint ALL overlays from cache every camera frame (flicker fix).
          drawOverlays();
        } catch (e) {
          console.error(e);
        }
      }

      rafId = requestAnimationFrame(predictWebcam);
    };

    // Start the loop only when BOTH the camera stream and the models are ready.
    const maybeStartLoop = () => {
      if (disposed) return;
      if (!streamRef.v || !videoRef.current) return;
      if (!faceRef.v || !handRef.v) return;
      if (rafId) cancelAnimationFrame(rafId);
      predictWebcam();
    };

    const stopCamera = () => {
      if (streamRef.v) {
        streamRef.v.getTracks().forEach((track) => track.stop());
        streamRef.v = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    };

    // Acquire the webcam (independent of model loading, so a permission/support
    // failure surfaces the fallback overlay immediately without waiting on the CDN).
    const acquireCamera = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        if (!disposed) {
          setCameraError("unsupported");
          store().setDebugInfo("Camera not supported");
        }
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.v = stream;
        setCameraError(null);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadeddata = () => {
            videoRef.current?.play();
            maybeStartLoop();
          };
        }
        store().setDebugInfo("Camera Started");
        // Models load only once a camera actually exists (see the mount note).
        startMediaPipeOnce();
      } catch (e) {
        if (disposed) return;
        console.error("Camera Error:", e);
        const denied =
          e instanceof DOMException &&
          (e.name === "NotAllowedError" || e.name === "PermissionDeniedError");
        setCameraError(denied ? "denied" : "error");
        store().setDebugInfo("Camera Error: " + String(e));
      }
    };
    retryRef.current = () => {
      setCameraError(null);
      void acquireCamera();
    };

    // Load MediaPipe models (same CDN wasm + model assets and options as the
    // original, MINUS the object detector — see the P11 deviation note above).
    //
    // GATED ON CAMERA SUCCESS (perf + CI-stability): without a stream the
    // inference loop can never run, so loading ~22 MB of models and compiling
    // their wasm is pure waste in the camera-denied path — and that main-thread
    // jam is exactly what made the headless camera-denied e2e flaky on slow CI
    // runners (keyboard polls starve while wasm compiles). Camera acquisition
    // stays independent, so the denial overlay still appears immediately;
    // `startMediaPipeOnce` guards Retry-driven repeat acquisitions.
    let mediaPipeStarted = false;
    const startMediaPipeOnce = () => {
      if (mediaPipeStarted) return;
      mediaPipeStarted = true;
      void setupMediaPipe();
    };
    const setupMediaPipe = async () => {
      try {
        store().setDebugInfo("Loading AI Models...");
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm",
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
            delegate: "GPU",
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1,
        });
        const handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
        const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numPoses: 1,
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3,
        });
        if (disposed) {
          // Unmounted while models were still loading (StrictMode double mount):
          // release the LOCALS we just created; never touch a concurrent run's refs.
          faceLandmarker.close();
          handLandmarker.close();
          poseLandmarker.close();
          return;
        }
        faceRef.v = faceLandmarker;
        handRef.v = handLandmarker;
        poseRef.v = poseLandmarker;
        store().setVisionReady(true);
        store().setDebugInfo("Models Ready.");
        maybeStartLoop();
      } catch (error) {
        console.error(error);
      }
    };

    void acquireCamera(); // models follow on success (startMediaPipeOnce)

    return () => {
      disposed = true;
      stopCamera();
      faceRef.v?.close();
      handRef.v?.close();
      poseRef.v?.close();
      faceRef.v = null;
      handRef.v = null;
      poseRef.v = null;
      drawingUtils = null;
      // Reset steering so a stale camera steer value can't linger into keyboard
      // driving. Also zero head rotation + gaze: mission grading reads
      // headRotation.yaw for the mirror/safety checkpoints, so a stale yaw left
      // over from a prior camera session must not leak into the next run and
      // spuriously clear/block a checkpoint. With no camera, yaw=0 is exactly
      // what grading expects. (E1 final-review lesson.)
      store().setVisionReady(false);
      store().setSteering(0);
      store().setHeadRotation({ pitch: 0, yaw: 0, roll: 0 });
      store().setGaze({ x: 0, y: 0 });
    };
  }, []);

  const status = getVisionStatusDisplay(
    { calibrationStage, pedalState, footCalibrated, debugInfo },
    language,
  );
  const tone = TONE_COLORS[status.tone];
  const errorCopy = cameraError ? cameraErrorMessage(cameraError, language) : null;
  const retryLabel = language === "ja" ? "再試行" : "Retry";

  return (
    <div
      data-testid="vision-panel"
      style={{
        position: "fixed",
        // Clear the driving screen's top-right exit button (top-3, ~40px tall).
        top: "72px",
        right: "20px",
        zIndex: 40,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        opacity: 0.9,
      }}
    >
      {/* Hidden source video; the mirrored canvas below is the visible preview. */}
      <video ref={videoRef} style={{ display: "none" }} autoPlay playsInline muted />

      {errorCopy && (
        <div
          data-testid="vision-camera-error"
          style={{
            backgroundColor: "rgba(127, 29, 29, 0.95)",
            border: "2px solid #f87171",
            color: "#fff",
            padding: "14px 16px",
            borderRadius: "10px",
            width: "280px",
            marginBottom: "8px",
            boxSizing: "border-box",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            fontSize: "13px",
            lineHeight: 1.5,
            // Keep the overlay interactive even when a parent (e.g. the tutorial
            // wrapper) dims the panel with pointer-events:none, so Retry is always
            // reachable (the E1 tutorial defect: Retry unclickable under the wrapper).
            pointerEvents: "auto",
          }}
        >
          <div style={{ fontWeight: "bold", marginBottom: "6px", fontSize: "14px" }}>{errorCopy.title}</div>
          <div style={{ marginBottom: "10px" }}>{errorCopy.body}</div>
          <button
            data-testid="vision-camera-retry"
            onClick={() => retryRef.current()}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: "bold",
              color: "#7f1d1d",
              backgroundColor: "#fff",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
            }}
          >
            {retryLabel}
          </button>
        </div>
      )}

      <div
        style={{
          position: "relative",
          width: "240px",
          height: "180px",
          backgroundColor: "black",
          borderRadius: "10px",
          overflow: "hidden",
        }}
      >
        <canvas
          ref={canvasRef}
          data-testid="vision-preview"
          style={{ width: "100%", height: "100%", backgroundColor: "black", transform: "scaleX(-1)" }}
        />
      </div>

      <div
        data-testid="vision-status"
        style={{
          backgroundColor: tone.bg,
          backdropFilter: "blur(10px)",
          border: `2px solid ${tone.color}`,
          color: tone.color,
          fontSize: "14px",
          fontWeight: "bold",
          padding: "12px 16px",
          marginTop: "8px",
          borderRadius: "8px",
          width: "280px",
          boxSizing: "border-box",
          boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ fontSize: "16px", marginBottom: "4px", textAlign: "center" }}>{status.title}</div>
        <div style={{ fontSize: "12px", textAlign: "center", opacity: 0.9 }}>{status.message}</div>
      </div>
    </div>
  );
}
