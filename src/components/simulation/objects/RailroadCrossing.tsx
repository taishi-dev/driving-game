"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { ModelErrorBoundary } from "./ModelErrorBoundary";
import { useRegisterCheckpoint } from "@/hooks/useRegisterCheckpoint";

export function RailroadCrossing({ position, rotation = [0, 0, 0], scale = 1 }: { position: [number, number, number], rotation?: [number, number, number], scale?: number }) {
  
  const Model = () => {
    const { scene } = useGLTF("/models/railroad_crossing.glb");
    const clonedScene = useMemo(() => scene.clone(), [scene]);
    return <primitive object={clonedScene} />;
  };

  // Register the scored stop ON the driving path (x = 0) at the crossing's depth.
  // The crossing model sits beside the road, but the car drives down x = 0, so a
  // checkpoint at the model's x would be unreachable and count as missed every run.
  useRegisterCheckpoint({
    position: [0, 0, position[2]],
    radius: 5.0,
    type: 'stop',
    label: 'Railroad Crossing Stop'
  });

  return (
    <group position={position} rotation={rotation as [number, number, number]} scale={scale}>
      <ModelErrorBoundary fallback={
        <mesh position={[0, 1.5, 0]}>
          <cylinderGeometry args={[0.1, 0.1, 3, 16]} />
          <meshStandardMaterial color="#fbbf24" />
        </mesh>
      }>
        <Model />
      </ModelErrorBoundary>
    </group>
  );
}