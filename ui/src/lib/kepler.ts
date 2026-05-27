import type { OrbitalElements } from "./types";
import { J2000 } from "./time";

const deg2rad = (d: number) => (d * Math.PI) / 180;
const mod360 = (n: number) => ((n % 360) + 360) % 360;

export function meanAnomaly(elements: OrbitalElements, jd: number): number {
  return mod360(elements.ma + elements.n * (jd - elements.epoch));
}

export function solveKepler(meanAnomalyDeg: number, eccentricity: number): number {
  const m = deg2rad(meanAnomalyDeg);
  let E = eccentricity < 0.8 ? m : Math.PI;
  for (let i = 0; i < 50; i++) {
    const delta =
      (E - eccentricity * Math.sin(E) - m) / (1 - eccentricity * Math.cos(E));
    E -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return E;
}

export function trueAnomaly(E: number, e: number): number {
  const beta = e / (1 + Math.sqrt(1 - e * e));
  return E + 2 * Math.atan((beta * Math.sin(E)) / (1 - beta * Math.cos(E)));
}

export function heliocentricRadius(a: number, e: number, E: number): number {
  return a * (1 - e * Math.cos(E));
}

/** Heliocentric ecliptic Cartesian (x, y, z) in AU. */
export function heliocentricCartesian(
  elements: OrbitalElements,
  jd: number,
): [number, number, number] {
  const m = meanAnomaly(elements, jd);
  const E = solveKepler(m, elements.e);
  const ta = trueAnomaly(E, elements.e);
  const r = heliocentricRadius(elements.a, elements.e, E);
  const xOrb = r * Math.cos(ta);
  const yOrb = r * Math.sin(ta);

  const nodeRad = deg2rad(elements.om);
  const periRad = deg2rad(elements.w);
  const iRad = deg2rad(elements.i);
  const cosN = Math.cos(nodeRad), sinN = Math.sin(nodeRad);
  const cosI = Math.cos(iRad),    sinI = Math.sin(iRad);
  const cosP = Math.cos(periRad), sinP = Math.sin(periRad);

  const p1 = cosP * cosN - sinP * sinN * cosI;
  const p2 = cosP * sinN + sinP * cosN * cosI;
  const p3 = sinP * sinI;
  const q1 = -sinP * cosN - cosP * sinN * cosI;
  const q2 = -sinP * sinN + cosP * cosN * cosI;
  const q3 = cosP * sinI;

  const x = p1 * xOrb + q1 * yOrb;
  const y = p2 * xOrb + q2 * yOrb;
  const z = p3 * xOrb + q3 * yOrb;
  return [x, y, z];
}

/** Earth's orbital elements at J2000 (textbook). Used for propagating Earth in-scene. */
export const EARTH_ELEMENTS: OrbitalElements = {
  a: 1.00000011, e: 0.01671022, i: 0.00005,
  om: 348.73936, w: 102.94719, ma: 357.51716,
  epoch: J2000, n: 0.9856474,
};

/** Mercury J2000 textbook elements. */
export const MERCURY_ELEMENTS: OrbitalElements = {
  a: 0.387099, e: 0.205630, i: 7.005,
  om: 48.331, w: 29.124, ma: 174.796,
  epoch: J2000, n: 4.092339,
};

/** Venus J2000 textbook elements. */
export const VENUS_ELEMENTS: OrbitalElements = {
  a: 0.723332, e: 0.006772, i: 3.39458,
  om: 76.680, w: 54.884, ma: 50.115,
  epoch: J2000, n: 1.602169,
};

/** Mars J2000 textbook elements. */
export const MARS_ELEMENTS: OrbitalElements = {
  a: 1.523679, e: 0.093400, i: 1.850,
  om: 49.578, w: 286.502, ma: 19.412,
  epoch: J2000, n: 0.524033,
};
