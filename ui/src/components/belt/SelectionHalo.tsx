"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { heliocentricCartesian } from "@/lib/kepler";

export function SelectionHalo() {
  const ref = useRef<THREE.Mesh>(null);
  const selected = useStore((s) => s.selectedDesignation);
  const neos = useStore((s) => s.neos);
  const target = neos.find((n) => n.designation === selected);

  useFrame(() => {
    if (!ref.current || !target) return;
    const jd = useStore.getState().jd;
    const [x, y, z] = heliocentricCartesian(target.elements, jd);
    ref.current.position.set(x, z, -y);
    ref.current.lookAt(0, 0, 0);
  });

  if (!target) return null;

  return (
    <mesh ref={ref}>
      <ringGeometry args={[0.09, 0.11, 48]} />
      <meshBasicMaterial color="#7ee8ff" side={THREE.DoubleSide} transparent opacity={0.9} />
    </mesh>
  );
}
