import { describe, expect, it } from "vitest";
import { solveKepler, heliocentricCartesian, EARTH_ELEMENTS } from "../kepler";
import { J2000 } from "../time";
import type { OrbitalElements } from "../types";

const CERES: OrbitalElements = {
  a: 2.7658, e: 0.0758, i: 10.593,
  om: 80.305, w: 73.597, ma: 95.989,
  epoch: J2000, n: 0.21408,
};

describe("kepler", () => {
  it("solveKepler converges for circular orbit", () => {
    const E = solveKepler(45, 0);
    expect(E).toBeCloseTo((45 * Math.PI) / 180, 6);
  });

  it("solveKepler converges for moderately eccentric orbit", () => {
    const E = solveKepler(45, 0.5);
    expect(E - 0.5 * Math.sin(E) - (45 * Math.PI) / 180).toBeCloseTo(0, 8);
  });

  it("heliocentricCartesian returns ~2.77 AU heliocentric distance for Ceres", () => {
    const [x, y, z] = heliocentricCartesian(CERES, J2000);
    const r = Math.sqrt(x * x + y * y + z * z);
    expect(r).toBeGreaterThan(2.0);
    expect(r).toBeLessThan(3.5);
  });

  it("Earth element propagation gives ~1 AU heliocentric distance", () => {
    const [x, y, z] = heliocentricCartesian(EARTH_ELEMENTS, J2000);
    const r = Math.sqrt(x * x + y * y + z * z);
    expect(r).toBeGreaterThan(0.97);
    expect(r).toBeLessThan(1.03);
  });

  it("Ceres position drifts after 100 days", () => {
    const [x0] = heliocentricCartesian(CERES, J2000);
    const [x1] = heliocentricCartesian(CERES, J2000 + 100);
    expect(x1).not.toBeCloseTo(x0, 2);
  });
});
