"use client";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

/**
 * Thin one-line strip showing the currently selected KOI.
 * Displayed inside the sheet on ZONES, PICKS, and CALIB tabs so the user
 * keeps track of their selection when the sky-map is hidden.
 */
export function KoiSelectedContextStrip() {
  const koi = useStore((s) => s.koi);
  const selectedKepoi = useKoiStore((s) => s.selectedKepoi);
  const rec = koi.find((k) => k.kepoi_name === selectedKepoi);

  if (!rec) return null;

  const prob = rec.prob_planet != null ? `p=${rec.prob_planet.toFixed(2)}` : null;

  return (
    <div className="px-3 py-1.5 border-b border-rule text-[11px] text-dim font-mono flex items-center gap-2 overflow-hidden whitespace-nowrap">
      <span className="text-dim/60 tracking-caps text-[9px]">TRACKING</span>
      <span className="text-accent">[{rec.kepoi_name}]</span>
      {rec.kepler_name && <span>{rec.kepler_name}</span>}
      <span className="text-dim/60">·</span>
      <span>{rec.koi_disposition}</span>
      {prob && (
        <>
          <span className="text-dim/60">·</span>
          <span>{prob}</span>
        </>
      )}
    </div>
  );
}
