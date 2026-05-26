export type OrbitalElements = {
  a: number; e: number; i: number;
  om: number; w: number; ma: number;
  epoch: number; n: number;
};

export type Physical = {
  h_mag: number | null;
  diameter_km: number | null;
  albedo: number | null;
  spec_class: string | null;
};

export type Spectral = {
  slope_vis: number; slope_nir: number;
  band_depth_1um: number; band_center_1um: number;
  band_depth_2um: number; band_center_2um: number;
  pc1: number; pc2: number;
  hdbscan_label: number;
  isoforest_score: number;
};

export type NeoTags = {
  composition: string;
  composition_confidence: string;
  accessibility: string;
  mass_tier: string;
  anomaly: boolean;
};

export type NeoRecord = {
  designation: string;
  name: string | null;
  elements: OrbitalElements;
  physical: Physical | null;
  spectral: Spectral;
  summary: string | null;
  tags: NeoTags | null;
};

export type KoiRecord = {
  kepoi_name: string;
  kepler_name: string | null;
  ra: number; dec: number;
  koi_disposition: "CONFIRMED" | "CANDIDATE" | "FALSE POSITIVE";
  koi_period: number | null;
  koi_prad: number | null;
  koi_teq: number | null;
  koi_steff: number | null;
  koi_srad: number | null;
  prob_planet: number | null;
};

export type CloseApproachRecord = {
  designation: string;
  body: string;
  ca_date: string;
  dist_au: number;
  v_rel_km_s: number;
};

export type SpectrumPoint = { wavelength: number; reflectance: number; error: number };
export type SpectrumFile = SpectrumPoint[];

export type Meta = {
  git_sha: string;
  last_run_at: string | null;
  elements_age_days: number;
  n_neos: number;
  n_koi: number;
};
