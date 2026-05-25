"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

const N_BINS = 10;

export function ReliabilityDiagram({ width = 720, height = 160 }: { width?: number; height?: number }) {
  const koi = useStore((s) => s.koi);
  const setHighlightedBin = useKoiStore((s) => s.setHighlightedBin);
  const highlightedBin = useKoiStore((s) => s.highlightedBin);

  const bins = useMemo(() => {
    const counts = Array.from({ length: N_BINS }, () => ({ n: 0, confirmed: 0, midp: 0 }));
    for (const k of koi) {
      if (k.prob_planet == null || k.koi_disposition === "CANDIDATE") continue;
      const i = Math.min(N_BINS - 1, Math.floor(k.prob_planet * N_BINS));
      counts[i].n += 1;
      counts[i].midp = (i + 0.5) / N_BINS;
      if (k.koi_disposition === "CONFIRMED") counts[i].confirmed += 1;
    }
    return counts.map((b) => ({ ...b, obs: b.n > 0 ? b.confirmed / b.n : null }));
  }, [koi]);

  const pad = 28;
  const W = width - pad * 2;
  const H = height - pad * 2;
  const x = (p: number) => pad + p * W;
  const y = (p: number) => pad + (1 - p) * H;

  return (
    <div className="panel p-3" style={{ width }}>
      <div className="label-caps mb-1">reliability diagram</div>
      <svg width={width} height={height}>
        {/* Ideal line y = x */}
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="#1a2233" strokeDasharray="4,4" />
        {/* Axes */}
        <line x1={pad} y1={y(0)} x2={pad + W} y2={y(0)} stroke="#1a2233" />
        <line x1={pad} y1={y(0)} x2={pad} y2={y(1)} stroke="#1a2233" />
        <text x={pad} y={height - 4} fill="#6b7385" fontSize="10">predicted</text>
        <text x={4} y={pad + 8} fill="#6b7385" fontSize="10">observed</text>
        {bins.map((b, i) => b.obs != null && (
          <g
            key={i}
            onMouseEnter={() => setHighlightedBin(i)}
            onMouseLeave={() => setHighlightedBin(null)}
            style={{ cursor: "pointer" }}
          >
            <circle cx={x(b.midp)} cy={y(b.obs)} r={highlightedBin === i ? 7 : 5}
                    fill={highlightedBin === i ? "#7ee8ff" : "#e8eef5"} />
          </g>
        ))}
      </svg>
    </div>
  );
}
