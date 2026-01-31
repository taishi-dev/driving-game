import { useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

export function RearviewMirror({ position }: { position: [number, number, number] }) {
  const { gl, scene, camera } = useThree();
  const fbo = useFBO(512, 128); // Wide aspect ratio for mirror
  const mirrorCamera = useRef<THREE.PerspectiveCamera>(null);
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(() => {
    if (!mirrorCamera.current || !meshRef.current) return;

    // 1. Sync mirror camera position with main camera (player head)
    mirrorCamera.current.position.copy(camera.position);
    
    // 2. Adjust rotation to look backward
    // Main camera looks forward. Mirror camera should look exactly opposite.
    // We can copy rotation and rotate Y by PI (180 deg).
    mirrorCamera.current.rotation.copy(camera.rotation);
    mirrorCamera.current.rotation.y += Math.PI;
    
    // 3. Render scene to FBO
    // Hide the mirror mesh itself to prevent "mirror in mirror" recursion
    meshRef.current.visible = false;
    
    // Explicitly set target to FBO
    gl.setRenderTarget(fbo);
    gl.render(scene, mirrorCamera.current);
    
    // Restore to default (screen)
    gl.setRenderTarget(null);
    meshRef.current.visible = true;
  });

  return (
    <group position={position}>
      {/* Mirror Camera (Virtual) */}
      <perspectiveCamera ref={mirrorCamera} fov={60} aspect={4} near={0.1} far={100} />

      {/* Mirror Mesh (Physical) */}
      <mesh ref={meshRef} rotation={[0, Math.PI, 0]} scale={[-1, 1, 1]}> {/* Scale -1 X to mirror the texture horizontally for correct reflection feel */}
        <planeGeometry args={[0.5, 0.15]} />
        <meshBasicMaterial map={fbo.texture} />
        {/* Frame / Border */}
        <mesh position={[0, 0, -0.01]}>
          <boxGeometry args={[0.52, 0.17, 0.02]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </mesh>
    </group>
  );
}
