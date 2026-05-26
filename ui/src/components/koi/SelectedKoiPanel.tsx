"use client";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

const HZ_MIN = 0.36;
const HZ_MAX = 1.78;

function dispChip(d: string) {
  const color = d === "CONFIRMED" ? "border-[#4ade80] text-[#4ade80]"
            : d === "FALSE POSITIVE" ? "border-[#ff5e7a] text-[#ff5e7a]"
            : "border-[#7ee8ff] text-[#7ee8ff]";
  return <span className={`px-1.5 py-0.5 border ${color}`}>{d}</span>;
}

/** Shared body — used by both desktop sidebar and mobile sheet tab */
export function SelectedKoiPanelBody() {
  const koi = useStore((s) => s.koi);
  const selectedKepoi = useKoiStore((s) => s.selectedKepoi);
  const rec = koi.find((k) => k.kepoi_name === selectedKepoi);

  if (!rec) {
    return (
      <div className="p-4">
        <div className="label-caps mb-2">selected koi</div>
        <div className="text-[#6b7385]">── select a candidate ──</div>
      </div>
    );
  }

  const inHz =
    rec.koi_insol != null && rec.koi_insol >= HZ_MIN && rec.koi_insol <= HZ_MAX;

  const modelVerdict =
    rec.prob_planet == null
      ? null
      : rec.prob_planet >= 0.5
      ? "planet"
      : "false positive";

  return (
    <div className="p-4 text-xs space-y-2 overflow-y-auto h-full">
      <div className="label-caps">selected koi</div>
      <div className="text-[#e8eef5]">
        <span className="id-bracket text-[#7ee8ff]">{rec.kepoi_name}</span>
        {rec.kepler_name && <span className="ml-2 text-[#6b7385]">{rec.kepler_name}</span>}
      </div>
      <div>{dispChip(rec.koi_disposition)}</div>

      {/* Curated blurb */}
      {rec.summary && (
        <div className="text-[#e8eef5] text-[11px] leading-relaxed mb-2 border-l-2 border-[#1a2233] pl-2">
          {rec.summary}
        </div>
      )}

      {/* Assessment */}
      {modelVerdict && (
        <div className="border-t border-[#1a2233] pt-2">
          <div className="label-caps mb-1">assessment</div>
          <span
            className={`px-1.5 py-0.5 border text-[10px] ${
              modelVerdict === "planet"
                ? "border-[#4ade80] text-[#4ade80]"
                : "border-[#ff5e7a] text-[#ff5e7a]"
            }`}
          >
            model says {modelVerdict}
          </span>
        </div>
      )}

      <div className="border-t border-[#1a2233] pt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 tabular-nums">
        <span>period</span><span>{rec.koi_period?.toFixed(2) ?? "—"}<span className="unit">d</span></span>
        <span>prad</span><span>{rec.koi_prad?.toFixed(2) ?? "—"}<span className="unit">R⊕</span></span>
        <span>teq</span><span>{rec.koi_teq?.toFixed(0) ?? "—"}<span className="unit">K</span></span>
        <span>host Teff</span><span>{rec.koi_steff?.toFixed(0) ?? "—"}<span className="unit">K</span></span>
        <span>host R</span><span>{rec.koi_srad?.toFixed(2) ?? "—"}<span className="unit">R☉</span></span>
        <span>insolation</span>
        <span>
          {rec.koi_insol != null ? (
            <>
              {rec.koi_insol.toFixed(2)}<span className="unit">S⊕</span>
              {inHz && (
                <span className="ml-1 px-1 py-0 border border-[#4ade80] text-[#4ade80] text-[9px]">HZ</span>
              )}
            </>
          ) : "—"}
        </span>
      </div>

      <div className="border-t border-[#1a2233] pt-2">
        <div className="label-caps mb-1">our model</div>
        {rec.prob_planet != null ? (
          <span className="text-[#7ee8ff] text-base">p = {rec.prob_planet.toFixed(3)}</span>
        ) : <span className="text-[#6b7385]">(not classified)</span>}
      </div>
    </div>
  );
}

/** Desktop sidebar panel — wraps with panel class */
export function SelectedKoiPanel() {
  return (
    <div className="panel">
      <SelectedKoiPanelBody />
    </div>
  );
}
