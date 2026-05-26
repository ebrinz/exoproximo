"use client";
import { useState } from "react";
import { KoiBootstrap } from "@/components/koi/KoiBootstrap";
import { KoiHeader } from "@/components/koi/KoiHeader";
import { HighlightsList } from "@/components/koi/HighlightsList";
import { HabitableZoneScatter } from "@/components/koi/HabitableZoneScatter";
import { DisagreementTable } from "@/components/koi/DisagreementTable";
import { SkyMap } from "@/components/koi/SkyMap";
import { ReliabilityDiagram } from "@/components/koi/ReliabilityDiagram";
import { SelectedKoiPanelBody } from "@/components/koi/SelectedKoiPanel";
import { KoiMobileSheet } from "@/components/koi/KoiMobileSheet";

type MainTab = "zones" | "picks" | "field" | "calib";

const TAB_LABELS: { id: MainTab; label: string }[] = [
  { id: "zones", label: "ZONES" },
  { id: "picks", label: "PICKS" },
  { id: "field", label: "FIELD" },
  { id: "calib", label: "CALIB" },
];

export default function ExoplanetsPage() {
  const [mainTab, setMainTab] = useState<MainTab>("zones");

  return (
    <main className="relative h-screen w-screen overflow-hidden">
      <KoiBootstrap>
        {/* ── Desktop layout ── */}
        <div className="hidden md:flex flex-col h-full">
          <KoiHeader />

          <div className="grid grid-cols-[280px_1fr_340px] flex-1 min-h-0">
            {/* Left rail — highlights */}
            <aside className="border-r border-rule overflow-y-auto p-3">
              <HighlightsList />
            </aside>

            {/* Center — switchable main view */}
            <div className="flex flex-col min-h-0">
              {/* Tab bar */}
              <div className="flex border-b border-rule shrink-0">
                {TAB_LABELS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setMainTab(t.id)}
                    className={`flex-1 py-2 text-[11px] tracking-widest border-b-2 transition-colors font-mono ${
                      mainTab === t.id
                        ? "border-[#7ee8ff] text-[#7ee8ff]"
                        : "border-transparent text-[#6b7385] hover:text-[#e8eef5]"
                    }`}
                  >
                    [{t.label}]
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0 overflow-hidden">
                {mainTab === "zones" && <HabitableZoneScatter />}
                {mainTab === "picks" && <DisagreementTable />}
                {mainTab === "field" && (
                  <div className="relative h-full w-full">
                    <SkyMap />
                  </div>
                )}
                {mainTab === "calib" && (
                  <div className="p-4 overflow-y-auto h-full">
                    <ReliabilityDiagram />
                  </div>
                )}
              </div>
            </div>

            {/* Right rail — selected KOI */}
            <aside className="border-l border-rule overflow-y-auto">
              <SelectedKoiPanelBody />
            </aside>
          </div>
        </div>

        {/* ── Mobile layout (existing KoiMobileSheet + full-screen SkyMap) ── */}
        <div className="md:hidden h-full">
          <SkyMap />
          <KoiMobileSheet />
        </div>
      </KoiBootstrap>
    </main>
  );
}
