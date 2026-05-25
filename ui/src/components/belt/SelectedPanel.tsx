"use client";
import { useSelectedNeo, useNextCloseApproach, useHohmannForSelected, parseJplDate, daysFromNow } from "@/lib/selectors";
import { SpectrumChart } from "./SpectrumChart";

export function SelectedPanel() {
  const sel = useSelectedNeo();
  const ca = useNextCloseApproach(sel?.designation ?? null);
  const hoh = useHohmannForSelected();

  if (!sel) {
    return (
      <aside className="fixed top-20 left-6 w-[360px] panel p-4">
        <div className="label-caps mb-2">selected asteroid</div>
        <div className="text-dim">── select a target ──</div>
      </aside>
    );
  }

  const phys = sel.physical;
  return (
    <aside className="fixed top-20 left-6 w-[360px] panel p-4 text-xs space-y-3">
      <div>
        <div className="label-caps">selected asteroid</div>
        <div className="text-fg text-sm mt-1">
          <span className="id-bracket text-accent">{sel.designation}</span>
          {sel.name && <span className="ml-2 text-dim">&quot;{sel.name}&quot;</span>}
        </div>
      </div>

      <div>
        <span className="px-2 py-0.5 border border-rule">{phys?.spec_class ?? "?"}-type</span>
        <span className="ml-2">{phys?.diameter_km != null ? `${phys.diameter_km.toFixed(2)} km` : "size ?"}</span>
        <span className="ml-2 text-dim">albedo</span> {phys?.albedo != null ? phys.albedo.toFixed(2) : "?"}
      </div>

      <div>
        <div className="label-caps mb-1">spectrum</div>
        <SpectrumChart designation={sel.designation} />
      </div>

      <div>
        <div className="label-caps mb-1">spectral features</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-fg">
          <span>slope_vis</span><span className="tabular-nums">{sel.spectral.slope_vis.toFixed(3)}</span>
          <span>slope_nir</span><span className="tabular-nums">{sel.spectral.slope_nir.toFixed(3)}</span>
          <span>band 1µm</span>
          <span className="tabular-nums">{sel.spectral.band_depth_1um.toFixed(3)} @ {sel.spectral.band_center_1um.toFixed(2)}</span>
          <span>band 2µm</span>
          <span className="tabular-nums">{sel.spectral.band_depth_2um.toFixed(3)} @ {sel.spectral.band_center_2um.toFixed(2)}</span>
          <span>cluster</span><span>{sel.spectral.hdbscan_label}</span>
          <span>anomaly score</span><span className="tabular-nums">{sel.spectral.isoforest_score.toFixed(3)}</span>
        </div>
      </div>

      <div>
        <div className="label-caps mb-1">trajectory from earth</div>
        {hoh ? (
          <div>
            <span className="text-accent">Δv ≈ {hoh.dv.toFixed(1)}</span>
            <span className="unit">km/s</span>
            <span className="text-dim mx-2">·</span>
            <span className="text-accent">T ≈ {hoh.t.toFixed(1)}</span>
            <span className="unit">yr</span>
            <div className="text-dim text-[10px] mt-0.5">Hohmann + plane change, heliocentric circular approx.</div>
          </div>
        ) : <span className="text-dim">—</span>}
      </div>

      <div>
        <div className="label-caps mb-1">next earth approach</div>
        {ca ? (
          <div>
            <div className="text-fg">{ca.ca_date}</div>
            <div className="text-dim">
              {(() => {
                const d = parseJplDate(ca.ca_date);
                return d ? `in ${daysFromNow(d)} days` : "";
              })()}
            </div>
            <div className="tabular-nums">
              {ca.dist_au.toFixed(4)}<span className="unit">AU</span>
              <span className="text-dim mx-2">·</span>
              {(ca.dist_au * 389.17).toFixed(1)}<span className="unit">LD</span>
              <span className="text-dim mx-2">·</span>
              {ca.v_rel_km_s.toFixed(1)}<span className="unit">km/s</span>
            </div>
          </div>
        ) : <span className="text-dim">none in CAD window</span>}
      </div>
    </aside>
  );
}
