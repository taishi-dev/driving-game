"use client";

import { useGLTF } from "@react-three/drei";
import { ThreeElements } from "@react-three/fiber";
import { Euler } from "three";

type ThreeModelLoaderProps = ThreeElements["group"] & {
  /** Path to the glTF / glb model to load */
  url: string;
  scale?: number | [number, number, number];
  rotation?: Euler | [number, number, number];
};

export function ThreeModelLoader({
  url,
  scale = 1,
  rotation = [0, 0, 0],
  ...props
}: ThreeModelLoaderProps) {
  const { scene } = useGLTF(url);

  return (
    <group scale={scale} rotation={rotation} {...props}>
      <primitive object={scene} />
    </group>
  );
}
