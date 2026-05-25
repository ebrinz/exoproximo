"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

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
  return (
    <div className="fixed top-3 left-0 right-0 z-40 flex justify-between px-5 pointer-events-none">
      <div className="pointer-events-auto text-[12px] text-dim">
        <span className="text-fg">EXOPROXIMO</span>
        <span className="mx-1">·</span>
        v0.3
      </div>
      <div className="pointer-events-auto flex gap-2">
        {tab("/", "BELT")}
        {tab("/exoplanets", "EXOPLANETS")}
      </div>
    </div>
  );
}
