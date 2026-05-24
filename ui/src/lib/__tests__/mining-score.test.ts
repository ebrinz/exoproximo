import { describe, expect, it } from "vitest";
import { miningScore } from "../mining-score";
import type { NeoRecord } from "../types";
import { J2000 } from "../time";

const make = (diameter: number | null, cls: string | null): NeoRecord => ({
  designation: "x", name: null,
  elements: { a: 1.5, e: 0, i: 0, om: 0, w: 0, ma: 0, epoch: J2000, n: 0.5 },
  physical: { h_mag: null, diameter_km: diameter, albedo: null, spec_class: cls },
  spectral: {
    slope_vis: 0, slope_nir: 0,
    band_depth_1um: 0, band_center_1um: 1, band_depth_2um: 0, band_center_2um: 2,
    pc1: 0, pc2: 0, hdbscan_label: -1, isoforest_score: 0,
  },
});

describe("mining-score", () => {
  it("monotonic in diameter (more rock, more score)", () => {
    const a = miningScore(make(0.5, "S"), 6);
    const b = miningScore(make(1.5, "S"), 6);
    expect(b).toBeGreaterThan(a);
  });

  it("monotonic decreasing in Δv (cheaper to reach, more score)", () => {
    const a = miningScore(make(1.0, "S"), 12);
    const b = miningScore(make(1.0, "S"), 6);
    expect(b).toBeGreaterThan(a);
  });

  it("M-type beats S-type at same size and Δv", () => {
    const s = miningScore(make(1.0, "S"), 6);
    const m = miningScore(make(1.0, "M"), 6);
    expect(m).toBeGreaterThan(s);
  });

  it("null physical gives a small but finite score", () => {
    const v = miningScore(make(null, null), 6);
    expect(v).toBeGreaterThan(0);
    expect(Number.isFinite(v)).toBe(true);
  });
});
