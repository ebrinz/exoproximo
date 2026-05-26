"use client";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";

export function HoverTooltip() {
  const hover = useStore((s) => s.hoverDesignation);
  const neos = useStore((s) => s.neos);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => setPos({ x: e.clientX + 12, y: e.clientY + 12 });
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  const rec = neos.find((n) => n.designation === hover);
  if (!hover || !rec || !pos) return null;

  const diameter = rec.physical?.diameter_km;
  const cls = rec.physical?.spec_class ?? "?";

  return (
    <div
      className="pointer-events-none fixed z-50 panel px-2 py-1 text-xs whitespace-nowrap hidden md:block"
      style={{ left: pos.x, top: pos.y }}
    >
      <span className="id-bracket">{rec.designation}</span>
      <span className="text-dim"> · </span>
      <span>{cls}</span>
      <span className="text-dim"> · </span>
      <span>{diameter != null ? `${diameter.toFixed(2)} km` : "size ?"}</span>
    </div>
  );
}
