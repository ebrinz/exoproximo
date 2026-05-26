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
    // Frame the selected orbit: stay back at a distance that scales with
    // aphelion so the whole orbit ellipse is comfortably in view. Camera
    // sits in the direction of the target (so the target is in frame),
    // lifted above the ecliptic, looking back at the origin (Sun).
    const targetA = target.elements.a;
    const aphelion = targetA * (1 + target.elements.e);
    const cameraDistance = Math.max(7, 2.6 * aphelion);
    const dir = tv.clone().normalize();
    const desired = dir.multiplyScalar(cameraDistance).add(new THREE.Vector3(0, cameraDistance * 0.35, 0));
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
