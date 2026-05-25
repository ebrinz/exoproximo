import { useMemo } from "react";
import { useStore } from "./store";
import { heliocentricCartesian, EARTH_ELEMENTS } from "./kepler";
import { hohmannDv, transferTimeYears } from "./hohmann";
import type { CloseApproachRecord, NeoRecord } from "./types";

export function useSelectedNeo(): NeoRecord | null {
  return useStore((s) =>
    s.selectedDesignation ? s.neos.find((n) => n.designation === s.selectedDesignation) ?? null : null,
  );
}

export function useNextCloseApproach(designation: string | null): CloseApproachRecord | null {
  const cas = useStore((s) => s.closeApproaches);
  return useMemo(() => {
    if (!designation) return null;
    const today = new Date();
    return (
      cas
        .filter((c) => c.designation === designation)
        .map((c) => ({ ...c, t: parseJplDate(c.ca_date)?.getTime() ?? Infinity }))
        .filter((c) => c.t >= today.getTime())
        .sort((a, b) => a.t - b.t)[0] ?? null
    );
  }, [cas, designation]);
}

export function useEarthAndTargetPositions(designation: string | null) {
  const jd = useStore((s) => s.jd);
  const neos = useStore((s) => s.neos);
  return useMemo(() => {
    const [ex, ey, ez] = heliocentricCartesian(EARTH_ELEMENTS, jd);
    const target = designation ? neos.find((n) => n.designation === designation) : null;
    if (!target) return { earth: [ex, ey, ez] as [number, number, number], target: null };
    const [tx, ty, tz] = heliocentricCartesian(target.elements, jd);
    return {
      earth: [ex, ey, ez] as [number, number, number],
      target: [tx, ty, tz] as [number, number, number],
    };
  }, [jd, designation, neos]);
}

export function useHohmannForSelected(): { dv: number; t: number } | null {
  const sel = useSelectedNeo();
  return useMemo(() => {
    if (!sel) return null;
    return { dv: hohmannDv(sel.elements.a, sel.elements.i), t: transferTimeYears(sel.elements.a) };
  }, [sel]);
}

/** JPL CAD ca_date examples: "2059-Mar-23 21:11". This parses to a Date or returns null. */
export function parseJplDate(s: string): Date | null {
  const m = s.match(/^(\d{4})-([A-Za-z]{3})-(\d{2})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!m) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const mo = months.indexOf(m[2]);
  if (mo < 0) return null;
  return new Date(Date.UTC(+m[1], mo, +m[3], +(m[4] ?? "0"), +(m[5] ?? "0")));
}

export function daysFromNow(d: Date): number {
  return Math.round((d.getTime() - Date.now()) / 86400000);
}
