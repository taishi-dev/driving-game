"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useEffect, useMemo } from "react";
import { Vector3, Group } from "three";
import { useDrivingStore, ReplayFrame } from "@/lib/store";
import { checkMissionGoal } from "@/components/simulation/MissionController";
import { getCoursePath } from "@/lib/course";

// Reused scratch vectors for the per-frame camera/movement math so useFrame
// never allocates. Module-level (not per-instance) is safe even though the
// feedback screen mounts two Cars concurrently: useFrame callbacks are fully
// synchronous with no await/yield, so they never interleave — each callback
// overwrites (.set/.copy) and consumes every scratch before the next runs.
const _camOffset = new Vector3();
const _camPos = new Vector3();
const _forward = new Vector3();
const _movement = new Vector3();
const _lookTarget = new Vector3();
const _right = new Vector3();

export function Car({ cameraTarget = "player" }: { cameraTarget?: "player" | "ghost" }) {
  const groupRef = useRef<Group>(null);
  const ghostRef = useRef<Group>(null);
  const { camera } = useThree();

  // Reactive subscriptions: ONLY values actually read during render. Everything
  // else (high-frequency inputs and actions) is read via useDrivingStore.getState()
  // inside useFrame so that per-frame store writes never re-render this component
  // (Car is the heaviest subtree in the scene).
  const currentLesson = useDrivingStore((s) => s.currentLesson);
  const isReplaying = useDrivingStore((s) => s.isReplaying);
  const replayViewMode = useDrivingStore((s) => s.replayViewMode);

  const isFreeMode = currentLesson === "free-mode";

  // Physics state
  const speed = useRef(0);
  const maxSpeed = 1.5;
  const acceleration = 0.01;
  const friction = 0.005;
  const turnSpeed = 0.05;
  const creepSpeed = 0.15;

  // Recording state
  const recordedFrames = useRef<ReplayFrame[]>([]);

  // Last speed value pushed to the store (rounded km/h). Used to avoid writing
  // setSpeed on every frame — we only write when the displayed value changes.
  const lastDisplaySpeed = useRef(-1);

  // Replay state
  const replayIndex = useRef(0);
  const ghostDist = useRef(0);

  // Checkpoint Logic (Local Ref)
  const clearedCheckpoints = useRef<Set<string>>(new Set());
  
  // Added: holds the state of the left/right safety check
  const safetyCheckState = useRef({ lookedLeft: false, lookedRight: false });

  // Get Course Path for Ghost Car
  const coursePath = useMemo(() => getCoursePath(currentLesson), [currentLesson]);
  const courseLength = useMemo(() => {
    const len = coursePath.getLength?.() ?? 0;
    return Number.isFinite(len) && len > 0.0001 ? len : 0;
  }, [coursePath]);

  // Reset on lesson change
  useEffect(() => {
    clearedCheckpoints.current.clear();
    useDrivingStore.getState().resetClearedCheckpoints(); // Also reset the cleared list on the store side
    safetyCheckState.current = { lookedLeft: false, lookedRight: false };

    speed.current = 0;
    replayIndex.current = 0;
    ghostDist.current = 0;
    recordedFrames.current = [];

    if (groupRef.current) {
      if (currentLesson === "free-mode") {
        groupRef.current.position.set(5, 0, -95);
        groupRef.current.rotation.set(0, Math.PI, 0);
      } else {
        groupRef.current.position.set(0, 0, 0);
        groupRef.current.rotation.set(0, 0, 0);
      }
    }
  }, [currentLesson]);

  useFrame(() => {
    if (!groupRef.current) return;

    // Read the latest store state directly (no React subscription) so that
    // per-frame input writes don't re-render Car.
    const store = useDrivingStore.getState();
    if (store.isPaused) return;

    const {
      steeringAngle: steeringInput,
      throttle: throttleInput,
      brake: brakeInput,
      headRotation,
      isReplaying,
      replayData,
      replayViewMode,
      gear,
      activeCheckpoints,
      setSpeed,
      setMissionState,
      setScreen,
      addClearedCheckpoint,
      calculateMissionResult,
    } = store;

    // Ensure camera is upright
    camera.up.set(0, 1, 0);

    // --- REPLAY MODE ---
    if (isReplaying) {
      if (replayData.length === 0) return;
      if (replayIndex.current < replayData.length) {
         const frame = replayData[replayIndex.current];
         groupRef.current.position.set(frame.position[0], frame.position[1], frame.position[2]);
         groupRef.current.rotation.set(frame.rotation[0], frame.rotation[1], frame.rotation[2]);
         
         if (!isFreeMode && ghostRef.current && courseLength > 0) {
             let targetSpeed = 0.25;
             if (currentLesson === "left-turn" || currentLesson === "right-turn") {
               if (ghostDist.current > 45 && ghostDist.current < 70) targetSpeed = 0.1;
             } else if (currentLesson === "s-curve" || currentLesson === "crank") {
               targetSpeed = 0.08;
             }
             ghostDist.current += targetSpeed;
             const t = Math.min(ghostDist.current / courseLength, 1);
             const point = coursePath.getPointAt(t);
             const tangent = coursePath.getTangentAt(t);
             ghostRef.current.position.set(point.x, point.y, point.z);
             ghostRef.current.rotation.set(0, Math.atan2(tangent.x, tangent.z) + Math.PI, 0);
         }
         
         if (replayViewMode === "driver") {
            const targetGroup = cameraTarget === "ghost" ? ghostRef.current : groupRef.current;
            if (targetGroup) {
                _camOffset.set(0.35, 1.28, 0.4).applyEuler(targetGroup.rotation);
                _camPos.copy(targetGroup.position).add(_camOffset);
                camera.position.lerp(_camPos, 0.5);
                if (cameraTarget === "ghost") {
                    _forward.set(0, 0, -1).applyEuler(targetGroup.rotation);
                    _lookTarget.copy(targetGroup.position).add(_forward.multiplyScalar(10));
                } else {
                    const recordedHead = frame.headRotation || { pitch: 0, yaw: 0, roll: 0 };
                    _forward.set(0, 0, -1).applyEuler(targetGroup.rotation);
                    _lookTarget.copy(targetGroup.position).add(_forward.multiplyScalar(10));
                    _right.set(1, 0, 0).applyEuler(targetGroup.rotation);
                    _lookTarget.add(_right.multiplyScalar(recordedHead.yaw * 5));
                    _lookTarget.y += recordedHead.pitch * 5;
                }
                camera.lookAt(_lookTarget);
            }
         } else {
            const targetGroup = groupRef.current;
            _camOffset.set(0, 4, 8).applyEuler(targetGroup.rotation);
            _camPos.copy(targetGroup.position).add(_camOffset);
            camera.position.lerp(_camPos, 0.1);
            camera.lookAt(targetGroup.position);
         }
         replayIndex.current++;
      } else {
        replayIndex.current = 0;
        ghostDist.current = 0;
      }
      return;
    }

    // --- DRIVING MODE ---
    if (throttleInput > 0) {
      speed.current += (maxSpeed * throttleInput - speed.current) * acceleration;
    } else if (brakeInput > 0) {
      speed.current -= brakeInput * 0.05;
      if (speed.current < 0) speed.current = 0;
    } else {
      if (speed.current < creepSpeed) {
        speed.current += 0.001;
      } else {
        speed.current -= friction;
        if (speed.current < creepSpeed) speed.current = creepSpeed;
      }
    }
    // Telemetry: only write to the store when the displayed (rounded) km/h
    // actually changes, instead of every frame. The speedometer reads a rounded
    // value anyway, so this avoids waking up speed subscribers on every frame.
    const displaySpeed = Math.round(Math.abs(speed.current) * 100);
    if (displaySpeed !== lastDisplaySpeed.current) {
      lastDisplaySpeed.current = displaySpeed;
      setSpeed(displaySpeed);
    }

    // Gear Direction Logic
    const direction = gear === "R" ? -1 : 1;

    // 2. Steering
    if (Math.abs(speed.current) > 0.001) {
      const curvePower = 1.8;
      const curvedInput = Math.sign(steeringInput) * Math.pow(Math.abs(steeringInput), curvePower);
      const boostedSteering = curvedInput * 8.0;
      // In reverse, steering feel is often inverted (or just feels different), 
      // but physically if you turn wheels right, car goes 'back-right', which rotates body 'left' relative to forward.
      // Standard car physics: Yaw change ~ Speed * curvature * direction.
      // If speed is positive magnitude, and we move backwards, the yaw change reverses sign?
      // Let's stick to simple physics: Rotate body by steering * speed.
      // If moving backward (direction = -1), steering effects are reversed?
      // Actually usually steering angle defines circle. 
      // Let's invert turn direction if reversing for natural feel (or keep it and rely on users brain).
      // Usually: Backing up + Steering Left -> Rear goes Left -> Car rotates CCW (same as forward left).
      // Wait. Forward + Left -> Front goes Left -> CCW.
      // Backward + Left -> Rear goes Left -> CW?  
      // Let's try reversing rotation sign when reversing.
      
      // Standard car physics: Yaw change ~ Speed * curvature * direction.
      // Actually, regardless of gear, if you turn wheels LEFT, the car rotates LEFT (CCW).
      // (Forward -> Left Turn, Backward -> Tail swings Left -> Car rotates Left/CCW).
      // So we do NOT invert rotation based on gear.
      
      groupRef.current.rotation.y -= boostedSteering * turnSpeed * (speed.current / maxSpeed) * 3.0 * direction;
    }

    _forward.set(0, 0, -1).applyEuler(groupRef.current.rotation);
    // Move along a copy so _forward is preserved for the camera lookAt below.
    _movement.copy(_forward).multiplyScalar(speed.current * direction);
    groupRef.current.position.add(_movement);

    if (!isFreeMode) {
      if (checkMissionGoal(currentLesson, groupRef.current.position)) {
        const frames = recordedFrames.current;
        useDrivingStore.setState({ replayData: frames });

        // Added: run scoring here when the goal is reached (uncleared checkpoints remain in the log)
        calculateMissionResult(coursePath);

        setMissionState("success");
        setScreen("feedback");
        return;
      }

      // Fixed: use activeCheckpoints (the dynamic list) for the check
      activeCheckpoints.forEach((cp) => {
        if (clearedCheckpoints.current.has(cp.id)) return;

        const dx = groupRef.current!.position.x - cp.position[0];
        const dz = groupRef.current!.position.z - cp.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);

        // When entering the range
        if (dist < cp.radius) {

          // [A] Stop
          if (cp.type === "stop") {
            if (Math.abs(speed.current) < 0.02) { // Speed check
              clearedCheckpoints.current.add(cp.id);
              addClearedCheckpoint(cp.id); // Report to the store
              useDrivingStore.getState().setDrivingFeedback(
                useDrivingStore.getState().language === 'en' ? '🛑 Stop OK!' : `🛑 ${cp.label || '一時停止'} OK!`
              );
              setTimeout(() => useDrivingStore.getState().setDrivingFeedback(null), 2000);
            }
          } 
          
          // [B] Mirror check / left-right check (safety-check)
          else if (cp.type === "mirror" || cp.type === "safety-check") {
            if (cp.type === "safety-check") {
               const yaw = headRotation.yaw;
               // Count it as looked if it exceeds 0.3 radians (about 17 degrees)
               if (yaw > 0.3) safetyCheckState.current.lookedLeft = true;
               if (yaw < -0.3) safetyCheckState.current.lookedRight = true;

               if (safetyCheckState.current.lookedLeft && safetyCheckState.current.lookedRight) {
                  clearedCheckpoints.current.add(cp.id);
                  addClearedCheckpoint(cp.id); // Report to the store
                  useDrivingStore.getState().setDrivingFeedback(
                    useDrivingStore.getState().language === 'en' ? '👀 Left-Right Check OK!' : `👀 ${cp.label || '安全確認'} OK!`
                  );
                  safetyCheckState.current = { lookedLeft: false, lookedRight: false };
                  setTimeout(() => useDrivingStore.getState().setDrivingFeedback(null), 2000);
               }
            } else {
               // Conventional mirror logic
               const needed = cp.targetYaw || 0;
               const tolerance = 0.5;
               const currentYaw = headRotation.yaw;
               if (Math.abs(currentYaw - needed) < tolerance) {
                 clearedCheckpoints.current.add(cp.id);
                 addClearedCheckpoint(cp.id); // Report to the store
                 useDrivingStore.getState().setDrivingFeedback(`👀 Check OK!`);
                 setTimeout(() => useDrivingStore.getState().setDrivingFeedback(null), 2000);
               }
            }
          }
        } else {
            // Reset once the area is passed (safety-check only)
            if (cp.type === 'safety-check' && dist > cp.radius + 2) {
                 safetyCheckState.current = { lookedLeft: false, lookedRight: false };
            }
        }
      });
    }

    // 4. Record Frame
    recordedFrames.current.push({
      timestamp: Date.now(),
      position: groupRef.current.position.toArray() as [number, number, number],
      rotation: groupRef.current.rotation.toArray() as [number, number, number],
      steering: steeringInput,
      speed: Math.abs(speed.current) * 100,
      headRotation: { ...headRotation },
    });

    // 5. Camera (First Person)
    _camOffset.set(0.35, 1.28, 0.4).applyEuler(groupRef.current.rotation);
    _camPos.copy(groupRef.current.position).add(_camOffset);

    camera.position.lerp(_camPos, 0.5);

    const lookAtDist = 10;
    // Base Look Target: Always 10 units in FRONT of the car (local -Z)
    // Even when reversing, we look "Forward" relative to the driver's seat.
    _lookTarget.copy(groupRef.current.position).add(_forward.normalize().multiplyScalar(lookAtDist));

    // Add Head Rotation (Yaw/Pitch)
    _right.set(1, 0, 0).applyEuler(groupRef.current.rotation);
    _lookTarget.add(_right.multiplyScalar(headRotation.yaw * 5));
    _lookTarget.y += headRotation.pitch * 5;

    camera.lookAt(_lookTarget);
  });

  const showDriverView = !isReplaying || (isReplaying && replayViewMode === "driver");
  
  return (
    <>
      {/* Player Car */}
      <group ref={groupRef} position={[0, 0, 0]}>
        {showDriverView ? (
          <group rotation={[0, Math.PI, 0]}>
            <ExternalCarVisuals hideCabin />
          </group>
        ) : (
          <group rotation={[0, Math.PI, 0]}>
            <ExternalCarVisuals />
          </group>
        )}
        {showDriverView && <CarVisuals />}
        
        
        {/* Rearview Mirror Removed as per user request */}
      </group>

      {/* Ghost Car */}
      {isReplaying && !isFreeMode && (
        <group ref={ghostRef} position={[0, 0, 0]}>
          <group rotation={[0, Math.PI, 0]}>
            <ExternalCarVisuals isGhost />
          </group>
        </group>
      )}
    </>
  );
}

export function CarVisuals() {
  // Subscribe to steering here (a small leaf component) rather than in Car, so
  // that high-frequency steering changes only re-render the steering wheel mesh.
  const steeringInput = useDrivingStore((s) => s.steeringAngle);

  return (
    <group rotation={[0, Math.PI, 0]}>
      <mesh position={[0, 1.1, -0.25]} rotation={[0.35, 0, 0]}>
        <planeGeometry args={[1.8, 0.9]} />
        <meshStandardMaterial color="#aaddee" opacity={0.1} transparent roughness={0} metalness={0.9} />
      </mesh>

      {/* Steering Wheel */}
      <group position={[0.35, 0.55, -0.35]} rotation={[-0.35, 0, 0]}>
        <group rotation={[0, 0, steeringInput * 2.5]}>
          <mesh>
            <torusGeometry args={[0.19, 0.02, 16, 48]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.4} />
          </mesh>
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.06, 0.06, 0.04, 32]} />
            <meshStandardMaterial color="#222" />
          </mesh>
          <mesh position={[0, -0.1, 0]}>
            <boxGeometry args={[0.03, 0.18, 0.02]} />
            <meshStandardMaterial color="#333" metalness={0.5} />
          </mesh>
          <mesh position={[-0.1, 0.02, 0]} rotation={[0, 0, 1.3]}>
            <boxGeometry args={[0.03, 0.18, 0.02]} />
            <meshStandardMaterial color="#333" />
          </mesh>
          <mesh position={[0.1, 0.02, 0]} rotation={[0, 0, -1.3]}>
            <boxGeometry args={[0.03, 0.18, 0.02]} />
            <meshStandardMaterial color="#333" />
          </mesh>
        </group>

        <mesh position={[0, 0, -0.1]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.04, 0.04, 0.2, 16]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>
    </group>
  );
}

export function ExternalCarVisuals({
  isGhost = false,
  hideCabin = false,
}: {
  isGhost?: boolean;
  hideCabin?: boolean;
}) {
  const bodyColor = isGhost ? "#60a5fa" : "#334155";
  const cabinColor = isGhost ? "#93c5fd" : "#1e293b";
  const opacity = isGhost ? 0.3 : 1.0;
  const transparent = isGhost;

  return (
    <group>
      {/* Chassis */}
      <mesh position={[0, 0.4, 0]} castShadow={!isGhost} receiveShadow={!isGhost}>
        <boxGeometry args={[1.8, 0.6, 4]} />
        <meshStandardMaterial color={bodyColor} metalness={0.6} roughness={0.4} transparent={transparent} opacity={opacity} />
      </mesh>

      {/* Cabin */}
      {!hideCabin && (
        <mesh position={[0, 1.0, -0.2]} castShadow={!isGhost} receiveShadow={!isGhost}>
          <boxGeometry args={[1.4, 0.7, 2]} />
          <meshStandardMaterial color={cabinColor} metalness={0.1} roughness={0.1} transparent={transparent} opacity={opacity} />
        </mesh>
      )}

      {/* Hood */}
      <mesh position={[0, 0.71, 1.2]} rotation={[0.1, 0, 0]}>
        <boxGeometry args={[1.5, 0.05, 1.4]} />
        <meshStandardMaterial color={isGhost ? bodyColor : "#475569"} transparent={transparent} opacity={opacity} />
      </mesh>

      {/* Headlights */}
      <mesh position={[-0.6, 0.5, 2.05]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={isGhost ? 0.5 : 2} toneMapped={false} transparent={transparent} opacity={opacity} />
      </mesh>
      <mesh position={[0.6, 0.5, 2.05]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={isGhost ? 0.5 : 2} toneMapped={false} transparent={transparent} opacity={opacity} />
      </mesh>

      {/* Taillights */}
      <mesh position={[-0.6, 0.6, -2.05]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={isGhost ? 0.5 : 2} toneMapped={false} transparent={transparent} opacity={opacity} />
      </mesh>
      <mesh position={[0.6, 0.6, -2.05]}>
        <boxGeometry args={[0.3, 0.2, 0.1]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={isGhost ? 0.5 : 2} toneMapped={false} transparent={transparent} opacity={opacity} />
      </mesh>

      {/* Wheels */}
      <Wheel position={[-0.8, 0.35, 1.2]} isGhost={isGhost} />
      <Wheel position={[0.8, 0.35, 1.2]} isGhost={isGhost} />
      <Wheel position={[-0.8, 0.35, -1.2]} isGhost={isGhost} />
      <Wheel position={[0.8, 0.35, -1.2]} isGhost={isGhost} />

      {/* Underglow */}
      {!isGhost && <pointLight position={[0, 0.1, 0]} color="#3b82f6" intensity={2} distance={5} decay={2} />}
    </group>
  );
}

function Wheel({ position, isGhost }: { position: [number, number, number]; isGhost?: boolean }) {
  const tireColor = isGhost ? "#60a5fa" : "#171717";
  const rimColor = isGhost ? "#93c5fd" : "#94a3b8";
  const opacity = isGhost ? 0.3 : 1.0;
  const transparent = isGhost;

  return (
    <group position={position}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow={!isGhost}>
        <cylinderGeometry args={[0.35, 0.35, 0.3, 32]} />
        <meshStandardMaterial color={tireColor} roughness={0.8} transparent={transparent} opacity={opacity} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]} position={[0.16, 0, 0]}>
        <cylinderGeometry args={[0.2, 0.2, 0.05, 16]} />
        <meshStandardMaterial color={rimColor} metalness={0.8} roughness={0.2} transparent={transparent} opacity={opacity} />
      </mesh>
    </group>
  );
}