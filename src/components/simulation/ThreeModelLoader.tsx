"use client";

import { useGLTF } from "@react-three/drei";
import { ThreeElements } from "@react-three/fiber";
import { useEffect } from "react";
import { Euler, Mesh } from "three";

type ThreeModelLoaderProps = ThreeElements["group"] & {
  /** Path to the glTF / glb model to load */
  url: string;
  scale?: number | [number, number, number];
  rotation?: Euler | [number, number, number];
  /** Whether the model's meshes cast/receive shadows (default true). */
  castShadow?: boolean;
  receiveShadow?: boolean;
};

export function ThreeModelLoader({
  url,
  scale = 1,
  rotation = [0, 0, 0],
  castShadow = true,
  receiveShadow = true,
  ...props
}: ThreeModelLoaderProps) {
  const { scene } = useGLTF(url);

  // GLTF meshes default to castShadow/receiveShadow = false, so loaded models
  // are invisible to the scene's shadow map until we opt them in. Done in an
  // effect (a scene-graph side effect, not a render-time mutation) on the cached
  // scene; idempotent, so re-runs are harmless.
  useEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
      }
    });
  }, [scene, castShadow, receiveShadow]);

  return (
    <group scale={scale} rotation={rotation} {...props}>
      <primitive object={scene} />
    </group>
  );
}
