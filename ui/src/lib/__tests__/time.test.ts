import { describe, expect, it } from "vitest";
import { dateToJd, jdToDate, jdNow, J2000 } from "../time";

describe("time helpers", () => {
  it("dateToJd matches J2000", () => {
    const d = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
    expect(dateToJd(d)).toBeCloseTo(J2000, 5);
  });

  it("jdToDate is the inverse of dateToJd", () => {
    const d = new Date(Date.UTC(2026, 4, 23, 0, 0, 0));
    const round = jdToDate(dateToJd(d));
    expect(round.getTime()).toBe(d.getTime());
  });

  it("jdNow returns a JD near the current time", () => {
    const before = dateToJd(new Date());
    const n = jdNow();
    const after = dateToJd(new Date());
    expect(n).toBeGreaterThanOrEqual(before);
    expect(n).toBeLessThanOrEqual(after);
  });
});
