"use client";
import { useStore } from "@/lib/store";

export function BottomHud() {
  const meta = useStore((s) => s.meta);
  if (!meta) return null;
  const ageLabel =
    meta.elements_age_days < 0 ? "(unknown age)" :
    meta.elements_age_days === 0 ? "(today)" :
    `(${meta.elements_age_days}d ago)`;
  return (
    <div className="fixed bottom-1 left-0 right-0 z-40 px-5 text-[10px] text-dim flex justify-between pointer-events-none">
      <span>
        last run: {meta.last_run_at?.slice(0, 10) ?? "—"} {ageLabel}
        <span className="mx-1">·</span>
        {meta.n_neos} NEOs · {meta.n_koi} KOI
        <span className="mx-1">·</span>
        git: {meta.git_sha}
      </span>
      <span>exoproximo · static · 60fps</span>
    </div>
  );
}
