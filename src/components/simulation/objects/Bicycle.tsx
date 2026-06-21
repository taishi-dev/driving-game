"use client";

import { useGLTF } from "@react-three/drei";
import { useMemo } from "react";
import { ModelErrorBoundary } from "./ModelErrorBoundary";

export function Bicycle({ position, rotation = [0, 0, 0], scale = 1 }: { position: [number, number, number], rotation?: [number, number, number], scale?: number, color?: string }) {
  
  // モデルファイルを読み込むコンポーネント
  const Model = () => {
    // ★ここで public/models/bicycle.glb を読み込みます
    const { scene } = useGLTF("/models/bicycle.glb");
    const clonedScene = useMemo(() => scene.clone(), [scene]);
    return <primitive object={clonedScene} />;
  };

  return (
    <group position={position} rotation={rotation as [number, number, number]} scale={scale}>
      <ModelErrorBoundary fallback={
        // 万が一ファイルがない時用の代わりの箱
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.5, 1, 1.5]} />
          <meshStandardMaterial color="red" />
        </mesh>
      }>
        <Model />
      </ModelErrorBoundary>
    </group>
  );
}