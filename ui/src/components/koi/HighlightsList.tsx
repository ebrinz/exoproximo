"use client";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useKoiStore } from "@/lib/koi-store";

function dispColor(d: string) {
  if (d === "CONFIRMED") return "border-[#4ade80] text-[#4ade80]";
  if (d === "FALSE POSITIVE") return "border-[#ff5e7a] text-[#ff5e7a]";
  return "border-[#7ee8ff] text-[#7ee8ff]";
}

export function HighlightsList() {
  const koi = useStore((s) => s.koi);
  const select = useKoiStore((s) => s.select);
  const selected = useKoiStore((s) => s.selectedKepoi);

  const rows = useMemo(() => koi.filter((k) => k.summary), [koi]);

  return (
    <div>
      <div className="label-caps mb-2">highlights</div>
      <div className="space-y-2">
        {rows.map((k) => {
          const active = k.kepoi_name === selected;
          const blurb = k.summary?.slice(0, 100) ?? "";
          return (
            <button
              key={k.kepoi_name}
              onClick={() => select(k.kepoi_name)}
              className={`block w-full text-left p-2 text-xs border ${
                active ? "border-[#7ee8ff] bg-[#1a2233]/40" : "border-[#1a2233] hover:bg-[#1a2233]/30"
              }`}
            >
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="id-bracket text-[#7ee8ff] text-[11px]">{k.kepoi_name}</span>
                {k.kepler_name && (
                  <span className="text-[10px] text-[#6b7385] truncate ml-2">{k.kepler_name}</span>
                )}
              </div>
              <div className="flex items-center gap-1 mb-0.5">
                <span className={`px-1 py-0 text-[9px] border ${dispColor(k.koi_disposition)}`}>
                  {k.koi_disposition}
                </span>
              </div>
              <div className="text-[#e8eef5] text-[10px] leading-snug line-clamp-2">{blurb}…</div>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="text-[#6b7385] text-xs">— highlights unavailable —</div>
        )}
      </div>
    </div>
  );
}
