"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { sampleOrbitEllipse } from "@/lib/orbits";

const SEGMENTS = 128;

export function NeoOrbits() {
  const neos = useStore((s) => s.neos);
  const selected = useStore((s) => s.selectedDesignation);

  const brightGeom = useMemo(() => {
    const brightPositions: number[] = [];
    for (const neo of neos) {
      if (neo.designation !== selected) continue;
      const pts = sampleOrbitEllipse(neo.elements, SEGMENTS);
      for (let i = 0; i < SEGMENTS; i++) {
        const j = (i + 1) % SEGMENTS;
        brightPositions.push(pts[3 * i], pts[3 * i + 2], -pts[3 * i + 1]);
        brightPositions.push(pts[3 * j], pts[3 * j + 2], -pts[3 * j + 1]);
      }
    }
    const bright = new THREE.BufferGeometry();
    bright.setAttribute("position", new THREE.Float32BufferAttribute(brightPositions, 3));
    return bright;
  }, [neos, selected]);

  return (
    <lineSegments>
      <primitive object={brightGeom} attach="geometry" />
      <lineBasicMaterial color="#7ee8ff" transparent opacity={0.9} />
    </lineSegments>
  );
}
