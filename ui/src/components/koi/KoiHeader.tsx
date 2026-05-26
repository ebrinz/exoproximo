"use client";

export function KoiHeader() {
  return (
    <div className="px-5 py-3 text-xs border-b border-rule flex items-baseline gap-4 bg-[#05070d]/85 backdrop-blur shrink-0">
      <span className="label-caps text-[#e8eef5]">KEPLER CATALOG</span>
      <span className="text-[#6b7385]">9,201 candidates · 115 deg² of Cygnus · 2009–2018</span>
      <span className="text-[#6b7385] flex-1 text-right">classifier: HGB, test AUC 0.976</span>
    </div>
  );
}
