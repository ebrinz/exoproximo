"use client";
import { useEffect } from "react";
import { useStore } from "@/lib/store";

export function HashSelector() {
  const neos = useStore((s) => s.neos);
  const select = useStore((s) => s.select);

  useEffect(() => {
    if (neos.length === 0) return;
    const apply = () => {
      const m = window.location.hash.match(/sel=([^&]+)/);
      if (m) select(decodeURIComponent(m[1]));
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [neos, select]);

  return null;
}
