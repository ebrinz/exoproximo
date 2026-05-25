import { heliocentricCartesian, solveKepler } from "./kepler";
import type { NeoRecord, OrbitalElements } from "./types";

/** Sample N points along the orbit ellipse by sweeping mean anomaly 0..360 at fixed epoch.
 *  Returns a flat Float32Array of length N*3 in heliocentric ecliptic AU. */
export function sampleOrbitEllipse(elements: OrbitalElements, n: number): Float32Array {
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const ma = (i / n) * 360;
    const local: OrbitalElements = { ...elements, ma, epoch: elements.epoch };
    // Use heliocentricCartesian at jd = epoch so the propagator just uses `ma` as-is.
    const [x, y, z] = heliocentricCartesian(local, elements.epoch);
    out[3 * i] = x;
    out[3 * i + 1] = y;
    out[3 * i + 2] = z;
  }
  return out;
}

/** Propagate all asteroids to the given JD and write x/y/z into `out` (length must be neos.length*3). */
export function propagateBatch(neos: NeoRecord[], jd: number, out: Float32Array): void {
  for (let i = 0; i < neos.length; i++) {
    const [x, y, z] = heliocentricCartesian(neos[i].elements, jd);
    out[3 * i] = x;
    out[3 * i + 1] = y;
    out[3 * i + 2] = z;
  }
}

// Re-export solveKepler so consumers don't need a second import.
export { solveKepler };
