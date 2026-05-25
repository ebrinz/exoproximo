import { describe, expect, it } from "vitest";
import { hohmannDv, transferTimeYears } from "../hohmann";

describe("hohmann", () => {
  it("Earth->Mars Δv ≈ 5.6 km/s (coplanar)", () => {
    const dv = hohmannDv(1.524, 0);
    expect(dv).toBeGreaterThan(5.3);
    expect(dv).toBeLessThan(5.9);
  });

  it("Earth->Vesta Δv ≈ 12.4 km/s (with small inclination)", () => {
    const dv = hohmannDv(2.36, 7.14);
    expect(dv).toBeGreaterThan(11.5);
    expect(dv).toBeLessThan(13.5);
  });

  it("higher inclination raises Δv", () => {
    const a = hohmannDv(1.5, 0);
    const b = hohmannDv(1.5, 20);
    expect(b).toBeGreaterThan(a);
  });

  it("transferTimeYears(Mars) ≈ 0.7 yr", () => {
    const t = transferTimeYears(1.524);
    expect(t).toBeGreaterThan(0.65);
    expect(t).toBeLessThan(0.75);
  });
});
