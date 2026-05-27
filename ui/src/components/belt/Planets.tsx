"use client";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import {
  heliocentricCartesian,
  MERCURY_ELEMENTS,
  VENUS_ELEMENTS,
  MARS_ELEMENTS,
} from "@/lib/kepler";
import { useStore } from "@/lib/store";
import type { OrbitalElements } from "@/lib/types";

type PlanetSpec = {
  name: string;
  elements: OrbitalElements;
  radius: number;
  color: string;
};

const PLANETS: PlanetSpec[] = [
  { name: "MERCURY", elements: MERCURY_ELEMENTS, radius: 0.04, color: "#a89580" },
  { name: "VENUS", elements: VENUS_ELEMENTS, radius: 0.06, color: "#e6d9a0" },
  { name: "MARS", elements: MARS_ELEMENTS, radius: 0.05, color: "#c46b3e" },
];

function Planet({ spec }: { spec: PlanetSpec }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    const jd = useStore.getState().jd;
    const [x, y, z] = heliocentricCartesian(spec.elements, jd);
    ref.current.position.set(x, z, -y);
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[spec.radius, 20, 20]} />
        <meshBasicMaterial color={spec.color} />
      </mesh>
      <Html
        position={[0, spec.radius + 0.04, 0]}
        center
        distanceFactor={10}
        zIndexRange={[10, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div className="label-caps text-dim whitespace-nowrap">{spec.name}</div>
      </Html>
    </group>
  );
}

export function Planets() {
  return (
    <>
      {PLANETS.map((p) => (
        <Planet key={p.name} spec={p} />
      ))}
    </>
  );
}
