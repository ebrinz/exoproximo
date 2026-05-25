"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

export function TopCandidatesPanel() {
  const koi = useStore((s) => s.koi);
  const select = useKoiStore((s) => s.select);
  const selectedKepoi = useKoiStore((s) => s.selectedKepoi);

  const rows = useMemo(() => {
    return koi
      .filter((k) => k.koi_disposition === "CANDIDATE" && k.prob_planet != null)
      .sort((a, b) => (b.prob_planet ?? 0) - (a.prob_planet ?? 0))
      .slice(0, 50);
  }, [koi]);

  return (
    <div className="panel text-xs flex flex-col" style={{ maxHeight: 360 }}>
      <div className="p-3 border-b border-rule">
        <div className="label-caps">top candidates · prob_planet ↓</div>
      </div>
      <div className="overflow-y-auto">
        {rows.map((r) => {
          const active = r.kepoi_name === selectedKepoi;
          return (
            <button
              key={r.kepoi_name}
              onClick={() => select(r.kepoi_name)}
              className={`w-full flex justify-between px-3 py-0.5 text-left tabular-nums
                          ${active ? "bg-rule text-accent" : "hover:bg-rule/40"}`}
            >
              <span className="id-bracket truncate">{r.kepoi_name}</span>
              <span>{(r.prob_planet ?? 0).toFixed(3)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
