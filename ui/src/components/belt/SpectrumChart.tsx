"use client";
import { useEffect, useState } from "react";
import { loadSpectrum } from "@/lib/data";
import type { SpectrumFile } from "@/lib/types";

export function SpectrumChart({ designation, width = 280, height = 80 }: {
  designation: string; width?: number; height?: number;
}) {
  const [data, setData] = useState<SpectrumFile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null); setError(null);
    loadSpectrum(designation)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => { cancelled = true; };
  }, [designation]);

  if (error) return <div className="text-alert text-xs">── no spectral data ──</div>;
  if (!data) return (
    <svg width={width} height={height} className="text-dim">
      <line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeDasharray="3,3" />
    </svg>
  );

  const xs = data.map((p) => p.wavelength);
  const ys = data.map((p) => p.reflectance);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const scaleX = (x: number) => ((x - xMin) / (xMax - xMin)) * (width - 8) + 4;
  const scaleY = (y: number) => height - 4 - ((y - yMin) / (yMax - yMin)) * (height - 8);
  const d = data.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.wavelength).toFixed(1)},${scaleY(p.reflectance).toFixed(1)}`).join(" ");

  return (
    <svg width={width} height={height}>
      <path d={d} stroke="#7ee8ff" strokeWidth="1.2" fill="none" />
      <text x="2" y={height - 2} fill="#6b7385" fontSize="9">{xMin.toFixed(2)}µm</text>
      <text x={width - 28} y={height - 2} fill="#6b7385" fontSize="9">{xMax.toFixed(2)}µm</text>
    </svg>
  );
}
