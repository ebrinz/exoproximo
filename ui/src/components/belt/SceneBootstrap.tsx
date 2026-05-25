"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { loadNeos, loadKoi, loadCloseApproaches, loadMeta } from "@/lib/data";

export function SceneBootstrap({ children }: { children: React.ReactNode }) {
  const setData = useStore((s) => s.setData);
  const setLoadError = useStore((s) => s.setLoadError);
  const meta = useStore((s) => s.meta);
  const loadError = useStore((s) => s.loadError);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [neos, koi, closeApproaches, meta] = await Promise.all([
          loadNeos(), loadKoi(), loadCloseApproaches(), loadMeta(),
        ]);
        if (!cancelled) setData({ neos, koi, closeApproaches, meta });
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [setData, setLoadError]);

  if (loadError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-alert">
        ── data unavailable: {loadError} ──
      </div>
    );
  }
  if (!meta) {
    return (
      <div className="h-screen w-screen flex items-center justify-center text-dim label-caps">
        ── loading exoproximo ──
      </div>
    );
  }
  return <>{children}</>;
}
