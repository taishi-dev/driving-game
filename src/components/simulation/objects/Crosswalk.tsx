"use client";

export function Crosswalk({ position, rotation = 0, width = 6, length = 3 }: { position: [number, number, number], rotation?: number, width?: number, length?: number }) {
  const stripeCount = 6;
  const stripeWidth = width / stripeCount / 2;

  // Decoration only — the scored safety-check now lives in MISSION_CHECKPOINTS.
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {Array.from({ length: stripeCount }).map((_, i) => (
        <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[(i - stripeCount / 2) * (stripeWidth * 2) + stripeWidth, 0.02, 0]}>
          <planeGeometry args={[stripeWidth, length]} />
          <meshStandardMaterial color="white" />
        </mesh>
      ))}
    </group>
  );
}