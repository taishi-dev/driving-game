"use client";

import { useDrivingStore } from "@/lib/store";
import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import * as THREE from "three";

export function GoalEffects() {
  const missionState = useDrivingStore((state) => state.missionState);

  if (missionState !== 'success') return null;

  return <Confetti />;
}

function Confetti() {
  const count = 200;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dataRef = useRef<{ pos: Float32Array; vel: Float32Array } | null>(null);

  // Generate random initial state once, after mount (not during render).
  useEffect(() => {
    const pos = new Float32Array(count * 3);
    const vel = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 20;
      pos[i * 3 + 1] = 5 + Math.random() * 10;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 20;
      vel[i * 3] = (Math.random() - 0.5) * 0.2;
      vel[i * 3 + 1] = -0.05 - Math.random() * 0.1;
      vel[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
    }
    dataRef.current = { pos, vel };
  }, []);

  const dummyRef = useRef(new THREE.Object3D());

  useFrame(({ clock }) => {
    const data = dataRef.current;
    if (!meshRef.current || !data) return;
    const { pos, vel } = data;
    const t = clock.getElapsedTime();
    const dummy = dummyRef.current;
    for (let i = 0; i < count; i++) {
      pos[i * 3] += vel[i * 3];
      pos[i * 3 + 1] += vel[i * 3 + 1];
      pos[i * 3 + 2] += vel[i * 3 + 2];
      if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 10 + (i % 5);
      pos[i * 3] += Math.sin(t + i) * 0.01;
      dummy.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      dummy.rotation.x += 0.1;
      dummy.rotation.y += 0.1;
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <planeGeometry args={[0.2, 0.2]} />
      <meshBasicMaterial side={THREE.DoubleSide} />
    </instancedMesh>
  );
}
