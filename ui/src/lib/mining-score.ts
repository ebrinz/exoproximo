import type { NeoRecord } from "./types";

const SPEC_MULTIPLIER: Record<string, number> = {
  M: 3.0, C: 2.5, B: 2.0, X: 2.5, S: 1.0, Q: 1.0, V: 1.0,
};

/** Composite mining score. Higher = more attractive target.
 *  Inputs are all real numbers; the *combination* is heuristic — clearly labeled
 *  in the UI as such.
 */
export function miningScore(record: NeoRecord, dvKmS: number): number {
  const diameter = record.physical?.diameter_km ?? 0.2;
  const firstLetter = record.physical?.spec_class?.[0] ?? "";
  const mult = SPEC_MULTIPLIER[firstLetter] ?? 0.5;
  return (diameter / Math.max(dvKmS, 1.0)) * mult;
}
