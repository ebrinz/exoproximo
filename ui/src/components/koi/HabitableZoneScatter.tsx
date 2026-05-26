"use client";
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

// Habitable zone (conservative, Kopparapu+) insolation bounds in S⊕
const HZ_MIN = 0.36;
const HZ_MAX = 1.78;

// Axis ranges
const TEFF_MIN = 3000;
const TEFF_MAX = 8000;
const INSOL_LOG_MIN = Math.log10(0.01);
const INSOL_LOG_MAX = Math.log10(10000);

const SUN_TEFF = 5772;
const EARTH_INSOL = 1.0;

function probColor(p: number | null): string {
  if (p == null) return "#6b7385";
  const lo = [255, 94, 122];  // #ff5e7a  (false positive — red)
  const hi = [126, 232, 255]; // #7ee8ff  (confirmed — cyan)
  const c = lo.map((v, i) => Math.round(v + (hi[i] - v) * p));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export function HabitableZoneScatter() {
  const koi = useStore((s) => s.koi);
  const select = useKoiStore((s) => s.select);
  const hover = useKoiStore((s) => s.hover);
  const highlightedBin = useKoiStore((s) => s.highlightedBin);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitMap = useRef<{ x: number; y: number; r: number; id: string }[]>([]);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverIdRef = useRef<string | null>(null);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = devicePixelRatio;
    const W = (c.width = c.clientWidth * dpr);
    const H = (c.height = c.clientHeight * dpr);
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = "#05070d";
    ctx.fillRect(0, 0, W, H);

    const PAD_L = 52 * dpr;
    const PAD_R = 20 * dpr;
    const PAD_T = 20 * dpr;
    const PAD_B = 38 * dpr;
    const plotW = W - PAD_L - PAD_R;
    const plotH = H - PAD_T - PAD_B;

    // Map functions
    const xForTeff = (teff: number) =>
      PAD_L + ((teff - TEFF_MIN) / (TEFF_MAX - TEFF_MIN)) * plotW;
    const yForInsol = (insol: number) => {
      const logInsol = Math.log10(Math.max(0.001, insol));
      return PAD_T + (1 - (logInsol - INSOL_LOG_MIN) / (INSOL_LOG_MAX - INSOL_LOG_MIN)) * plotH;
    };

    // --- HZ band ---
    const yHz1 = yForInsol(HZ_MAX); // top (higher insol = lower y)
    const yHz2 = yForInsol(HZ_MIN);
    ctx.fillStyle = "rgba(74, 222, 128, 0.12)";
    ctx.fillRect(PAD_L, yHz1, plotW, yHz2 - yHz1);
    // Top/bottom hairlines
    ctx.strokeStyle = "rgba(74, 222, 128, 0.5)";
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.moveTo(PAD_L, yHz1); ctx.lineTo(PAD_L + plotW, yHz1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(PAD_L, yHz2); ctx.lineTo(PAD_L + plotW, yHz2);
    ctx.stroke();

    // HZ label
    ctx.fillStyle = "rgba(74, 222, 128, 0.6)";
    ctx.font = `${9 * dpr}px monospace`;
    ctx.fillText("HZ", PAD_L + 4 * dpr, yHz1 + 12 * dpr);

    // --- Sun reference line ---
    const xSun = xForTeff(SUN_TEFF);
    ctx.strokeStyle = "rgba(250, 200, 80, 0.3)";
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(xSun, PAD_T); ctx.lineTo(xSun, PAD_T + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(250, 200, 80, 0.5)";
    ctx.font = `${8 * dpr}px monospace`;
    ctx.fillText("☉", xSun + 2 * dpr, PAD_T + 12 * dpr);

    // --- Earth marker ---
    const xEarth = xForTeff(SUN_TEFF);
    const yEarth = yForInsol(EARTH_INSOL);
    ctx.fillStyle = "#22d3ee";
    ctx.font = `${11 * dpr}px monospace`;
    ctx.textAlign = "center";
    ctx.fillText("✦", xEarth, yEarth + 4 * dpr);
    ctx.textAlign = "left";

    // --- Axes ---
    ctx.strokeStyle = "#1a2233";
    ctx.lineWidth = 1 * dpr;
    // X axis
    ctx.beginPath();
    ctx.moveTo(PAD_L, PAD_T + plotH); ctx.lineTo(PAD_L + plotW, PAD_T + plotH);
    ctx.stroke();
    // Y axis
    ctx.beginPath();
    ctx.moveTo(PAD_L, PAD_T); ctx.lineTo(PAD_L, PAD_T + plotH);
    ctx.stroke();

    // --- X tick labels (Teff) ---
    ctx.fillStyle = "#6b7385";
    ctx.font = `${9 * dpr}px monospace`;
    ctx.textAlign = "center";
    for (const teff of [3000, 4000, 5000, 6000, 7000, 8000]) {
      const x = xForTeff(teff);
      ctx.beginPath();
      ctx.moveTo(x, PAD_T + plotH); ctx.lineTo(x, PAD_T + plotH + 4 * dpr);
      ctx.strokeStyle = "#1a2233";
      ctx.stroke();
      ctx.fillText(`${teff / 1000}k`, x, PAD_T + plotH + 14 * dpr);
    }
    // X axis label
    ctx.fillStyle = "#6b7385";
    ctx.font = `${9 * dpr}px monospace`;
    ctx.fillText("host star Teff (K)", PAD_L + plotW / 2, H - 4 * dpr);

    // --- Y tick labels (insolation, log) ---
    ctx.textAlign = "right";
    for (const insol of [0.01, 0.1, 1, 10, 100, 1000, 10000]) {
      const y = yForInsol(insol);
      if (y < PAD_T || y > PAD_T + plotH) continue;
      ctx.strokeStyle = "#1a2233";
      ctx.beginPath();
      ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L - 4 * dpr, y);
      ctx.stroke();
      const label = insol < 1 ? insol.toString() : insol >= 1000 ? `${insol / 1000}k` : `${insol}`;
      ctx.fillStyle = "#6b7385";
      ctx.fillText(label, PAD_L - 6 * dpr, y + 3 * dpr);
    }
    // Y axis label (rotated)
    ctx.save();
    ctx.translate(12 * dpr, PAD_T + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "center";
    ctx.fillStyle = "#6b7385";
    ctx.font = `${9 * dpr}px monospace`;
    ctx.fillText("insolation (S⊕)", 0, 0);
    ctx.restore();
    ctx.textAlign = "left";

    // --- Dots ---
    hitMap.current = [];
    for (const k of koi) {
      if (k.koi_insol == null || k.koi_steff == null) continue;
      const x = xForTeff(k.koi_steff);
      const y = yForInsol(k.koi_insol);
      if (x < PAD_L || x > PAD_L + plotW || y < PAD_T || y > PAD_T + plotH) continue;

      const r = 3 * dpr;
      const bin = k.prob_planet != null ? Math.min(9, Math.floor(k.prob_planet * 10)) : -1;
      const glow = highlightedBin !== null && bin === highlightedBin;
      const alpha = glow ? 1.0 : (k.koi_disposition === "FALSE POSITIVE" ? 0.25 : 0.65);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = probColor(k.prob_planet);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1 * dpr;

      if (k.koi_disposition === "CONFIRMED") {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      } else if (k.koi_disposition === "CANDIDATE") {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // FALSE POSITIVE — small ✕
        ctx.beginPath();
        ctx.moveTo(x - r * 0.7, y - r * 0.7); ctx.lineTo(x + r * 0.7, y + r * 0.7);
        ctx.moveTo(x + r * 0.7, y - r * 0.7); ctx.lineTo(x - r * 0.7, y + r * 0.7);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      hitMap.current.push({ x, y, r: r + 3 * dpr, id: k.kepoi_name });
    }
  }, [koi, highlightedBin]);

  function findHit(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
    const px = (e.clientX - rect.left) * devicePixelRatio;
    const py = (e.clientY - rect.top) * devicePixelRatio;
    return hitMap.current.find((h) => (h.x - px) ** 2 + (h.y - py) ** 2 < h.r ** 2);
  }

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        onMouseMove={(e) => {
          const hit = findHit(e);
          const id = hit?.id ?? null;
          hover(id);
          hoverIdRef.current = id;
          if (tooltipRef.current) {
            if (hit) {
              const rec = null; // we don't need full rec for tooltip position
              tooltipRef.current.style.display = "block";
              tooltipRef.current.style.left = `${e.clientX - (e.target as HTMLCanvasElement).getBoundingClientRect().left + 10}px`;
              tooltipRef.current.style.top = `${e.clientY - (e.target as HTMLCanvasElement).getBoundingClientRect().top - 24}px`;
              tooltipRef.current.textContent = hit.id;
              void rec; // suppress lint
            } else {
              tooltipRef.current.style.display = "none";
            }
          }
        }}
        onMouseLeave={() => {
          hover(null);
          if (tooltipRef.current) tooltipRef.current.style.display = "none";
        }}
        onClick={(e) => {
          const hit = findHit(e);
          if (hit) select(hit.id);
        }}
      />
      {/* Tooltip */}
      <div
        ref={tooltipRef}
        style={{ display: "none", position: "absolute", pointerEvents: "none" }}
        className="bg-[#05070d] border border-[#1a2233] px-2 py-1 text-[10px] text-[#e8eef5] font-mono"
      />
      {/* Legend */}
      <div className="absolute top-2 right-3 text-[9px] text-[#6b7385] font-mono space-y-0.5">
        <div><span className="inline-block w-2 h-2 rounded-full bg-[#7ee8ff] mr-1" />confirmed</div>
        <div><span className="inline-block w-2 h-2 rounded-full border border-[#7ee8ff] mr-1" />candidate</div>
        <div><span className="text-[#ff5e7a] mr-1">✕</span>false positive</div>
        <div className="border-t border-[#1a2233] pt-0.5 mt-0.5">color = prob_planet</div>
      </div>
    </div>
  );
}
