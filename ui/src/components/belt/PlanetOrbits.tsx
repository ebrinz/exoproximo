"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { sampleOrbitEllipse } from "@/lib/orbits";
import {
  MERCURY_ELEMENTS,
  VENUS_ELEMENTS,
  MARS_ELEMENTS,
} from "@/lib/kepler";

const SEGMENTS = 192;

/** Faint orbit lines for Mercury, Venus, and Mars — scene context for the
 *  Sol inner system. Earth's orbit is rendered separately by EarthOrbit. */
export function PlanetOrbits() {
  const geometry = useMemo(() => {
    const all = [MERCURY_ELEMENTS, VENUS_ELEMENTS, MARS_ELEMENTS];
    const positions: number[] = [];
    for (const elements of all) {
      const pts = sampleOrbitEllipse(elements, SEGMENTS);
      for (let i = 0; i < SEGMENTS; i++) {
        const j = (i + 1) % SEGMENTS;
        // ecliptic Z -> scene Y axis swap
        positions.push(pts[3 * i], pts[3 * i + 2], -pts[3 * i + 1]);
        positions.push(pts[3 * j], pts[3 * j + 2], -pts[3 * j + 1]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return g;
  }, []);

  return (
    <lineSegments>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color="#6b7385" transparent opacity={0.25} />
    </lineSegments>
  );
}
