"use client";
import { useMemo } from "react";
import * as THREE from "three";
import { sampleOrbitEllipse } from "@/lib/orbits";
import { EARTH_ELEMENTS } from "@/lib/kepler";

export function EarthOrbit({ segments = 256 }: { segments?: number }) {
  const geometry = useMemo(() => {
    const pts = sampleOrbitEllipse(EARTH_ELEMENTS, segments);
    const xy = new Float32Array((segments + 1) * 3);
    for (let i = 0; i < segments; i++) {
      xy[3 * i] = pts[3 * i];
      xy[3 * i + 1] = pts[3 * i + 2];     // ecliptic Z -> scene Y
      xy[3 * i + 2] = -pts[3 * i + 1];    // close the loop
    }
    // close loop
    xy[3 * segments] = xy[0];
    xy[3 * segments + 1] = xy[1];
    xy[3 * segments + 2] = xy[2];
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(xy, 3));
    return g;
  }, [segments]);

  return (
    <line>
      <primitive object={geometry} attach="geometry" />
      <lineBasicMaterial color="#7ee8ff" transparent opacity={0.35} />
    </line>
  );
}
