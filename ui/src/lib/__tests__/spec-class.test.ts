import { describe, expect, it } from "vitest";
import { specClassColor } from "../spec-class";

describe("spec-class", () => {
  it("S-type maps to accent cyan", () => {
    expect(specClassColor("S")).toBe(0x7ee8ff);
  });
  it("C-type maps to warn amber", () => {
    expect(specClassColor("C")).toBe(0xffb547);
  });
  it("M-type maps to metal magenta", () => {
    expect(specClassColor("M")).toBe(0xb18cff);
  });
  it("null/unknown maps to dim", () => {
    expect(specClassColor(null)).toBe(0x6b7385);
    expect(specClassColor("???")).toBe(0x6b7385);
  });
  it("multi-letter classes use first letter (e.g. 'S:' -> S)", () => {
    expect(specClassColor("S:")).toBe(0x7ee8ff);
  });
});
