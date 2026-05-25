"use client";
import { useEffect, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useStore } from "@/lib/store";
import { heliocentricCartesian } from "@/lib/kepler";

const TWEEN_MS = 1200;

function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }

export function CameraRig() {
  const { camera } = useThree();
  const selected = useStore((s) => s.selectedDesignation);
  const neos = useStore((s) => s.neos);

  const fromPos = useRef(new THREE.Vector3());
  const toPos = useRef(new THREE.Vector3());
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!selected) { startedAt.current = null; return; }
    const target = neos.find((n) => n.designation === selected);
    if (!target) return;
    const jd = useStore.getState().jd;
    const [tx, ty, tz] = heliocentricCartesian(target.elements, jd);
    const tv = new THREE.Vector3(tx, tz, -ty);
    // viewpoint: pull camera toward target but stay above the ecliptic
    const dir = tv.clone().normalize().multiplyScalar(1.6);
    const desired = tv.clone().add(dir).add(new THREE.Vector3(0, 1.2, 0));
    fromPos.current.copy(camera.position);
    toPos.current.copy(desired);
    startedAt.current = performance.now();
  }, [selected, neos, camera]);

  useFrame(() => {
    if (startedAt.current === null) return;
    const t = Math.min(1, (performance.now() - startedAt.current) / TWEEN_MS);
    camera.position.lerpVectors(fromPos.current, toPos.current, easeOutCubic(t));
    if (t >= 1) startedAt.current = null;
  });

  return null;
}
