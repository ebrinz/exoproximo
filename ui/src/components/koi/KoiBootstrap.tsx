"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { loadKoi, loadMeta } from "@/lib/data";

export function KoiBootstrap({ children }: { children: React.ReactNode }) {
  const setLoadError = useStore((s) => s.setLoadError);
  const koi = useStore((s) => s.koi);
  const meta = useStore((s) => s.meta);
  const loadError = useStore((s) => s.loadError);

  useEffect(() => {
    if (koi.length > 0 && meta) return;
    let cancelled = false;
    (async () => {
      try {
        const [k, m] = await Promise.all([loadKoi(), loadMeta()]);
        // Use zustand setState directly so we don't clobber neos/closeApproaches
        // if the user came from the belt route first.
        if (!cancelled) useStore.setState({ koi: k, meta: m });
      } catch (err) {
        if (!cancelled) setLoadError((err as Error).message);
      }
    })();
    return () => { cancelled = true; };
  }, [setLoadError, koi.length, meta]);

  if (loadError) {
    return <div className="h-screen flex items-center justify-center text-alert">── data unavailable: {loadError} ──</div>;
  }
  if (!meta) {
    return <div className="h-screen flex items-center justify-center text-dim label-caps">── loading kepler field ──</div>;
  }
  return <>{children}</>;
}
