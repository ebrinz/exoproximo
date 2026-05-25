"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

const RA_MIN = 279, RA_MAX = 302;
const DEC_MIN = 36, DEC_MAX = 53;

function probColor(p: number | null): string {
  if (p == null) return "#6b7385";
  // cool (alert) -> hot (accent)
  const lo = [255, 94, 122];   // #ff5e7a
  const hi = [126, 232, 255];  // #7ee8ff
  const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * p));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function SkyMap() {
  const koi = useStore((s) => s.koi);
  const select = useKoiStore((s) => s.select);
  const hover = useKoiStore((s) => s.hover);
  const highlightedBin = useKoiStore((s) => s.highlightedBin);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitMap = useRef<{ x: number; y: number; r: number; id: string }[]>([]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const W = c.width = c.clientWidth * devicePixelRatio;
    const H = c.height = c.clientHeight * devicePixelRatio;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, W, H);

    // Faint Kepler FOV outline
    ctx.strokeStyle = "#1a2233";
    ctx.lineWidth = 1 * devicePixelRatio;
    ctx.strokeRect(W * 0.08, H * 0.08, W * 0.84, H * 0.84);

    hitMap.current = [];
    for (const k of koi) {
      const u = (k.ra - RA_MIN) / (RA_MAX - RA_MIN);
      const v = (DEC_MAX - k.dec) / (DEC_MAX - DEC_MIN);
      const x = W * (0.08 + 0.84 * u);
      const y = H * (0.08 + 0.84 * v);
      const r = Math.max(1.5, Math.min(6, (k.koi_prad ?? 1.5) * 1.2)) * devicePixelRatio;

      const bin = k.prob_planet != null ? Math.min(9, Math.floor(k.prob_planet * 10)) : -1;
      const glow = highlightedBin !== null && bin === highlightedBin;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = probColor(k.prob_planet);
      ctx.globalAlpha = glow ? 1.0 : (k.koi_disposition === "FALSE POSITIVE" ? 0.3 : 0.75);
      if (k.koi_disposition === "CONFIRMED") ctx.fill();
      else if (k.koi_disposition === "CANDIDATE") { ctx.lineWidth = 1.2 * devicePixelRatio; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
      else { ctx.lineWidth = 1 * devicePixelRatio; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(); }
      ctx.globalAlpha = 1;

      hitMap.current.push({ x, y, r: r + 2 * devicePixelRatio, id: k.kepoi_name });
    }
  }, [koi, highlightedBin]);

  return (
    <div className="absolute inset-0">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={(e) => {
          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const px = (e.clientX - rect.left) * devicePixelRatio;
          const py = (e.clientY - rect.top) * devicePixelRatio;
          const hit = hitMap.current.find((h) => (h.x - px) ** 2 + (h.y - py) ** 2 < h.r ** 2);
          hover(hit?.id ?? null);
        }}
        onClick={(e) => {
          const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
          const px = (e.clientX - rect.left) * devicePixelRatio;
          const py = (e.clientY - rect.top) * devicePixelRatio;
          const hit = hitMap.current.find((h) => (h.x - px) ** 2 + (h.y - py) ** 2 < h.r ** 2);
          if (hit) select(hit.id);
        }}
      />
      <div className="absolute top-3 left-4 text-dim label-caps">kepler field · cygnus</div>
    </div>
  );
}
