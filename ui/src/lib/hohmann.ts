const MU_SUN_AU3_YR2 = 4 * Math.PI ** 2;
const AU_PER_YR_TO_KM_S = 4.74047;

/** Hohmann transfer Δv from Earth (1 AU, circular) to a target with semi-major axis `targetA` (AU)
 *  and inclination `targetIDeg` (degrees). Adds a simple plane-change penalty `2 * v2 * sin(i/2)`.
 *  Returns Δv in km/s.
 */
export function hohmannDv(targetA: number, targetIDeg: number): number {
  const r1 = 1.0;
  const r2 = targetA;
  const v1 = Math.sqrt(MU_SUN_AU3_YR2 / r1);
  const v2 = Math.sqrt(MU_SUN_AU3_YR2 / r2);
  const aT = (r1 + r2) / 2;
  const vPeri = Math.sqrt(MU_SUN_AU3_YR2 * (2 / r1 - 1 / aT));
  const vApo  = Math.sqrt(MU_SUN_AU3_YR2 * (2 / r2 - 1 / aT));
  const dvBurn = Math.abs(vPeri - v1) + Math.abs(v2 - vApo);
  const iRad = (targetIDeg * Math.PI) / 180;
  const dvIncl = 2 * v2 * Math.sin(iRad / 2);
  return (dvBurn + dvIncl) * AU_PER_YR_TO_KM_S;
}

/** Hohmann transfer time in years, Earth -> target with semi-major axis `targetA` (AU). */
export function transferTimeYears(targetA: number): number {
  const aT = (1.0 + targetA) / 2;
  return Math.PI * Math.sqrt((aT * aT * aT) / MU_SUN_AU3_YR2);
}
