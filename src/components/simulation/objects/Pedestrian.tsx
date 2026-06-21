"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef, useMemo } from "react";
import { Group } from "three";
import { ModelErrorBoundary } from "./ModelErrorBoundary";

// Added so it can accept a scale
export function Pedestrian({ 
  startPos, 
  endPos, 
  speed = 0.03, 
  scale = 1 
}: { 
  startPos: [number, number, number], 
  endPos: [number, number, number], 
  speed?: number, 
  scale?: number 
}) {
  const groupRef = useRef<Group>(null);
  const direction = useRef(1);
  const progress = useRef(0);

  useFrame(() => {
    if (!groupRef.current) return;
    progress.current += speed * direction.current * 0.1;

    if (progress.current >= 1) {
      progress.current = 1;
      direction.current = -1;
      groupRef.current.rotation.y = Math.atan2(startPos[0] - endPos[0], startPos[2] - endPos[2]);
    } else if (progress.current <= 0) {
      progress.current = 0;
      direction.current = 1;
      groupRef.current.rotation.y = Math.atan2(endPos[0] - startPos[0], endPos[2] - startPos[2]);
    }

    const x = startPos[0] + (endPos[0] - startPos[0]) * progress.current;
    const z = startPos[2] + (endPos[2] - startPos[2]) * progress.current;
    groupRef.current.position.set(x, startPos[1], z);
  });

  const Model = () => {
    const { scene } = useGLTF("/models/women.glb");
    const clonedScene = useMemo(() => scene.clone(), [scene]);
    // The model's own scale could be adjusted here, but in this case we control it via the parent group
    return <primitive object={clonedScene} scale={0.5} />; 
  };

  return (
    // Apply the scale here
    <group ref={groupRef} position={startPos} scale={scale}>
      <ModelErrorBoundary fallback={
        <mesh position={[0, 0.8, 0]}>
          <capsuleGeometry args={[0.3, 1, 4]} />
          <meshStandardMaterial color="blue" />
        </mesh>
      }>
        <Model />
      </ModelErrorBoundary>
    </group>
  );
}