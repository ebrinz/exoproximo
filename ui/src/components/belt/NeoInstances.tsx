"use client";
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { heliocentricCartesian } from "@/lib/kepler";
import { specClassColor } from "@/lib/spec-class";

const DUMMY = new THREE.Object3D();
const MIN_SCALE = 0.012;
const MAX_SCALE = 0.07;
const SIZE_MULT = 0.022;

// Detect touch/coarse-pointer devices at module load (stable — no resize needed)
const IS_TOUCH = typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;
// Bump hit area on touch devices so fingers can select asteroids more easily
const TOUCH_SCALE_MULT = IS_TOUCH ? 1.5 : 1.0;

function scaleFor(diameter: number | null | undefined): number {
  const d = diameter ?? 0.2;
  const s = Math.log10(d + 0.1) * SIZE_MULT + 0.018;
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, s)) * TOUCH_SCALE_MULT;
}

export function NeoInstances() {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const neos = useStore((s) => s.neos);
  const hover = useStore((s) => s.hover);
  const select = useStore((s) => s.select);

  // Per-instance constant attributes (scale, color) set on data load.
  useEffect(() => {
    const m = meshRef.current;
    if (!m) return;
    const color = new THREE.Color();
    for (let i = 0; i < neos.length; i++) {
      DUMMY.position.set(0, 0, 0);
      const s = scaleFor(neos[i].physical?.diameter_km);
      DUMMY.scale.set(s, s, s);
      DUMMY.updateMatrix();
      m.setMatrixAt(i, DUMMY.matrix);
      color.setHex(specClassColor(neos[i].physical?.spec_class));
      m.setColorAt(i, color);
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [neos]);

  // Per-frame propagation: rewrite each instance's position.
  useFrame(() => {
    const m = meshRef.current;
    if (!m || neos.length === 0) return;
    const jd = useStore.getState().jd;
    for (let i = 0; i < neos.length; i++) {
      const [x, y, z] = heliocentricCartesian(neos[i].elements, jd);
      const s = scaleFor(neos[i].physical?.diameter_km);
      DUMMY.position.set(x, z, -y);
      DUMMY.scale.set(s, s, s);
      DUMMY.updateMatrix();
      m.setMatrixAt(i, DUMMY.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  const geometry = useMemo(() => new THREE.IcosahedronGeometry(1, 0), []);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ vertexColors: false, toneMapped: false }),
    [],
  );

  const count = neos.length;
  if (count === 0) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      onPointerMove={(e) => {
        e.stopPropagation();
        const i = e.instanceId;
        if (i !== undefined && neos[i]) hover(neos[i].designation);
      }}
      onPointerOut={(e) => {
        e.stopPropagation();
        hover(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        const i = e.instanceId;
        if (i !== undefined && neos[i]) select(neos[i].designation);
      }}
    />
  );
}
