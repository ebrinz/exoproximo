import type {
  NeoRecord, KoiRecord, CloseApproachRecord, SpectrumFile, Meta,
} from "./types";

const BASE = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/data`;

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} failed: ${r.status}`);
  return (await r.json()) as T;
}

function assertField(obj: unknown, path: string, key: string): void {
  if (
    obj === null ||
    typeof obj !== "object" ||
    !(key in (obj as Record<string, unknown>)) ||
    (obj as Record<string, unknown>)[key] === undefined
  ) {
    throw new Error(`missing field ${path}.${key}`);
  }
}

function validateNeo(rec: unknown, idx: number): NeoRecord {
  const path = `neos[${idx}]`;
  if (typeof rec !== "object" || rec === null) throw new Error(`${path} is not an object`);
  const r = rec as Record<string, unknown>;
  assertField(r, path, "designation");
  assertField(r, path, "elements");
  const e = r.elements as Record<string, unknown>;
  for (const k of ["a", "e", "i", "om", "w", "ma", "epoch", "n"]) {
    if (typeof e[k] !== "number") throw new Error(`${path}.elements.${k} must be number`);
  }
  assertField(r, path, "spectral");
  return rec as NeoRecord;
}

function validateKoi(rec: unknown, idx: number): KoiRecord {
  const path = `koi[${idx}]`;
  if (typeof rec !== "object" || rec === null) throw new Error(`${path} is not an object`);
  const r = rec as Record<string, unknown>;
  assertField(r, path, "kepoi_name");
  if (typeof r.ra !== "number" || typeof r.dec !== "number") {
    throw new Error(`${path} ra/dec must be numbers`);
  }
  return rec as KoiRecord;
}

export async function loadNeos(): Promise<NeoRecord[]> {
  const raw = await fetchJson<unknown[]>(`${BASE}/neos.json`);
  if (!Array.isArray(raw)) throw new Error("neos.json is not an array");
  return raw.map(validateNeo);
}

export async function loadKoi(): Promise<KoiRecord[]> {
  const raw = await fetchJson<unknown[]>(`${BASE}/koi.json`);
  if (!Array.isArray(raw)) throw new Error("koi.json is not an array");
  return raw.map(validateKoi);
}

export async function loadCloseApproaches(): Promise<CloseApproachRecord[]> {
  const raw = await fetchJson<unknown[]>(`${BASE}/close_approaches.json`);
  if (!Array.isArray(raw)) throw new Error("close_approaches.json is not an array");
  return raw as CloseApproachRecord[];
}

export async function loadMeta(): Promise<Meta> {
  return await fetchJson<Meta>(`${BASE}/meta.json`);
}

export async function loadSpectrum(designation: string): Promise<SpectrumFile> {
  return await fetchJson<SpectrumFile>(`${BASE}/spectra/${encodeURIComponent(designation)}.json`);
}
