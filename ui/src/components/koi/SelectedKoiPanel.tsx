"use client";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

function dispChip(d: string) {
  const color = d === "CONFIRMED" ? "border-green text-green"
            : d === "FALSE POSITIVE" ? "border-alert text-alert"
            : "border-accent text-accent";
  return <span className={`px-1.5 py-0.5 border ${color}`}>{d}</span>;
}

export function SelectedKoiPanel() {
  const koi = useStore((s) => s.koi);
  const selectedKepoi = useKoiStore((s) => s.selectedKepoi);
  const rec = koi.find((k) => k.kepoi_name === selectedKepoi);

  if (!rec) {
    return (
      <div className="panel p-4">
        <div className="label-caps mb-2">selected koi</div>
        <div className="text-dim">── select a candidate ──</div>
      </div>
    );
  }

  return (
    <div className="panel p-4 text-xs space-y-2">
      <div className="label-caps">selected koi</div>
      <div className="text-fg">
        <span className="id-bracket text-accent">{rec.kepoi_name}</span>
        {rec.kepler_name && <span className="ml-2 text-dim">{rec.kepler_name}</span>}
      </div>
      <div>{dispChip(rec.koi_disposition)}</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span>period</span><span>{rec.koi_period?.toFixed(2) ?? "—"}<span className="unit">d</span></span>
        <span>prad</span><span>{rec.koi_prad?.toFixed(2) ?? "—"}<span className="unit">R⊕</span></span>
        <span>teq</span><span>{rec.koi_teq?.toFixed(0) ?? "—"}<span className="unit">K</span></span>
        <span>host Teff</span><span>{rec.koi_steff?.toFixed(0) ?? "—"}<span className="unit">K</span></span>
        <span>host R</span><span>{rec.koi_srad?.toFixed(2) ?? "—"}<span className="unit">R☉</span></span>
      </div>
      <div className="border-t border-rule pt-2">
        <div className="label-caps mb-1">our model</div>
        {rec.prob_planet != null ? (
          <span className="text-accent text-base">p = {rec.prob_planet.toFixed(3)}</span>
        ) : <span className="text-dim">(not classified)</span>}
      </div>
    </div>
  );
}
