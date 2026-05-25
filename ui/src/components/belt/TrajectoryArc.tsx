"use client";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { heliocentricCartesian, EARTH_ELEMENTS } from "@/lib/kepler";

const SEGMENTS = 96;
const LIFT = 0.6;

export function TrajectoryArc() {
  const selected = useStore((s) => s.selectedDesignation);
  const neos = useStore((s) => s.neos);
  const target = neos.find((n) => n.designation === selected);

  const geom = useMemo(() => new THREE.BufferGeometry(), []);
  const positions = useMemo(() => new Float32Array((SEGMENTS + 1) * 3), []);
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const dashOffset = useRef(0);
  const materialRef = useRef<THREE.LineDashedMaterial>(null);

  useFrame((_, dt) => {
    if (!target) return;
    const jd = useStore.getState().jd;
    const [ex, ey, ez] = heliocentricCartesian(EARTH_ELEMENTS, jd);
    const [tx, ty, tz] = heliocentricCartesian(target.elements, jd);
    // Scene-space (y-up):
    const e = new THREE.Vector3(ex, ez, -ey);
    const t = new THREE.Vector3(tx, tz, -ty);
    const mid = e.clone().add(t).multiplyScalar(0.5);
    mid.y += LIFT;
    const curve = new THREE.QuadraticBezierCurve3(e, mid, t);
    const pts = curve.getPoints(SEGMENTS);
    for (let i = 0; i < pts.length; i++) {
      positions[3 * i] = pts[i].x;
      positions[3 * i + 1] = pts[i].y;
      positions[3 * i + 2] = pts[i].z;
    }
    geom.attributes.position.needsUpdate = true;
    geom.computeBoundingSphere();
    dashOffset.current -= dt * 0.4;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (materialRef.current) (materialRef.current as any).dashOffset = dashOffset.current;
  });

  if (!target) return null;

  return (
    <line>
      <primitive object={geom} attach="geometry" />
      <lineDashedMaterial
        ref={materialRef}
        color="#7ee8ff"
        dashSize={0.08}
        gapSize={0.05}
        transparent
        opacity={0.85}
      />
    </line>
  );
}
