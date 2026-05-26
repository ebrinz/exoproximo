"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import { heliocentricCartesian, EARTH_ELEMENTS } from "@/lib/kepler";
import { useStore } from "@/lib/store";

export function Earth() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const jd = useStore.getState().jd;
    const [x, y, z] = heliocentricCartesian(EARTH_ELEMENTS, jd);
    ref.current.position.set(x, z, -y);
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.06, 24, 24]} />
        <meshBasicMaterial color="#7ee8ff" />
      </mesh>
      <Html position={[0, 0.1, 0]} center distanceFactor={10} zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
        <div className="label-caps text-accent whitespace-nowrap">EARTH</div>
      </Html>
    </group>
  );
}
