"use client";

import { useGLTF } from "@react-three/drei";
import { useState, useEffect, useMemo } from "react";
import { ModelErrorBoundary } from "./ModelErrorBoundary";

export function TrafficLight({ position, rotation = [0, 0, 0], interval = 5000 }: { position: [number, number, number], rotation?: [number, number, number], interval?: number }) {
  const Model = () => {
    const { scene } = useGLTF("/models/traffic_light.glb");
    const clonedScene = useMemo(() => scene.clone(), [scene]);
    return <primitive object={clonedScene} scale={0.5} />;
  };

  const [state, setState] = useState<'red' | 'green' | 'yellow'>('red');

  useEffect(() => {
    const timer = setInterval(() => {
      setState(prev => {
        if (prev === 'green') return 'yellow';
        if (prev === 'yellow') return 'red';
        return 'green';
      });
    }, interval);
    return () => clearInterval(timer);
  }, [interval]);

  const lightColor = state === 'green' ? '#00ff00' : state === 'yellow' ? '#ffff00' : '#ff0000';

  // The traffic light is decorative scenery placed beside the road (x = +/-6),
  // so it must NOT register a scored checkpoint: the car drives down x = 0 and
  // could never reach an x = +/-6 stop zone, which made it count as a missed
  // checkpoint on every run. Red-light running is scored on-path via the
  // signal-violation check (MISSION_CHECKPOINTS['traffic-light']) instead.

  return (
    <group position={position} rotation={rotation as [number, number, number]}>
      <ModelErrorBoundary fallback={
        <mesh position={[0, 2, 0]}>
          <boxGeometry args={[0.5, 4, 0.5]} />
          <meshStandardMaterial color="#333" />
        </mesh>
      }>
        <Model />
      </ModelErrorBoundary>

      {/* Traffic light glow */}
      <mesh position={[0, 3.5, 0.2]}>
        <sphereGeometry args={[0.3]} />
        <meshBasicMaterial color={lightColor} toneMapped={false} />
      </mesh>
      <pointLight position={[0, 3.5, 0.5]} color={lightColor} intensity={3} distance={10} />
    </group>
  );
}