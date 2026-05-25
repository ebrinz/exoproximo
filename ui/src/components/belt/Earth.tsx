"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { heliocentricCartesian, EARTH_ELEMENTS } from "@/lib/kepler";
import { useStore } from "@/lib/store";

export function Earth() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    const jd = useStore.getState().jd;
    const [x, y, z] = heliocentricCartesian(EARTH_ELEMENTS, jd);
    ref.current.position.set(x, z, -y); // R3F y-up; ecliptic Z -> scene Y
  });
  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.06, 24, 24]} />
      <meshBasicMaterial color="#7ee8ff" />
    </mesh>
  );
}
