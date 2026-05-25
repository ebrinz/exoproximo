"use client";
import { useMemo } from "react";
import * as THREE from "three";

export function Starfield({ count = 1200, radius = 800 }: { count?: number; radius?: number }) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    // Deterministic pseudo-random distribution on a sphere (no Math.random in render path).
    let seed = 0x1a2b3c;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 0xffffffff;
    };
    for (let i = 0; i < count; i++) {
      const theta = 2 * Math.PI * rand();
      const phi = Math.acos(2 * rand() - 1);
      const r = radius * (0.85 + 0.3 * rand());
      positions[3 * i] = r * Math.sin(phi) * Math.cos(theta);
      positions[3 * i + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[3 * i + 2] = r * Math.cos(phi);
    }
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [count, radius]);

  return (
    <points geometry={geometry}>
      <pointsMaterial size={1.2} color="#e8eef5" sizeAttenuation={false} opacity={0.6} transparent />
    </points>
  );
}
