import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadNeos, loadKoi, loadMeta, loadSpectrum, loadCloseApproaches } from "../data";

const goodNeo = {
  designation: "X1", name: null,
  elements: { a: 1.5, e: 0.1, i: 5, om: 30, w: 60, ma: 90, epoch: 2451545, n: 0.5 },
  physical: null,
  spectral: {
    slope_vis: 0, slope_nir: 0,
    band_depth_1um: 0, band_center_1um: 1, band_depth_2um: 0, band_center_2um: 2,
    pc1: 0, pc2: 0, hdbscan_label: -1, isoforest_score: 0,
  },
};

const fetchMock = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);

describe("data loaders", () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it("loadNeos parses valid array", async () => {
    vi.stubGlobal("fetch", fetchMock(200, [goodNeo]));
    const neos = await loadNeos();
    expect(neos.length).toBe(1);
    expect(neos[0].designation).toBe("X1");
  });

  it("loadNeos rejects when an item is missing elements", async () => {
    const bad = { ...goodNeo, elements: undefined };
    vi.stubGlobal("fetch", fetchMock(200, [bad]));
    await expect(loadNeos()).rejects.toThrow(/elements/);
  });

  it("loadKoi parses valid array", async () => {
    vi.stubGlobal("fetch", fetchMock(200, [{
      kepoi_name: "K1", kepler_name: null, ra: 290, dec: 48,
      koi_disposition: "CONFIRMED", koi_period: 9.5, koi_prad: 2.2,
      koi_teq: 800, koi_steff: 5455, koi_srad: 0.9, prob_planet: 0.9,
    }]));
    const koi = await loadKoi();
    expect(koi.length).toBe(1);
  });

  it("loadMeta returns parsed object", async () => {
    vi.stubGlobal("fetch", fetchMock(200, {
      git_sha: "abc", last_run_at: null, elements_age_days: 0, n_neos: 1, n_koi: 1,
    }));
    const meta = await loadMeta();
    expect(meta.git_sha).toBe("abc");
  });

  it("loadSpectrum throws on 404", async () => {
    vi.stubGlobal("fetch", fetchMock(404, null));
    await expect(loadSpectrum("nope")).rejects.toThrow();
  });

  it("loadCloseApproaches parses", async () => {
    vi.stubGlobal("fetch", fetchMock(200, [
      { designation: "X", body: "Earth", ca_date: "2059-Mar-23", dist_au: 0.05, v_rel_km_s: 12 },
    ]));
    const ca = await loadCloseApproaches();
    expect(ca[0].body).toBe("Earth");
  });
});
