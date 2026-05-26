"use client";
import { useStore } from "@/lib/store";
import { jdNow, jdToDate } from "@/lib/time";

const DAYS_PER_YEAR = 365.25;

const SPEEDS: { label: string; days: number }[] = [
  { label: "1d/s", days: 1 },
  { label: "1mo/s", days: 30 },
  { label: "1y/s", days: DAYS_PER_YEAR },
];

function fmtOffset(jd: number): string {
  const days = jd - jdNow();
  const yrs = days / DAYS_PER_YEAR;
  const sign = yrs >= 0 ? "+" : "-";
  const absYrs = Math.abs(yrs);
  if (absYrs < 1 / 12) return `${sign}${Math.round(Math.abs(days))}d`;
  if (absYrs < 1) return `${sign}${Math.round(absYrs * 12)}mo`;
  const y = Math.floor(absYrs);
  const mo = Math.round((absYrs - y) * 12);
  return mo === 0 ? `${sign}${y}y` : `${sign}${y}y ${mo}mo`;
}

/** Shared controls body — used by both desktop panel and mobile sheet tab */
export function TimeScrubberControls() {
  const jd = useStore((s) => s.jd);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.playSpeed);
  const setJd = useStore((s) => s.setJd);
  const setPlaying = useStore((s) => s.setPlaying);
  const setSpeed = useStore((s) => s.setPlaySpeed);
  const resetToNow = useStore((s) => s.resetToNow);

  const now = jdNow();
  const min = now - 5 * DAYS_PER_YEAR;
  const max = now + 50 * DAYS_PER_YEAR;
  const date = jdToDate(jd);

  return (
    <div className="p-4 text-xs space-y-4">
      <div className="label-caps mb-2">time scrubber</div>

      {/* Date display */}
      <div className="tabular-nums text-sm">
        <span className="text-fg">{date.toISOString().slice(0, 10)}</span>
        <span className="ml-2 text-accent">{fmtOffset(jd)}</span>
      </div>

      {/* Slider — full width on mobile */}
      <input
        type="range"
        min={min} max={max} step={1} value={jd}
        onChange={(e) => setJd(parseFloat(e.target.value))}
        className="w-full accent-accent"
      />

      {/* Controls row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setPlaying(!playing)}
          className="px-3 py-1.5 border border-rule hover:border-accent transition-colors"
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? "❚❚" : "▶"}
        </button>
        <div className="flex gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s.label}
              onClick={() => setSpeed(s.days)}
              className={`px-2 py-1 border ${speed === s.days ? "border-accent text-accent" : "border-rule text-dim"}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          onClick={resetToNow}
          className="px-2 py-1 border border-rule hover:border-accent text-dim hover:text-accent ml-auto"
        >
          RESET TO NOW
        </button>
      </div>
    </div>
  );
}

/** Desktop fixed-position panel — hidden on mobile */
export function TimeScrubber() {
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 panel px-4 py-2 hidden md:flex items-center gap-3 text-xs">
      <TimeScrubberInline />
    </div>
  );
}

/** Inline version for the desktop bar (original layout preserved) */
function TimeScrubberInline() {
  const jd = useStore((s) => s.jd);
  const playing = useStore((s) => s.playing);
  const speed = useStore((s) => s.playSpeed);
  const setJd = useStore((s) => s.setJd);
  const setPlaying = useStore((s) => s.setPlaying);
  const setSpeed = useStore((s) => s.setPlaySpeed);
  const resetToNow = useStore((s) => s.resetToNow);

  const now = jdNow();
  const min = now - 5 * DAYS_PER_YEAR;
  const max = now + 50 * DAYS_PER_YEAR;
  const date = jdToDate(jd);

  return (
    <>
      <button
        onClick={() => setPlaying(!playing)}
        className="px-2 py-1 border border-rule hover:border-accent transition-colors"
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <input
        type="range"
        min={min} max={max} step={1} value={jd}
        onChange={(e) => setJd(parseFloat(e.target.value))}
        className="w-[420px] accent-accent"
      />
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s.label}
            onClick={() => setSpeed(s.days)}
            className={`px-2 py-1 border ${speed === s.days ? "border-accent text-accent" : "border-rule text-dim"}`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <span className="text-dim w-[140px] text-right tabular-nums">
        {date.toISOString().slice(0, 10)} <span className="text-fg">{fmtOffset(jd)}</span>
      </span>
      <button
        onClick={resetToNow}
        className="px-2 py-1 border border-rule hover:border-accent text-dim hover:text-accent"
      >
        RESET TO NOW
      </button>
    </>
  );
}
