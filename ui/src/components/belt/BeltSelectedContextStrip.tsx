"use client";
import { useSelectedNeo, useHohmannForSelected } from "@/lib/selectors";

/**
 * Thin one-line strip showing the currently selected asteroid.
 * Displayed inside the sheet on MANIFEST and RATE tabs so the user
 * keeps track of their selection when the 3D scene is hidden.
 */
export function BeltSelectedContextStrip() {
  const sel = useSelectedNeo();
  const hoh = useHohmannForSelected();

  if (!sel) return null;

  const specClass = sel.physical?.spec_class ?? "?";
  const au = sel.elements.a.toFixed(2);
  const dv = hoh ? hoh.dv.toFixed(1) : "—";

  return (
    <div className="px-3 py-1.5 border-b border-rule text-[11px] text-dim font-mono flex items-center gap-2 overflow-hidden whitespace-nowrap">
      <span className="text-dim/60 tracking-caps text-[9px]">TRACKING</span>
      <span className="text-accent">[{sel.designation}]</span>
      {sel.name && <span>{sel.name}</span>}
      <span className="text-dim/60">·</span>
      <span>{specClass}-type</span>
      <span className="text-dim/60">·</span>
      <span>{au} AU</span>
      <span className="text-dim/60">·</span>
      <span>&#x394;v {dv}</span>
    </div>
  );
}
