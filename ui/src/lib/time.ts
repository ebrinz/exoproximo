export const J2000 = 2451545.0;
const UNIX_EPOCH_JD = 2440587.5;
const MS_PER_DAY = 86400000;

export function dateToJd(d: Date): number {
  return d.getTime() / MS_PER_DAY + UNIX_EPOCH_JD;
}

export function jdToDate(jd: number): Date {
  return new Date((jd - UNIX_EPOCH_JD) * MS_PER_DAY);
}

export function jdNow(): number {
  return dateToJd(new Date());
}
