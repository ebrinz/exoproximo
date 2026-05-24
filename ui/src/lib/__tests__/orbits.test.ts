import { describe, expect, it } from "vitest";
import { sampleOrbitEllipse, propagateBatch } from "../orbits";
import { EARTH_ELEMENTS } from "../kepler";
import { J2000 } from "../time";
import type { NeoRecord } from "../types";

const fakeNeo = (designation: string, a: number): NeoRecord => ({
  designation, name: null,
  elements: { a, e: 0.0, i: 0, om: 0, w: 0, ma: 0, epoch: J2000, n: 0.5 },
  physical: null,
  spectral: {
    slope_vis: 0, slope_nir: 0,
    band_depth_1um: 0, band_center_1um: 1,
    band_depth_2um: 0, band_center_2um: 2,
    pc1: 0, pc2: 0, hdbscan_label: -1, isoforest_score: 0,
  },
});

describe("orbits", () => {
  it("sampleOrbitEllipse returns N points roughly at distance a for circular orbit", () => {
    const pts = sampleOrbitEllipse(EARTH_ELEMENTS, 64);
    expect(pts.length).toBe(64 * 3);
    for (let i = 0; i < 64; i++) {
      const x = pts[3 * i], y = pts[3 * i + 1], z = pts[3 * i + 2];
      const r = Math.sqrt(x * x + y * y + z * z);
      expect(r).toBeGreaterThan(0.97);
      expect(r).toBeLessThan(1.03);
    }
  });

  it("propagateBatch writes 3 floats per asteroid into a flat buffer", () => {
    const neos = [fakeNeo("a", 1.2), fakeNeo("b", 1.5), fakeNeo("c", 2.0)];
    const out = new Float32Array(neos.length * 3);
    propagateBatch(neos, J2000, out);
    expect(out[0] ** 2 + out[1] ** 2 + out[2] ** 2).toBeGreaterThan(0);
    expect(out[3] ** 2 + out[4] ** 2 + out[5] ** 2).toBeGreaterThan(0);
    expect(out[6] ** 2 + out[7] ** 2 + out[8] ** 2).toBeGreaterThan(0);
  });
});
