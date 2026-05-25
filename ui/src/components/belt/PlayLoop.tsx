"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function PlayLoop() {
  const playing = useStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = (t - last) / 1000;
      last = t;
      const { jd, playSpeed, setJd } = useStore.getState();
      setJd(jd + playSpeed * dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return null;
}
