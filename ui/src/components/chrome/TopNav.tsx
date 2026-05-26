"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const TAGLINES: Record<string, string> = {
  "/": "Near-Earth Objects · spectral classification and retrieval-Δv assessment for asteroid mining",
  "/exoplanets": "Kepler Objects of Interest · classifier outputs and habitable-zone search across 9,201 candidates",
};

export function TopNav() {
  const path = usePathname();
  const tab = (href: string, label: string) => (
    <Link
      href={href}
      className={clsx(
        "px-2 py-1 border tracking-caps text-[11px]",
        path === href ? "border-accent text-accent" : "border-rule text-dim hover:text-fg",
      )}
    >
      [{label}]
    </Link>
  );
  const tagline = TAGLINES[path] ?? "";
  return (
    <div className="fixed top-3 left-0 right-0 z-40 flex justify-between items-start px-3 md:px-5 pointer-events-none">
      <div className="pointer-events-auto">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-fg text-[18px] font-semibold tracking-wide leading-none hidden sm:inline">EXOPROXIMO</span>
          <span className="font-display text-fg text-[18px] font-semibold tracking-wide leading-none sm:hidden">EXO</span>
          <span className="text-[10px] text-dim leading-none">v0.3</span>
        </div>
        {tagline && (
          <div className="text-[10px] text-dim hidden md:block mt-1 max-w-xl leading-snug">
            {tagline}
          </div>
        )}
      </div>
      <div className="pointer-events-auto flex gap-2">
        {tab("/", "NEAR-EARTH")}
        {tab("/exoplanets", "EXOPLANETS")}
      </div>
    </div>
  );
}
