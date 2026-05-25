"use client";
import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { hohmannDv } from "@/lib/hohmann";
import { miningScore } from "@/lib/mining-score";
import { specClassColor } from "@/lib/spec-class";

type SortKey = "score" | "dv" | "diameter" | "class";

export function RankingPanel() {
  const neos = useStore((s) => s.neos);
  const select = useStore((s) => s.select);
  const selected = useStore((s) => s.selectedDesignation);
  const [sort, setSort] = useState<SortKey>("score");

  const rows = useMemo(() => {
    const enriched = neos.map((n) => {
      const dv = hohmannDv(n.elements.a, n.elements.i);
      return {
        n,
        dv,
        diameter: n.physical?.diameter_km ?? null,
        cls: n.physical?.spec_class ?? "?",
        score: miningScore(n, dv),
      };
    });
    enriched.sort((a, b) => {
      switch (sort) {
        case "dv": return a.dv - b.dv;
        case "diameter": return (b.diameter ?? -1) - (a.diameter ?? -1);
        case "class": return a.cls.localeCompare(b.cls);
        case "score":
        default: return b.score - a.score;
      }
    });
    return enriched;
  }, [neos, sort]);

  return (
    <aside className="fixed top-20 right-6 w-[340px] panel text-xs flex flex-col"
           style={{ maxHeight: "calc(100vh - 160px)" }}>
      <div className="p-3 border-b border-rule">
        <div className="label-caps">mining targets <span className="text-warn">🜨 heuristic</span></div>
      </div>
      <div className="grid grid-cols-[1fr_28px_44px_44px_44px] gap-x-2 px-3 py-1 text-dim border-b border-rule">
        <Header label="designation" />
        <Header label="cls" onClick={() => setSort("class")} />
        <Header label="Δv" onClick={() => setSort("dv")} active={sort === "dv"} />
        <Header label="diam" onClick={() => setSort("diameter")} active={sort === "diameter"} />
        <Header label="score" onClick={() => setSort("score")} active={sort === "score"} />
      </div>
      <div className="overflow-y-auto">
        {rows.slice(0, 200).map(({ n, dv, diameter, cls, score }) => {
          const active = n.designation === selected;
          return (
            <button
              key={n.designation}
              onClick={() => select(n.designation)}
              className={`w-full grid grid-cols-[1fr_28px_44px_44px_44px] gap-x-2 px-3 py-0.5 text-left tabular-nums
                          ${active ? "bg-rule text-accent" : "hover:bg-rule/40"}`}
            >
              <span className="id-bracket truncate">{n.designation}</span>
              <span style={{ color: `#${specClassColor(cls).toString(16).padStart(6, "0")}` }}>{cls[0] ?? "?"}</span>
              <span>{dv.toFixed(1)}</span>
              <span>{diameter != null ? diameter.toFixed(2) : "—"}</span>
              <span>{score.toFixed(2)}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function Header({ label, onClick, active }: { label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-left ${active ? "text-accent" : "text-dim"} ${onClick ? "hover:text-fg" : ""}`}
      disabled={!onClick}
    >
      {label}
    </button>
  );
}
