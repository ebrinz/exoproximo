"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";
import type { KoiRecord } from "@/lib/types";

type FilterMode = "all" | "hi" | "lo" | "disagree";

const FILTER_LABELS: { id: FilterMode; label: string }[] = [
  { id: "all",      label: "all picks" },
  { id: "hi",       label: "candidates · high p" },
  { id: "lo",       label: "candidates · low p" },
  { id: "disagree", label: "disagreements" },
];

function dispChip(d: string) {
  const cls =
    d === "CONFIRMED"     ? "border-[#4ade80] text-[#4ade80]"
    : d === "FALSE POSITIVE" ? "border-[#ff5e7a] text-[#ff5e7a]"
    : "border-[#7ee8ff] text-[#7ee8ff]";
  return (
    <span className={`px-1 py-0 text-[9px] border ${cls} whitespace-nowrap`}>{d}</span>
  );
}

function filterRows(koi: KoiRecord[], mode: FilterMode): KoiRecord[] {
  switch (mode) {
    case "all":
      return koi
        .filter((k) => k.prob_planet != null)
        .sort((a, b) => (b.prob_planet ?? 0) - (a.prob_planet ?? 0))
        .slice(0, 200);
    case "hi":
      return koi
        .filter((k) => k.koi_disposition === "CANDIDATE" && (k.prob_planet ?? 0) >= 0.9)
        .sort((a, b) => (b.prob_planet ?? 0) - (a.prob_planet ?? 0))
        .slice(0, 200);
    case "lo":
      return koi
        .filter((k) => k.koi_disposition === "CANDIDATE" && (k.prob_planet ?? 1) <= 0.1)
        .sort((a, b) => (a.prob_planet ?? 0) - (b.prob_planet ?? 0));
    case "disagree":
      return koi
        .filter((k) =>
          (k.koi_disposition === "CONFIRMED" && (k.prob_planet ?? 1) < 0.5) ||
          (k.koi_disposition === "FALSE POSITIVE" && (k.prob_planet ?? 0) > 0.5)
        )
        .sort((a, b) => Math.abs((b.prob_planet ?? 0.5) - 0.5) - Math.abs((a.prob_planet ?? 0.5) - 0.5));
  }
}

export function DisagreementTable() {
  const koi = useStore((s) => s.koi);
  const select = useKoiStore((s) => s.select);
  const selectedKepoi = useKoiStore((s) => s.selectedKepoi);
  const [mode, setMode] = useState<FilterMode>("all");

  const rows = useMemo(() => filterRows(koi, mode), [koi, mode]);

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Filter bar */}
      <div className="flex border-b border-[#1a2233] shrink-0 overflow-x-auto">
        {FILTER_LABELS.map((f) => (
          <button
            key={f.id}
            onClick={() => setMode(f.id)}
            className={`px-3 py-2 whitespace-nowrap border-b-2 transition-colors ${
              mode === f.id
                ? "border-[#7ee8ff] text-[#7ee8ff]"
                : "border-transparent text-[#6b7385] hover:text-[#e8eef5]"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[minmax(90px,auto)_minmax(110px,1fr)_120px_60px_50px_60px] gap-x-2 px-3 py-1 border-b border-[#1a2233] label-caps text-[9px] shrink-0">
        <span>kepoi</span>
        <span>kepler name</span>
        <span>disposition</span>
        <span>prob</span>
        <span>prad</span>
        <span>period</span>
      </div>

      {/* Table rows */}
      <div className="overflow-y-auto flex-1">
        {rows.length === 0 && (
          <div className="p-4 text-[#6b7385]">— no results —</div>
        )}
        {rows.map((r) => {
          const active = r.kepoi_name === selectedKepoi;
          return (
            <button
              key={r.kepoi_name}
              onClick={() => select(r.kepoi_name)}
              className={`w-full grid grid-cols-[minmax(90px,auto)_minmax(110px,1fr)_120px_60px_50px_60px] gap-x-2 px-3 py-1 text-left tabular-nums items-center ${
                active ? "bg-[#1a2233] text-[#7ee8ff]" : "hover:bg-[#1a2233]/40"
              }`}
            >
              <span className="id-bracket text-[#7ee8ff] truncate">{r.kepoi_name}</span>
              <span className="text-[#6b7385] truncate">{r.kepler_name ?? "—"}</span>
              <span>{dispChip(r.koi_disposition)}</span>
              <span>{r.prob_planet != null ? r.prob_planet.toFixed(3) : "—"}</span>
              <span>{r.koi_prad != null ? r.koi_prad.toFixed(2) : "—"}<span className="text-[#6b7385] ml-0.5">R⊕</span></span>
              <span>{r.koi_period != null ? r.koi_period.toFixed(1) : "—"}<span className="text-[#6b7385] ml-0.5">d</span></span>
            </button>
          );
        })}
      </div>

      {/* Row count */}
      <div className="border-t border-[#1a2233] px-3 py-1 text-[#6b7385] text-[10px] shrink-0">
        {rows.length} rows
      </div>
    </div>
  );
}
