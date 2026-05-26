"use client";
import { Html } from "@react-three/drei";

export function Sun() {
  return (
    <group>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.15, 32, 32]} />
        <meshBasicMaterial color="#fff5a0" />
      </mesh>
      <Html position={[0, 0.22, 0]} center distanceFactor={8} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div className="label-caps text-accent whitespace-nowrap">SUN</div>
      </Html>
    </group>
  );
}
