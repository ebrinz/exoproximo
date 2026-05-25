"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { sampleOrbitEllipse } from "@/lib/orbits";

const SEGMENTS = 128;

export function NeoOrbits() {
  const neos = useStore((s) => s.neos);
  const selected = useStore((s) => s.selectedDesignation);

  // Build two combined LineSegments geometries: dim (most orbits) + bright (selected one).
  const { dimGeom, brightGeom } = useMemo(() => {
    const positions: number[] = [];
    const brightPositions: number[] = [];
    for (const neo of neos) {
      const pts = sampleOrbitEllipse(neo.elements, SEGMENTS);
      const isSel = neo.designation === selected;
      const target = isSel ? brightPositions : positions;
      for (let i = 0; i < SEGMENTS; i++) {
        const j = (i + 1) % SEGMENTS;
        // segment from i -> j, axis swap (x, z, -y) to match the Sun + Earth.
        target.push(pts[3 * i], pts[3 * i + 2], -pts[3 * i + 1]);
        target.push(pts[3 * j], pts[3 * j + 2], -pts[3 * j + 1]);
      }
    }
    const dim = new THREE.BufferGeometry();
    dim.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const bright = new THREE.BufferGeometry();
    bright.setAttribute("position", new THREE.Float32BufferAttribute(brightPositions, 3));
    return { dimGeom: dim, brightGeom: bright };
  }, [neos, selected]);

  return (
    <>
      <lineSegments>
        <primitive object={dimGeom} attach="geometry" />
        <lineBasicMaterial color="#1a2233" transparent opacity={0.45} />
      </lineSegments>
      <lineSegments>
        <primitive object={brightGeom} attach="geometry" />
        <lineBasicMaterial color="#7ee8ff" transparent opacity={0.9} />
      </lineSegments>
    </>
  );
}
