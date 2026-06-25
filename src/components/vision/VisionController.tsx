"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { FilesetResolver, FaceLandmarker, HandLandmarker, DrawingUtils, HandLandmarkerResult, PoseLandmarker, PoseLandmarkerResult, ObjectDetector, ObjectDetectorResult } from "@mediapipe/tasks-vision";
import { useDrivingStore } from "@/lib/store";
import { STABILITY_DURATION_MS } from "@/lib/footPedalRecognition";
import { PoseLandmarkFilterManager } from "@/lib/oneEuroFilter";
import { computeSteeringAndGear } from "@/lib/vision/steeringGear";
import { decidePedalActions } from "@/lib/vision/pedalDecision";

// How often (ms) the per-frame status string is allowed to be written to the
// store. The detection loop runs at display rate; the human-readable panel only
// needs to refresh a few times per second.
const DEBUG_THROTTLE_MS = 150;

// Object detection feeds only a debug overlay string, so run it a few times a
// second instead of every frame (a full CNN inference pass each frame is wasteful).
const OBJECT_DETECT_INTERVAL_MS = 300;

export default function VisionController({ isPaused }: { isPaused: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // User-facing camera error (denied / unavailable / unsupported). When set, an
  // overlay explains the problem and offers a retry + keyboard-control fallback.
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Store actions
  const setHeadRotation = useDrivingStore((state) => state.setHeadRotation);
  const setSteering = useDrivingStore((state) => state.setSteering);
  const setVisionReady = useDrivingStore((state) => state.setVisionReady);
  const setDebugInfo = useDrivingStore((state) => state.setDebugInfo);
  const setSpeed = useDrivingStore((state => state.setSpeed));
  const setFootCalibration = useDrivingStore((state) => state.setFootCalibration);
  const updatePedalState = useDrivingStore((state) => state.updatePedalState);
  const setCalibrationStage = useDrivingStore((state) => state.setCalibrationStage);
  const setGaze = useDrivingStore((state) => state.setGaze); // Gaze action
  const setGear = useDrivingStore((state) => state.setGear);


  // References
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const poseLandmarkerRef = useRef<PoseLandmarker | null>(null);
  const objectDetectorRef = useRef<ObjectDetector | null>(null);
  const lastVideoTimeRef = useRef<number>(-1);
  const requestRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);
  // Throttle state for object detection (see OBJECT_DETECT_INTERVAL_MS): the
  // last result is reused between runs since it only feeds a debug string.
  const lastObjectDetectTimeRef = useRef<number>(0);
  const lastObjectResultRef = useRef<ObjectDetectorResult | null>(null);

  // Reused DrawingUtils instance (created once) instead of allocating a new one
  // every frame. Tied to the canvas 2D context, which is stable.
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  // Throttle for per-frame status (debug) string writes to the store.
  const lastDebugTimeRef = useRef<number>(0);

  // Using lastProcessingTimeRef to skip MediaPipe coordinate retrieval and
  // drawing while the elapsed time is under THROTTLE_MS resulted in too few
  // data points per second, making the motion choppy, so it is temporarily
  // disabled.

  // const lastProcessingTimeRef = useRef<number>(0);
  // const THROTTLE_MS = 100;

  // One Euro filter manager
  const poseFilterManagerRef = useRef<PoseLandmarkFilterManager>(
    new PoseLandmarkFilterManager(1.0, 0.004, 1.5)
  );
  const streamRef = useRef<MediaStream | null>(null); // Stream management
  // Ref-indirection so maybeStartLoop can invoke the loop without capturing
  // predictWebcam as a dependency (the function is declared below).
  const predictWebcamRef = useRef<() => void>(() => {});

  const isPausedRef = useRef(isPaused);
  useEffect(() => {
    isPausedRef.current = isPaused;

    if(isPaused){
      setSteering(0);
      setSpeed(0);
      setDebugInfo("Paused");
    }
  }, [isPaused, setSteering, setSpeed, setDebugInfo]);

  // Per-frame status updates go through this so the React panel re-renders a few
  // times per second instead of on every detection frame.
  const setDebugInfoThrottled = useCallback((info: string) => {
    const now = performance.now();
    if (now - lastDebugTimeRef.current < DEBUG_THROTTLE_MS) return;
    lastDebugTimeRef.current = now;
    setDebugInfo(info);
  }, [setDebugInfo]);

  // Function to stop the camera (physically disconnect)
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop(); // This is the command that turns off the camera light
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    // Stop the loop
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = 0;
    }

    // Fill the screen with solid black
    if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    }
    setDebugInfo("Camera Stopped (Paused)");
  }, [setDebugInfo]);

  // Start the inference loop (only when BOTH the camera stream and the AI models are ready).
  // Camera-stream readiness and vision-model readiness are independent concerns,
  // but the per-frame inference loop needs BOTH. Acquisition (acquireCamera) and
  // model loading (setupMediaPipe) each call this when they finish, so the loop
  // starts exactly once, when whichever was slower becomes ready.
  const maybeStartLoop = useCallback(() => {
    if (isPausedRef.current) return;
    if (!streamRef.current || !videoRef.current) return; // camera not ready yet
    if (!faceLandmarkerRef.current || !handLandmarkerRef.current) return; // models not ready yet
    // Cancel any in-flight loop before starting a fresh one so loops never stack.
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    predictWebcamRef.current();
  }, []);

  // Acquire the camera (runs independently of AI model loading).
  // Acquire the webcam as soon as the controller mounts, independent of MediaPipe
  // model loading. This surfaces permission/availability problems — and the
  // keyboard-fallback overlay — immediately, instead of waiting for the (CDN)
  // models to load first. The inference loop still waits for the models via
  // maybeStartLoop().
  const acquireCamera = useCallback(async () => {
    // Browser without camera API support (e.g. insecure context / old browser).
    if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("This browser does not support the camera. You can drive with the keyboard (use the arrow keys to steer).");
        setDebugInfo("Camera not supported");
        return;
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        streamRef.current = stream;
        setCameraError(null);

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.onloadeddata = () => {
                videoRef.current?.play();
                // Start the loop now if models are already loaded; otherwise
                // setupMediaPipe's completion will start it.
                maybeStartLoop();
            };
        }
        setDebugInfo("Camera Started");
    } catch (e) {
        console.error("Camera Error:", e);
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError");
        setCameraError(
            denied
                ? "Camera access was denied. Allow it in your browser settings, or drive with the keyboard (use the arrow keys to steer)."
                : "The camera could not be started. You can also drive with the keyboard (use the arrow keys to steer)."
        );
        setDebugInfo("Camera Error: " + String(e));
    }
  }, [setDebugInfo, setCameraError, maybeStartLoop]); // Do not add predictWebcam to the dependencies (it loops)

  // Initialization (loading MediaPipe)
  useEffect(() => {
    let isMounted = true;
    async function setupMediaPipe() {
      try {
        setDebugInfo("Loading AI Models...");
        const filesetResolver = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
        );

        const faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
            delegate: "GPU"
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });

        const handLandmarker = await HandLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.3,
          minHandPresenceConfidence: 0.3,
          minTrackingConfidence: 0.3
        });

        const poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            // 'full' over 'lite': markedly better on distant / low-contrast
            // bodies (e.g. dark clothing) at a moderate GPU cost. Swap to
            // 'heavy' for more accuracy, or back to 'lite' if framerate drops.
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numPoses: 1,
          // Lowered 0.5 -> 0.3 so legs/feet keep tracking in poor conditions
          // (distance, dark clothing). Smoothing downstream absorbs the jitter.
          minPoseDetectionConfidence: 0.3,
          minPosePresenceConfidence: 0.3,
          minTrackingConfidence: 0.3
        });

        const objectDetector = await ObjectDetector.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
            delegate: "GPU"
          },
          scoreThreshold: 0.3,
          runningMode: "VIDEO"
        });

        if (isMounted) {
            // Assign ALL four models to the shared refs only here. Doing this for
            // pose/object before the isMounted check let a StrictMode remount's
            // cleanup close the OTHER run's live models — so we keep them local
            // until we know this run still owns the component.
            faceLandmarkerRef.current = faceLandmarker;
            handLandmarkerRef.current = handLandmarker;
            poseLandmarkerRef.current = poseLandmarker;
            objectDetectorRef.current = objectDetector;
            setVisionReady(true);
            setDebugInfo("Models Ready.");

            // Models are ready; start the loop if the camera stream is already
            // acquired (acquireCamera runs independently on mount/resume).
            maybeStartLoop();
        } else {
            // Unmounted while models were still loading (e.g. React StrictMode's
            // double mount in development) — release the LOCALS we created here;
            // never touch the shared refs (a concurrent remount may own them).
            faceLandmarker.close();
            handLandmarker.close();
            poseLandmarker.close();
            objectDetector.close();
        }
      } catch (error) {
        console.error(error);
      }
    }
    setupMediaPipe();

    return () => {
        isMounted = false;
        stopCamera(); // Make sure to stop on unmount
        // Release MediaPipe model resources to avoid leaking GPU/WASM contexts.
        faceLandmarkerRef.current?.close();
        handLandmarkerRef.current?.close();
        poseLandmarkerRef.current?.close();
        objectDetectorRef.current?.close();
        faceLandmarkerRef.current = null;
        handLandmarkerRef.current = null;
        poseLandmarkerRef.current = null;
        objectDetectorRef.current = null;
        drawingUtilsRef.current = null;
    };
  }, []); // Run only once

  // Turn the camera on/off in response to changes in isPaused
  useEffect(() => {
    if (isPaused) {
        stopCamera();
    } else {
        acquireCamera();
    }
  }, [isPaused, acquireCamera, stopCamera]);
  


  // AI inference loop
  const predictWebcam = () => {
    // End the loop if a stop has been requested
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (video.videoWidth > 0 && ctx) {
         if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
         }
         // Draw the video (no filter, sharp)
         ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
    }

    if (isPausedRef.current) {
        requestRef.current = requestAnimationFrame(predictWebcam);
        return; 
    }
    // const now = performance.now();
    // if (now - lastProcessingTimeRef.current < THROTTLE_MS){
    //   requestRef.current = requestAnimationFrame(predictWebcam);
    //   return;
    // }
    // lastProcessingTimeRef.current = now;

    if (faceLandmarkerRef.current && handLandmarkerRef.current && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && video.currentTime !== lastVideoTimeRef.current) {
      // eslint-disable-next-line react-hooks/purity
        const startTimeMs = performance.now();
         
        const deltaTime = lastFrameTimeRef.current === 0 ? 16 : startTimeMs - lastFrameTimeRef.current;
        lastFrameTimeRef.current = startTimeMs;
        lastVideoTimeRef.current = video.currentTime;

        try {
            // Reuse a single DrawingUtils instead of allocating one every frame.
            if (ctx && !drawingUtilsRef.current) {
                drawingUtilsRef.current = new DrawingUtils(ctx);
            }
            const drawingUtils = drawingUtilsRef.current;

            // Face Detection
            const faceResult = faceLandmarkerRef.current.detectForVideo(video, startTimeMs);
            if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
                 if(drawingUtils) {
                    for (const landmarks of faceResult.faceLandmarks) {
                        drawingUtils.drawConnectors(landmarks, FaceLandmarker.FACE_LANDMARKS_TESSELATION, {color: "#C0C0C070", lineWidth: 1});
                    }
                }
                const landmarks = faceResult.faceLandmarks[0];
                if(landmarks) {
                    const nose = landmarks[1];
                    const leftEar = landmarks[234];
                    const rightEar = landmarks[454];
                    const midEarX = (leftEar.x + rightEar.x) / 2;
                    const yawEstimate = (nose.x - midEarX) * 20;
                    setHeadRotation({ pitch: 0, yaw: -yawEstimate, roll: 0 });

                    // Gaze Calculation
                    const leftInner = landmarks[33].x;
                    const leftOuter = landmarks[133].x;
                    const leftIris = landmarks[468].x;
                    
                    const rightInner = landmarks[362].x;
                    const rightOuter = landmarks[263].x;
                    const rightIris = landmarks[473].x;
                    
                    const leftRatio = (leftIris - leftInner) / (leftOuter - leftInner);
                    const rightRatio = (rightIris - rightInner) / (rightOuter - rightInner);
                    
                    const avgRatio = (leftRatio + rightRatio) / 2;
                    const gazeX = (avgRatio - 0.5) * 5; 
                    setGaze({ x: gazeX, y: 0 });
                }
            }

            // Object Detection (throttled — see OBJECT_DETECT_INTERVAL_MS)
            if (objectDetectorRef.current && startTimeMs - lastObjectDetectTimeRef.current >= OBJECT_DETECT_INTERVAL_MS) {
                lastObjectResultRef.current = objectDetectorRef.current.detectForVideo(video, startTimeMs);
                lastObjectDetectTimeRef.current = startTimeMs;
            }
            const objectResult = lastObjectResultRef.current;

            // Hand Detection
            const handResult = handLandmarkerRef.current.detectForVideo(video, startTimeMs);
            if (handResult.landmarks && drawingUtils) {
                for (const landmarks of handResult.landmarks) {
                    drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {color: "#00FF00", lineWidth: 3});
                    drawingUtils.drawLandmarks(landmarks, {color: "#FF0000", lineWidth: 2});
                }
            }
            const handInfo = processSteeringAndGear(handResult, objectResult);

            // Run Pose Detection for Foot Pedal Recognition
            const poseResult = poseLandmarkerRef.current 
                ? poseLandmarkerRef.current.detectForVideo(video, startTimeMs) 
                : null;
            if (poseResult) {
                processPoseForPedals(poseResult, deltaTime, drawingUtils, handInfo);
            }
        } catch (e) {
            console.error(e);
        }
    }

    // Request the next frame
    requestRef.current = requestAnimationFrame(predictWebcam);
  };
  // Keep the ref current so maybeStartLoop (declared above) can call this without
  // capturing it as a dependency. Assigning during render is safe for refs.
  predictWebcamRef.current = predictWebcam;


  const processSteeringAndGear = (handResult: HandLandmarkerResult, objectResult: ObjectDetectorResult | null) => {
      const currentGear = useDrivingStore.getState().gear;
      const result = computeSteeringAndGear({
          landmarks: handResult.landmarks,
          detections: objectResult?.detections ?? null,
      });
      // setGear stays conditional here: store.setGear is unconditional, so this
      // guard is what keeps it from writing every frame.
      if (currentGear !== result.newGear) setGear(result.newGear);
      setSteering(result.steering);
      return result.info;
  };

  const processPoseForPedals = (result: PoseLandmarkerResult, deltaTime: number, drawingUtils: DrawingUtils | null, handInfo: string) => {
    // Keyboard pedal mode: do not let the camera touch the pedals, so the
    // keyboard's setPedals() stays authoritative. Fallback for users whose
    // legs/feet can't be tracked (distance, dark clothing). Steering still uses
    // the camera. See docs/superpowers/plans/0004-keyboard-pedal-fallback.md.
    if (useDrivingStore.getState().pedalInputMode === 'keyboard') return;

    // Draw the pose landmarks
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    // Filter the landmarks with the One Euro filter
    let filteredLandmarks = result.landmarks && result.landmarks.length > 0 ? result.landmarks[0] : null;
    if (filteredLandmarks) {
      const timestamp = performance.now();
      const filtered = filteredLandmarks.map((landmark, index) => {
        const filteredPoint = poseFilterManagerRef.current.filterLandmark(
          index,
          { x: landmark.x, y: landmark.y, z: landmark.z },
          timestamp
        );
        return {
          x: filteredPoint.x,
          y: filteredPoint.y,
          z: filteredPoint.z,
          visibility: landmark.visibility,
        };
      });
      // Use the filtered landmarks
      filteredLandmarks = filtered;
    }

    // Read the latest state directly from the store
    const currentCalibrationStage: 'idle' | 'waiting_for_brake' | 'calibrated' = useDrivingStore.getState().calibrationStage;
    const currentPedalState = useDrivingStore.getState().pedalState;
    const currentFootCalibration = useDrivingStore.getState().footCalibration;

    // Decide the color based on the state
    let footColor = "#0000FF"; // Default: blue (normal)
    let landmarkColor = "#8080FF"; // Default: light blue

    if (currentCalibrationStage === 'waiting_for_brake') {
      // During calibration - vary the brightness of the color with the progress
      if (currentFootCalibration && currentFootCalibration.stabilityCheckStartTime) {
        const currentTime = performance.now();
        const elapsed = currentTime - currentFootCalibration.stabilityCheckStartTime;
        const progress = Math.min(elapsed / STABILITY_DURATION_MS, 1.0);

        // Approach green as the progress increases (0%: yellow, 100%: green)
        const r = Math.floor(255 * (1 - progress));
        const g = 255;
        const b = 0;
        footColor = `rgb(${r}, ${g}, ${b})`;
        landmarkColor = `rgb(${Math.min(r + 80, 255)}, ${g}, ${Math.min(b + 80, 255)})`;
      } else {
        footColor = "#FFFF00"; // Yellow (before calibration starts)
        landmarkColor = "#FFFF80";
      }
    } else if (currentCalibrationStage === 'calibrated' && currentPedalState && currentFootCalibration?.isCalibrated) {
      if (currentPedalState.isBrakePressed) {
        footColor = "#FF0000"; // Red (brake ON)
        landmarkColor = "#FF8080";
      } else if (currentPedalState.isAccelPressed) {
        footColor = "#00FF00"; // Green (accelerator ON)
        landmarkColor = "#80FF80";
      } else {
        footColor = "#0000FF"; // Blue (idle)
        landmarkColor = "#8080FF";
      }
    } else {
      // Other states (e.g. before calibration)
      footColor = "#888888"; // Gray
      landmarkColor = "#AAAAAA";
    }

    if (filteredLandmarks && ctx && canvas) {
      const landmarks = filteredLandmarks;

      // Draw only the right leg (hip and below the knee)
      // 23 (left hip), 24 (right hip), 26 (right knee), 28 (right ankle), 30 (right heel), 32 (right foot index)
      const rightFootConnections = [
        [24, 26], // Right hip -> right knee
        [26, 28], // Right knee -> right ankle
        [28, 30], // Right ankle -> right heel
        [30, 32], // Right heel -> right foot index
      ];

      // Connect the right-leg landmarks with lines (color based on the state)
      ctx.save();
      ctx.strokeStyle = footColor;
      ctx.lineWidth = 4;
      for (const [start, end] of rightFootConnections) {
        if (landmarks[start] && landmarks[end]) {
          const startPoint = landmarks[start];
          const endPoint = landmarks[end];
          const width = canvas.width;
          const height = canvas.height;
          ctx.beginPath();
          ctx.moveTo(startPoint.x * width, startPoint.y * height);
          ctx.lineTo(endPoint.x * width, endPoint.y * height);
          ctx.stroke();
        }
      }
      ctx.restore();

      // Draw the right-leg and hip landmarks (color based on the state)
      const rightFootLandmarkIndices = [23, 24, 26, 28, 30, 32]; // Left hip, right hip, right knee, right ankle, right heel, right foot index
      if (drawingUtils) {
        const footLandmarks = rightFootLandmarkIndices.map(i => landmarks[i]).filter(Boolean);
        if (footLandmarks.length > 0) {
          drawingUtils.drawLandmarks(footLandmarks, {color: landmarkColor, lineWidth: 3, radius: 4});
        }
      }
    }


    // Decide calibration/pedal actions (pure) and apply the resulting store writes.
    const screen = useDrivingStore.getState().screen;
    const now = performance.now();
    const decision = decidePedalActions({
      filteredLandmarks,
      calibrationStage: currentCalibrationStage,
      pedalState: currentPedalState,
      footCalibration: currentFootCalibration,
      screen,
      currentTime: now,
      deltaTime,
      handInfo,
    });

    if (decision.setFootCalibration) setFootCalibration(decision.setFootCalibration.value);
    if (decision.setCalibrationStage) setCalibrationStage(decision.setCalibrationStage);
    if (decision.updatePedalState) updatePedalState(decision.updatePedalState);
    setDebugInfoThrottled(decision.debugInfo);
  };

  // Build the status description text (read directly from the store for the latest state)
  const debugInfo = useDrivingStore(state => state.debugInfo);
  const calibrationStage = useDrivingStore(state => state.calibrationStage);
  const pedalState = useDrivingStore(state => state.pedalState);
  const footCalibration = useDrivingStore(state => state.footCalibration);

  // Extract the progress percentage
  const getProgressFromDebugInfo = () => {
    const match = debugInfo.match(/(\d+)%/);
    return match ? parseInt(match[1]) : 0;
  };

  const getStatusDisplay = () => {
    if (calibrationStage === 'waiting_for_brake') {
      const progress = getProgressFromDebugInfo();
      return {
        title: '⚠️ Holding foot still...',
        message: `Please keep your foot still for 5 seconds (${progress}%)`,
        color: '#FFFF00',
        bgColor: 'rgba(255, 255, 0, 0.2)'
      };
    } else if (calibrationStage === 'calibrated' && footCalibration?.isCalibrated) {
      if (pedalState.isBrakePressed) {
        return {
          title: '🔴 Brake',
          message: `Braking force: ${(pedalState.brake * 100).toFixed(0)}%`,
          color: '#FF0000',
          bgColor: 'rgba(255, 0, 0, 0.2)'
        };
      } else if (pedalState.isAccelPressed) {
        return {
          title: '🟢 Accelerator',
          message: `Throttle: ${(pedalState.throttle * 100).toFixed(0)}%`,
          color: '#00FF00',
          bgColor: 'rgba(0, 255, 0, 0.2)'
        };
      } else {
        return {
          title: '⚪ Idle',
          message: 'No pedal input',
          color: '#FFFFFF',
          bgColor: 'rgba(255, 255, 255, 0.1)'
        };
      }
    } else {
      return {
        title: '📷 Starting camera',
        message: debugInfo,
        color: '#FFFFFF',
        bgColor: 'rgba(0, 0, 0, 0.8)'
      };
    }
  };

  const statusDisplay = getStatusDisplay();

  return (
    <div style={{
        position: 'fixed',
        top: '20px',
        right: '20px',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        opacity: 0.9,
    }}>
        {/* The video tag is hidden and runs in the background */}
        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline muted></video>

        {/* User guidance shown when the camera fails to start (retry + keyboard control fallback) */}
        {cameraError && (
          <div style={{
            backgroundColor: 'rgba(127, 29, 29, 0.95)',
            border: '2px solid #f87171',
            color: '#fff',
            padding: '14px 16px',
            borderRadius: '10px',
            width: '280px',
            marginBottom: '8px',
            boxSizing: 'border-box',
            boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            fontSize: '13px',
            lineHeight: 1.5,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>📷 Camera unavailable</div>
            <div style={{ marginBottom: '10px' }}>{cameraError}</div>
            <button
              onClick={() => { setCameraError(null); acquireCamera(); }}
              style={{
                padding: '6px 14px',
                fontSize: '13px',
                fontWeight: 'bold',
                color: '#7f1d1d',
                backgroundColor: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >Retry</button>
          </div>
        )}

        <div style={{
          position: "relative",
          width: "240px",
          height: "180px",
          backgroundColor: "black", // Keep the canvas backing black too
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
            <canvas ref={canvasRef} style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'black', // This is visible when stopped
                transform: 'scaleX(-1)'
            }} />
        </div>

        {/* Status display panel */}
        <div style={{
            backgroundColor: statusDisplay.bgColor,
            backdropFilter: 'blur(10px)',
            border: `2px solid ${statusDisplay.color}`,
            color: statusDisplay.color,
            fontSize: '14px',
            fontWeight: 'bold',
            padding: '12px 16px',
            marginTop: '8px',
            borderRadius: '8px',
            width: '280px',
            boxSizing: 'border-box',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
        }}>
            <div style={{
                fontSize: '16px',
                marginBottom: '4px',
                textAlign: 'center'
            }}>
                {statusDisplay.title}
            </div>
            <div style={{
                fontSize: '12px',
                textAlign: 'center',
                opacity: 0.9
            }}>
                {statusDisplay.message}
            </div>
        </div>
    </div>
  );
}