"use client";

import { Sky, Environment, Lightformer } from "@react-three/drei";
import { useMemo } from "react";
import * as THREE from "three";
import { getCoursePath } from "@/lib/course";
import { useDrivingStore } from "@/lib/store";

export function Surroundings() {
  const currentLesson = useDrivingStore(state => state.currentLesson);
  
  // Generate Poles and Fences along the path
  const surroundings = useMemo(() => {
     const path = getCoursePath(currentLesson);
     const points = path.getSpacedPoints(40); // Fewer points for poles
     const data: { position: [number, number, number], type: 'pole' | 'fence', rotation: number }[] = [];

     points.forEach((pt, i) => {
         // Skip some points to make it sparse
         if (i % 2 !== 0) return;

         // Calculate normal
         const nextPt = points[Math.min(i + 1, points.length - 1)];
         const dir = new THREE.Vector3().subVectors(nextPt, pt).normalize();
         const normal = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
         
         // Left Side Poles
         const offsetL = 6; 
         const posL = pt.clone().add(normal.clone().multiplyScalar(-offsetL));
         data.push({ position: [posL.x, 0, posL.z], type: 'pole', rotation: 0 });

         // Right Side Poles
         const offsetR = 6;
         const posR = pt.clone().add(normal.clone().multiplyScalar(offsetR));
         data.push({ position: [posR.x, 0, posR.z], type: 'pole', rotation: 0 });
     });

     return data;
  }, [currentLesson]);

  return (
    <group>
        {/* GOLDEN HOUR: sun near the horizon for an orange sunset sky + warm glow. */}
        <Sky sunPosition={[80, 7, 50]} turbidity={12} rayleigh={3.5} mieCoefficient={0.03} mieDirectionalG={0.95} />

        {/* --- Single light rig (Scene.tsx no longer adds its own lights) --- */}
        {/* Warm sky / dark ground bounce — pushes the whole scene amber. */}
        <hemisphereLight args={["#ffb27a", "#3a2e1f", 0.35]} />
        {/* Minimal base fill so deep shadows stay rich without crushing to pure black. */}
        <ambientLight intensity={0.04} />
        {/* Strong ORANGE sun key light — the only shadow caster. Very low + to the side so
            shadows are long and rake across the road toward the camera. */}
        <directionalLight
            position={[90, 16, 35]}
            intensity={3.6}
            color="#ff7e2e"
            castShadow
            // 1024 (not 2048) keeps the per-frame shadow pass cheap: the car physics is
            // frame-rate dependent, and headless-CI software-GL is fill-bound, so a 4x
            // smaller shadow map protects the drive-to-goal e2e timing. The blur radius
            // hides the lower resolution. Shadow-camera bounds are set as props (a nested
            // <orthographicCamera attach="shadow-camera"> did NOT reliably update the
            // light's shadow projection, so shadows never rendered).
            shadow-mapSize={[1024, 1024]}
            shadow-camera-near={1}
            shadow-camera-far={300}
            shadow-camera-left={-55}
            shadow-camera-right={55}
            shadow-camera-top={55}
            shadow-camera-bottom={-55}
            shadow-bias={-0.0004}
            shadow-normalBias={0.03}
            shadow-radius={2.5}
        />
        {/* Cool blue fill from the opposite side — complements the orange key for a strong
            warm/cool split on the shadow side. */}
        <directionalLight position={[-50, 40, -40]} intensity={0.18} color="#5b7fae" />

        {/* Procedural reflection environment for metal/glass (car body, windows, mirror).
            Pure GPU (Lightformers) — no network — and rendered once (frames={1}). */}
        <Environment resolution={64} frames={1} environmentIntensity={0.5}>
            <color attach="background" args={["#c97a3a"]} />
            <Lightformer intensity={2.2} position={[0, 12, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[40, 40, 1]} color="#ffdcb0" />
            <Lightformer intensity={0.9} position={[0, 3, -14]} scale={[40, 10, 1]} color="#ff9a4d" />
        </Environment>

        {/* Large Ground (Manicured Grass) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.21, 0]} receiveShadow>
            <planeGeometry args={[1000, 1000]} />
            <meshStandardMaterial color="#5c8a45" roughness={0.9} />
        </mesh>

        {/* Administration Building (School Building) */}
        {/* Placed randomly near the start/center of the straight course */}
        <group position={[30, 0, -80]} rotation={[0, -Math.PI / 2, 0]}>
            {/* Main Block */}
            <mesh position={[0, 5, 0]} castShadow receiveShadow>
                <boxGeometry args={[40, 10, 15]} />
                <meshStandardMaterial color="#e0e0e0" />
            </mesh>
            {/* Windows */}
            <mesh position={[0, 5, 7.6]}>
                 <planeGeometry args={[35, 4]} />
                 <meshStandardMaterial color="#88ccff" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Roof */}
            <mesh position={[0, 10.5, 0]}>
                <boxGeometry args={[42, 1, 17]} />
                <meshStandardMaterial color="#555" />
            </mesh>
            {/* Entrance Canopy */}
            <mesh position={[0, 3, 10]}>
                <boxGeometry args={[8, 0.5, 6]} />
                <meshStandardMaterial color="#fff" />
            </mesh>
            {/* Sign */}
            <mesh position={[0, 8, 8]}>
                <boxGeometry args={[10, 2, 0.5]} />
                <meshStandardMaterial color="#2244aa" />
            </mesh>
        </group>
        
        {/* Another Building (Garage/Storage) */}
        <group position={[-40, 0, -40]}>
             <mesh position={[0, 4, 0]} castShadow receiveShadow>
                <boxGeometry args={[20, 8, 30]} />
                <meshStandardMaterial color="#d0d0d0" />
            </mesh>
            <mesh position={[0, 4, 15.1]}>
                <planeGeometry args={[15, 6]} />
                <meshStandardMaterial color="#333" /> {/* Roller door */}
            </mesh>
        </group>

        {/* Poles (Yellow/Black Tiger Pattern) */}
        {surroundings.map((item, i) => (
             <group key={i} position={item.position as [number, number, number]}>
                 {/* Pole Base */}
                 <mesh position={[0, 1, 0]} castShadow>
                     <cylinderGeometry args={[0.05, 0.05, 2, 8]} />
                     <meshStandardMaterial color="#ffff00" />
                 </mesh>
                 {/* Black stripes - simplified as rings */}
                 <mesh position={[0, 0.5, 0]}>
                     <cylinderGeometry args={[0.055, 0.055, 0.4, 8]} />
                     <meshStandardMaterial color="#000000" />
                 </mesh>
                 <mesh position={[0, 1.5, 0]}>
                     <cylinderGeometry args={[0.055, 0.055, 0.4, 8]} />
                     <meshStandardMaterial color="#000000" />
                 </mesh>
             </group>
        ))}
        
        {/* Distant Fences (Perimeter) */}
        <mesh position={[50, 1.5, -90]}>
            <boxGeometry args={[1, 3, 300]} />
            <meshStandardMaterial color="#aaaaaa" transparent opacity={0.3} />
        </mesh>
        <mesh position={[-50, 1.5, -90]}>
             <boxGeometry args={[1, 3, 300]} />
             <meshStandardMaterial color="#aaaaaa" transparent opacity={0.3} />
        </mesh>
    </group>
  );
}
