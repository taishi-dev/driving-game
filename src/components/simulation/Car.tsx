"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useRef, useEffect, useMemo } from "react";
import { Vector3, Group } from "three";
import { useDrivingStore, ReplayFrame } from "@/lib/store";
import { checkMissionGoal, MISSION_CHECKPOINTS } from "@/components/simulation/MissionController";
import { getCoursePath } from "@/lib/course";

export function Car({ cameraTarget = "player" }: { cameraTarget?: "player" | "ghost" }) {
  const groupRef = useRef<Group>(null);
  const ghostRef = useRef<Group>(null);
  const { camera } = useThree();

  const {
    steeringAngle: steeringInput,
    throttle: throttleInput,
    brake: brakeInput,
    headRotation,
    setSpeed,
    isPaused,
    isReplaying,
    replayData,
    replayViewMode,
    currentLesson,
    setMissionState,
    setScreen,
    gear,
  } = useDrivingStore();

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

  // Replay state
  const replayIndex = useRef(0);
  const ghostDist = useRef(0);

  // Checkpoint Logic
  const clearedCheckpoints = useRef<Set<string>>(new Set());
  const dataCheckpoints = useRef(MISSION_CHECKPOINTS[currentLesson] || []);

  // Get Course Path for Ghost Car
  const coursePath = useMemo(() => getCoursePath(currentLesson as any), [currentLesson]);
  const courseLength = useMemo(() => {
    const len = coursePath.getLength?.() ?? 0;
    return Number.isFinite(len) && len > 0.0001 ? len : 0;
  }, [coursePath]);

  // Reset on lesson change + free-mode spawn
  useEffect(() => {
    clearedCheckpoints.current.clear();
    dataCheckpoints.current = MISSION_CHECKPOINTS[currentLesson] || [];

    // 走行状態をリセット（混ざるの防止）
    speed.current = 0;
    replayIndex.current = 0;
    ghostDist.current = 0;
    recordedFrames.current = [];

    if (groupRef.current) {
      if (currentLesson === "free-mode") {
        // 街（position={[5,0,-100]}）の近くに出す
        groupRef.current.position.set(5, 0, -95);
        groupRef.current.rotation.set(0, Math.PI, 0);
      } else {
        groupRef.current.position.set(0, 0, 0);
        groupRef.current.rotation.set(0, 0, 0);
      }
    }
  }, [currentLesson]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;
    if (isPaused) return;

    // Ensure camera is upright
    camera.up.set(0, 1, 0);

    // --- REPLAY MODE ---
    if (isReplaying) {
      if (replayData.length === 0) return;

      if (replayIndex.current < replayData.length) {
        const frame = replayData[replayIndex.current];

        // Update Player Car
        groupRef.current.position.set(frame.position[0], frame.position[1], frame.position[2]);
        groupRef.current.rotation.set(frame.rotation[0], frame.rotation[1], frame.rotation[2]);

        // Update Ghost Car (Ideal Path) - free-mode では無効
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

        // Camera Logic (Replay)
        if (replayViewMode === "driver") {
          const targetGroup = cameraTarget === "ghost" ? ghostRef.current : groupRef.current;

          if (targetGroup) {
            const camOffset = new Vector3(0.35, 1.28, 0.4);
            camOffset.applyEuler(targetGroup.rotation);
            const camPos = targetGroup.position.clone().add(camOffset);

            camera.position.lerp(camPos, 0.5);

            let baseLookTarget;
            if (cameraTarget === "ghost") {
              const forward = new Vector3(0, 0, -1).applyEuler(targetGroup.rotation);
              baseLookTarget = targetGroup.position.clone().add(forward.multiplyScalar(10));
            } else {
              const recordedHead = frame.headRotation || { pitch: 0, yaw: 0, roll: 0 };
              const forward = new Vector3(0, 0, -1).applyEuler(targetGroup.rotation);
              baseLookTarget = targetGroup.position.clone().add(forward.multiplyScalar(10));

              const right = new Vector3(1, 0, 0).applyEuler(targetGroup.rotation);
              baseLookTarget.add(right.multiplyScalar(recordedHead.yaw * 5));
              baseLookTarget.y += recordedHead.pitch * 5;
            }

            camera.lookAt(baseLookTarget);
          }
        } else {
          const targetGroup = groupRef.current;
          const camPos = targetGroup.position.clone().add(new Vector3(0, 4, 8).applyEuler(targetGroup.rotation));
          camera.position.lerp(camPos, 0.1);
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

    // 1. Calculate Speed
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

    setSpeed(Math.abs(speed.current) * 100);

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
      
      const turnDir = direction; // Use direction again to invert rotation when reversing for natural feel (steering left backs you into left spot)
                                 // Wait, if I back up and turn Wheel Left:
                                 // Front wheels point Left.
                                 // Car describes a circle to its Left.
                                 // The Rear moves Left? No, the Front swings Right? 
                                 // If I turn Wheel Left (CCW), and move Forward: Car turns Left (CCW).
                                 // If I turn Wheel Left (CCW), and move Backward: 
                                 //  The car follows the same circle radius?
                                 //  Yes. The arc is the same.
                                 //  Moving Forward along arc -> Yaw changes +CCW.
                                 //  Moving Backward along arc -> Yaw changes -CCW (CW)?
                                 //  Let's simulate:
                                 //  Car at (0,0), rot=0. Wheel Left.
                                 //  Forward step: Pos becomes (-d, d), Rot becomes +delta.
                                 //  Backward step: Pos becomes (+d, -d)? No.
                                 //  Geometrically, backing up with Left Wheel means the Rear goes to the Left of the driver?
                                 //  No, "Backing to the Left" usually means "Backing into a spot on the left".
                                 //  To do that, you turn wheel... Left?
                                 //  If I want the tail to go Left:
                                 //  Steering Left -> Front wheels point Left.
                                 //  Back up -> Front swings Right? Tail swings Left?
                                 //  Actually, Steering Left means Center of Curvature is on the Left.
                                 //  Backing up simply moves you along the circle CW?
                                 //  Moving Forward CCW. Moving Backward CW.
                                 //  So yes, Yaw Rotation direction IS inverted relative to Wheel angle.
                                 //  Wheel + (Left): Speed + -> Rot +.
                                 //  Wheel + (Left): Speed - (Back) -> Rot -.
      
      groupRef.current.rotation.y -= boostedSteering * turnSpeed * (speed.current / maxSpeed) * 3.0 * direction;
    }

    // 3. Move
    const forward = new Vector3(0, 0, -1);
    forward.applyEuler(groupRef.current.rotation);
    // Apply direction here
    // FIX: Do NOT modify 'forward' in place, as it is used later for camera lookAt!
    // clone() is not needed if we just multiply a clone or create a new movement vector.
    const movement = forward.clone().multiplyScalar(speed.current * direction);
    groupRef.current.position.add(movement);

    // free-mode ではミッション判定を一切しない
    if (!isFreeMode) {
      // CHECK GOAL
      if (checkMissionGoal(currentLesson, groupRef.current.position)) {
        const frames = recordedFrames.current;
        useDrivingStore.setState({ replayData: frames });

        setMissionState("success");
        setScreen("feedback");
        return;
      }

      // CHECK INTERMEDIATE CHECKPOINTS
      const checkpoints = dataCheckpoints.current;
      checkpoints.forEach((cp) => {
        if (clearedCheckpoints.current.has(cp.id)) return;

        const dx = groupRef.current!.position.x - cp.position[0];
        const dz = groupRef.current!.position.z - cp.position[2];
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist < cp.radius) {
          if (cp.type === "stop") {
            if (Math.abs(speed.current) < 0.05) {
              clearedCheckpoints.current.add(cp.id);
              useDrivingStore.getState().setDrivingFeedback("🛑 一時停止 OK!");
              setTimeout(() => useDrivingStore.getState().setDrivingFeedback(null), 2000);
            }
          } else if (cp.type === "mirror") {
            const needed = cp.targetYaw || 0;
            const tolerance = cp.yawTolerance || 0.5;
            const currentYaw = headRotation.yaw;

            if (Math.abs(currentYaw - needed) < tolerance) {
              clearedCheckpoints.current.add(cp.id);
              const label = needed > 0 ? "左確認" : "右確認";
              useDrivingStore.getState().setDrivingFeedback(`👀 ${label} OK!`);
              setTimeout(() => useDrivingStore.getState().setDrivingFeedback(null), 2000);
            }
          }
        }
      });
    }

    // 4. Record Frame（free-modeでも録画してOK）
    recordedFrames.current.push({
      timestamp: Date.now(),
      position: groupRef.current.position.toArray() as [number, number, number],
      rotation: groupRef.current.rotation.toArray() as [number, number, number],
      steering: steeringInput,
      speed: Math.abs(speed.current) * 100,
      headRotation: { ...headRotation },
    });

    // 5. Camera (First Person)
    const camOffset = new Vector3(0.35, 1.28, 0.4);
    camOffset.applyEuler(groupRef.current.rotation);
    const camPos = groupRef.current.position.clone().add(camOffset);

    camera.position.lerp(camPos, 0.5);

    // Head Rotation
    const lookAtDist = 10;
    // Base Look Target: Always 10 units in FRONT of the car (local -Z)
    // Even when reversing, we look "Forward" relative to the driver's seat.
    const baseLookTarget = groupRef.current.position.clone().add(forward.normalize().multiplyScalar(lookAtDist));
    
    // Add Head Rotation (Yaw/Pitch)
    const right = new Vector3(1, 0, 0).applyEuler(groupRef.current.rotation);
    baseLookTarget.add(right.multiplyScalar(headRotation.yaw * 5));
    baseLookTarget.y += headRotation.pitch * 5;

    camera.lookAt(baseLookTarget);
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

        {showDriverView && <CarVisuals steeringInput={steeringInput} />}
        
        
        {/* Rearview Mirror Removed as per user request */}
      </group>

      {/* Ghost Car (Only in Replay) - free-mode では表示しない */}
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

export function CarVisuals({ steeringInput }: { steeringInput: number }) {
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
