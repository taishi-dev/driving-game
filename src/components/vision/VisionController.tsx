"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { FilesetResolver, FaceLandmarker, HandLandmarker, DrawingUtils, HandLandmarkerResult, PoseLandmarker, PoseLandmarkerResult, ObjectDetector, ObjectDetectorResult } from "@mediapipe/tasks-vision";
import { useDrivingStore } from "@/lib/store";
import { processPedalRecognition, checkFootStability } from "@/lib/footPedalRecognition";
import { PoseLandmarkFilterManager } from "@/lib/oneEuroFilter";

// How often (ms) the per-frame status string is allowed to be written to the
// store. The detection loop runs at display rate; the human-readable panel only
// needs to refresh a few times per second.
const DEBUG_THROTTLE_MS = 150;

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

  // Reused DrawingUtils instance (created once) instead of allocating a new one
  // every frame. Tied to the canvas 2D context, which is stable.
  const drawingUtilsRef = useRef<DrawingUtils | null>(null);
  // Throttle for per-frame status (debug) string writes to the store.
  const lastDebugTimeRef = useRef<number>(0);

  // 最後の描画時間lastProcessingTimeRefを使用して、経過時間がTHROTTLE_MSいないなら、
  // MediaPipeに寄る座標の取得や描画を行わない実装であると、秒数当たりに取得できるデータ点が少なく、動きがスムーズにならないため一時的に廃止

  // const lastProcessingTimeRef = useRef<number>(0);
  // const THROTTLE_MS = 100;

  // 1ユーロフィルタマネージャー
  const poseFilterManagerRef = useRef<PoseLandmarkFilterManager>(
    new PoseLandmarkFilterManager(1.0, 0.004, 1.5)
  );
  const streamRef = useRef<MediaStream | null>(null); // ストリーム管理用
  // Ref-indirection so startCamera's useCallback can invoke the loop without
  // capturing predictWebcam as a dependency (the function is declared below).
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

  // ■ カメラを停止する関数（物理的に切断）
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop(); // これがカメラのライトを消すコマンドだ
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    // ループを止める
    if (requestRef.current) {
      cancelAnimationFrame(requestRef.current);
      requestRef.current = 0;
    }
    
    // 画面を漆黒に塗りつぶす
    if (canvasRef.current) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
            ctx.fillStyle = "black";
            ctx.fillRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
    }
    setDebugInfo("Camera Stopped (Paused)");
  }, [setDebugInfo]);

  // ■ カメラを開始する関数
  const startCamera = useCallback(async () => {
    try {
        // AIモデルがまだ準備できていなければ待つ（本来はロード済みのはず）
        if (!faceLandmarkerRef.current || !handLandmarkerRef.current) {
            console.log("Waiting for models...");
            return;
        }

        // Browser without camera API support (e.g. insecure context / old browser).
        if (!navigator.mediaDevices?.getUserMedia) {
            setCameraError("このブラウザではカメラを利用できません。キーボードで運転できます（←→で操作）。");
            setDebugInfo("Camera not supported");
            return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } });
        streamRef.current = stream;
        setCameraError(null);

        if (videoRef.current) {
            videoRef.current.srcObject = stream;
            // Use a single onloadeddata handler. (Previously the loop was also
            // registered via addEventListener, which started a second
            // requestAnimationFrame loop and doubled the per-frame work.)
            videoRef.current.onloadeddata = () => {
                videoRef.current?.play();
                // Cancel any in-flight loop before starting a fresh one so loops
                // never stack across start/stop cycles.
                if (requestRef.current) cancelAnimationFrame(requestRef.current);
                predictWebcamRef.current();
            };
        }
        setDebugInfo("Camera Started");
    } catch (e) {
        console.error("Camera Error:", e);
        const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError");
        setCameraError(
            denied
                ? "カメラへのアクセスが拒否されました。ブラウザの設定で許可するか、キーボード（←→で操作）で運転してください。"
                : "カメラを起動できませんでした。キーボード（←→で操作）でも運転できます。"
        );
        setDebugInfo("Camera Error: " + String(e));
    }
  }, [setDebugInfo, setCameraError]); // predictWebcamは依存に入れない（ループするため）

  // ■ 初期化（MediaPipeのロード）
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

        poseLandmarkerRef.current = await PoseLandmarker.createFromOptions(filesetResolver, {
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

        objectDetectorRef.current = await ObjectDetector.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite`,
            delegate: "GPU"
          },
          scoreThreshold: 0.3,
          runningMode: "VIDEO"
        });

        if (isMounted) {
            faceLandmarkerRef.current = faceLandmarker;
            handLandmarkerRef.current = handLandmarker;
            setVisionReady(true);
            setDebugInfo("Models Ready.");

            // 初回ロード完了時に、ポーズしていなければカメラ起動
            if (!isPausedRef.current) {
                startCamera();
            }
        } else {
            // Unmounted while models were still loading (e.g. React StrictMode's
            // double mount in development) — release everything we created.
            faceLandmarker.close();
            handLandmarker.close();
            poseLandmarkerRef.current?.close();
            objectDetectorRef.current?.close();
            poseLandmarkerRef.current = null;
            objectDetectorRef.current = null;
        }
      } catch (error) {
        console.error(error);
      }
    }
    setupMediaPipe();

    return () => {
        isMounted = false;
        stopCamera(); // アンマウント時は確実に停止
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
  }, []); // 初回のみ実行

  // ■ isPaused の変化に合わせてカメラをON/OFFする
  useEffect(() => {
    
    // MediaPipeのロードが終わっていない場合は無視（ロード完了時の処理に任せる）
    if (!faceLandmarkerRef.current) return;

    if (isPaused) {
        stopCamera();
    } else {
        startCamera();
    }
  }, [isPaused, startCamera, stopCamera]);
  


  // ■ AI推論ループ
  const predictWebcam = () => {
    // 停止指示が出ていたらループ終了
    if (!videoRef.current || !canvasRef.current || !streamRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (video.videoWidth > 0 && ctx) {
         if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
             canvas.width = video.videoWidth;
             canvas.height = video.videoHeight;
         }
         // 映像を描画（フィルタなし、鮮明に）
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

            // Object Detection
            const objectResult = objectDetectorRef.current
                ? objectDetectorRef.current.detectForVideo(video, startTimeMs)
                : null;

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

    // 次のフレームを要求
    requestRef.current = requestAnimationFrame(predictWebcam);
  };
  // Keep the ref current so startCamera (declared above) can call this without
  // capturing it as a dependency. Assigning during render is safe for refs.
  predictWebcamRef.current = predictWebcam;


  const processSteeringAndGear = (handResult: HandLandmarkerResult, objectResult: ObjectDetectorResult | null) => {
      const hands = handResult.landmarks.length;
      let info = `Hands: ${hands}`;
      
      // --- Gear Logic ---
      // Define Gear Zone: Right side of the screen, lower half.
      // x: 0.8 ~ 1.0, y: 0.5 ~ 1.0
      // If a hand is in this zone, we shift to REVERSE.
      // Otherwise, we shift to DRIVE (default).
      
      let newGear: "D" | "R" = "D";
      let gearHandIndex = -1;
      
      for (let i = 0; i < hands; i++) {
          const landmarks = handResult.landmarks[i];
          const wrist = landmarks[0];
          
          if (wrist.x > 0.8 && wrist.y > 0.5) {
              newGear = "R";
              gearHandIndex = i;
              break; // Found a gear hand
          }
      }
      
      // Update Gear Store (avoid frequent updates if same)
      const currentGear = useDrivingStore.getState().gear;
      if (currentGear !== newGear) {
          setGear(newGear);
      }
      info += ` | Gear: ${newGear}`;
      
      // --- Steering Logic ---
      // Use hands that are NOT the gear hand.
      const steeringHands = [];
      for (let i = 0; i < hands; i++) {
          if (i !== gearHandIndex) {
              steeringHands.push(handResult.landmarks[i]);
          }
      }
      
      let steering = 0;
      let angle = 0;
      
      if (steeringHands.length >= 2) {
          // Two-Hand Steering (Standard)
          // Sort by x coordinate to distinguish left/right
          const h1 = steeringHands[0][9]; // Middle finger MCP
          const h2 = steeringHands[1][9];
          
          let left, right;
          if (h1.x < h2.x) { left = steeringHands[0][9]; right = steeringHands[1][9]; }
          else { left = steeringHands[1][9]; right = steeringHands[0][9]; }
          
          const dy = right.y - left.y;
          const dx = right.x - left.x;
          angle = Math.atan2(dy, dx);
          
          // Sensitivity adjustments
          const sensitivity = 0.8;
          steering = -angle * sensitivity;
          
      } else if (steeringHands.length === 1) {
          // Single-Hand Steering (One Hand Detected or One Hand Shifting)
          // Calculate tilt of the single hand.
          // Using Wrist (0) and Middle Finger MCP (9)
          const wrist = steeringHands[0][0];
          const middle = steeringHands[0][9];
          
          const dy = middle.y - wrist.y;
          const dx = middle.x - wrist.x;
          
          // Upright (Straight) is -90 degrees (-PI/2).
          // We want deviation from -PI/2.
          const handAngle = Math.atan2(dy, dx);
          const neutralAngle = -Math.PI / 2;
          
          let diff = handAngle - neutralAngle;
          
          // Normalize to -PI to PI
          if (diff > Math.PI) diff -= 2 * Math.PI;
          if (diff < -Math.PI) diff += 2 * Math.PI;
          
          // Sensitivity for single hand
          const oneHandSensitivity = 1.5;
          steering = diff * oneHandSensitivity;
          angle = diff; 
          
      } else {
          // No hands for steering
          steering = 0;
      }
      
      // Clamp
      const deadzone = 0.05;
      if (Math.abs(steering) < deadzone) steering = 0;
      steering = Math.max(-1, Math.min(1, steering));
      
      // Update Steering Store
      setSteering(steering);
      
      info += ` | Str: ${steering.toFixed(2)}`;
      
      // Object Detection Info (Optional Display)
      if (objectResult && objectResult.detections.length > 0) {
          const det = objectResult.detections[0];
          const cat = det.categories[0];
          if (cat) info += ` | Obj: ${cat.categoryName}`;
      }
      
      return info;
  };

  const processPoseForPedals = (result: PoseLandmarkerResult, deltaTime: number, drawingUtils: DrawingUtils | null, handInfo: string) => {
    // Keyboard pedal mode: do not let the camera touch the pedals, so the
    // keyboard's setPedals() stays authoritative. Fallback for users whose
    // legs/feet can't be tracked (distance, dark clothing). Steering still uses
    // the camera. See docs/superpowers/plans/0004-keyboard-pedal-fallback.md.
    if (useDrivingStore.getState().pedalInputMode === 'keyboard') return;

    // ポーズランドマークを描画
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");

    // ランドマークを1ユーロフィルタでフィルタリング
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
      // フィルタリング後のランドマークを使用
      filteredLandmarks = filtered;
    }

    // storeから最新の状態を直接取得
    const currentCalibrationStage: 'idle' | 'waiting_for_brake' | 'calibrated' = useDrivingStore.getState().calibrationStage;
    const currentPedalState = useDrivingStore.getState().pedalState;
    const currentFootCalibration = useDrivingStore.getState().footCalibration;

    // 状態に応じた色を決定
    let footColor = "#0000FF"; // デフォルト: 青色（通常時）
    let landmarkColor = "#8080FF"; // デフォルト: 薄い青色

    if (currentCalibrationStage === 'waiting_for_brake') {
      // キャリブレーション中 - 進捗に応じて色の明るさを変える
      if (currentFootCalibration && currentFootCalibration.stabilityCheckStartTime) {
        const currentTime = performance.now();
        const elapsed = currentTime - currentFootCalibration.stabilityCheckStartTime;
        const progress = Math.min(elapsed / 5000, 1.0);

        // 進捗に応じて緑色に近づく（0%: 黄色、100%: 緑色）
        const r = Math.floor(255 * (1 - progress));
        const g = 255;
        const b = 0;
        footColor = `rgb(${r}, ${g}, ${b})`;
        landmarkColor = `rgb(${Math.min(r + 80, 255)}, ${g}, ${Math.min(b + 80, 255)})`;
      } else {
        footColor = "#FFFF00"; // 黄色（キャリブレーション開始前）
        landmarkColor = "#FFFF80";
      }
    } else if (currentCalibrationStage === 'calibrated' && currentPedalState && currentFootCalibration?.isCalibrated) {
      if (currentPedalState.isBrakePressed) {
        footColor = "#FF0000"; // 赤色（ブレーキON）
        landmarkColor = "#FF8080";
      } else if (currentPedalState.isAccelPressed) {
        footColor = "#00FF00"; // 緑色（アクセルON）
        landmarkColor = "#80FF80";
      } else {
        footColor = "#0000FF"; // 青色（待機中）
        landmarkColor = "#8080FF";
      }
    } else {
      // その他の状態（キャリブレーション前など）
      footColor = "#888888"; // 灰色
      landmarkColor = "#AAAAAA";
    }

    if (filteredLandmarks && ctx && canvas) {
      const landmarks = filteredLandmarks;

      // 右足のみを描画（腰、膝から下）
      // 23(左腰), 24(右腰), 26(右膝), 28(右足首), 30(右踵), 32(右足先)
      const rightFootConnections = [
        [24, 26], // 右腰 → 右膝
        [26, 28], // 右膝 → 右足首
        [28, 30], // 右足首 → 右踵
        [30, 32], // 右踵 → 右足先
      ];

      // 右足のランドマークを線で結ぶ（状態に応じた色）
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

      // 右足と腰のランドマークを描画（状態に応じた色）
      const rightFootLandmarkIndices = [23, 24, 26, 28, 30, 32]; // 左腰、右腰、右膝、右足首、右踵、右足先
      if (drawingUtils) {
        const footLandmarks = rightFootLandmarkIndices.map(i => landmarks[i]).filter(Boolean);
        if (footLandmarks.length > 0) {
          drawingUtils.drawLandmarks(footLandmarks, {color: landmarkColor, lineWidth: 3, radius: 4});
        }
      }
    }


    // キャリブレーション段階に応じた処理
    if (['idle', 'waiting_for_brake'].includes(currentCalibrationStage)) {
      // キャリブレーション中 - 5秒間の足位置安定性をチェック
      if (filteredLandmarks) {
        const currentTime = performance.now();
        const stabilityCheck = checkFootStability(
          filteredLandmarks,
          currentFootCalibration,
          currentTime
        );

        if (stabilityCheck.calibration) {
          setFootCalibration(stabilityCheck.calibration);

          if (stabilityCheck.isStable) {
            // 5秒間安定していた場合、キャリブレーション完了
            setCalibrationStage('calibrated');
            setDebugInfoThrottled(`${handInfo} | 足元のキャリブレーション完了！`);
            // NOTE: do NOT auto-navigate to the driving screen here. This callback
            // also runs during the tutorial (which mounts VisionController), and
            // forcing setScreen('driving') yanked the user out of the tutorial
            // mid-step. Screen transitions are owned by the UI, not this loop.
          } else {
            // 安定化中 - 進捗を表示
            const progressPercent = (stabilityCheck.progress * 100).toFixed(0);
            setDebugInfoThrottled(`${handInfo} | 足を固定してください... ${progressPercent}%`);

            // 初回の場合、キャリブレーション段階を'waiting_for_brake'に設定
            if (currentCalibrationStage === 'idle') {
              setCalibrationStage('waiting_for_brake');
            }
          }
        } else {
          setDebugInfoThrottled(`${handInfo} | 足が検出できません。椅子に座ってください`);
        }
      } else {
        setDebugInfoThrottled(`${handInfo} | 足が検出できません`);
      }
    } else if (currentCalibrationStage === 'calibrated' && currentFootCalibration && currentFootCalibration.isCalibrated) {
      // キャリブレーション完了 - ペダル認識を実行
      if (filteredLandmarks) {
        // 画面が'driving'の場合のみペダル認識を実行
        const screen = useDrivingStore.getState().screen;
        if (screen === 'driving') {
          const recognitionResult = processPedalRecognition(
            filteredLandmarks,
            currentFootCalibration,
            currentPedalState,
            deltaTime
          );

          // キャリブレーションを更新（アクセル踏み込み位置の記録）
          setFootCalibration(recognitionResult.updatedCalibration);

          // ペダル状態を更新
          updatePedalState(recognitionResult.pedalState);

          // デバッグ情報を更新
          const { throttle, brake, isAccelPressed, isBrakePressed } = recognitionResult.pedalState;
          setDebugInfoThrottled(
            `${handInfo} | Accel: ${isAccelPressed ? 'ON' : 'OFF'} (${(throttle * 100).toFixed(0)}%) | ` +
            `Brake: ${isBrakePressed ? 'ON' : 'OFF'} (${(brake * 100).toFixed(0)}%)`
          );
        } else {
          // 運転画面以外ではペダル状態をリセット
          updatePedalState({
            throttle: 0,
            brake: 0,
            isAccelPressed: false,
            isBrakePressed: false,
            brakePressDuration: 0,
            brakePressCount: 0,
          });
          setDebugInfoThrottled(`${handInfo} | キャリブレーション完了`);
        }
      } else {
        setDebugInfoThrottled(`${handInfo} | 足が検出できません`);
      }
    } else {
      setDebugInfoThrottled(handInfo);
    }
  };

  // 状態説明テキストの生成（storeから直接取得して最新の状態を使用）
  const debugInfo = useDrivingStore(state => state.debugInfo);
  const calibrationStage = useDrivingStore(state => state.calibrationStage);
  const pedalState = useDrivingStore(state => state.pedalState);
  const footCalibration = useDrivingStore(state => state.footCalibration);

  // 進捗パーセンテージを抽出
  const getProgressFromDebugInfo = () => {
    const match = debugInfo.match(/(\d+)%/);
    return match ? parseInt(match[1]) : 0;
  };

  const getStatusDisplay = () => {
    if (calibrationStage === 'waiting_for_brake') {
      const progress = getProgressFromDebugInfo();
      return {
        title: '⚠️ 足を固定中...',
        message: `5秒間足を動かさないでください (${progress}%)`,
        color: '#FFFF00',
        bgColor: 'rgba(255, 255, 0, 0.2)'
      };
    } else if (calibrationStage === 'calibrated' && footCalibration?.isCalibrated) {
      if (pedalState.isBrakePressed) {
        return {
          title: '🔴 ブレーキ',
          message: `制動力: ${(pedalState.brake * 100).toFixed(0)}%`,
          color: '#FF0000',
          bgColor: 'rgba(255, 0, 0, 0.2)'
        };
      } else if (pedalState.isAccelPressed) {
        return {
          title: '🟢 アクセル',
          message: `スロットル: ${(pedalState.throttle * 100).toFixed(0)}%`,
          color: '#00FF00',
          bgColor: 'rgba(0, 255, 0, 0.2)'
        };
      } else {
        return {
          title: '⚪ 待機中',
          message: 'ペダル操作なし',
          color: '#FFFFFF',
          bgColor: 'rgba(255, 255, 255, 0.1)'
        };
      }
    } else {
      return {
        title: '📷 カメラ起動中',
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
        {/* videoタグは非表示で裏で動かす */}
        <video ref={videoRef} style={{ display: 'none' }} autoPlay playsInline muted></video>

        {/* カメラ起動失敗時のユーザー向け案内（再試行 + キーボード操作の代替） */}
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
            <div style={{ fontWeight: 'bold', marginBottom: '6px', fontSize: '14px' }}>📷 カメラを利用できません</div>
            <div style={{ marginBottom: '10px' }}>{cameraError}</div>
            <button
              onClick={() => { setCameraError(null); startCamera(); }}
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
            >再試行</button>
          </div>
        )}

        <div style={{
          position: "relative",
          width: "240px",
          height: "180px",
          backgroundColor: "black", // キャンバスの裏地も黒にしておく
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
            <canvas ref={canvasRef} style={{
                width: '100%',
                height: '100%',
                backgroundColor: 'black', // 停止時はここが見える
                transform: 'scaleX(-1)'
            }} />
        </div>

        {/* 状態表示パネル */}
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