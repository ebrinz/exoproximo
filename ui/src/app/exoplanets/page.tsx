"use client";
import { KoiBootstrap } from "@/components/koi/KoiBootstrap";
import { SkyMap } from "@/components/koi/SkyMap";
import { SelectedKoiPanel } from "@/components/koi/SelectedKoiPanel";
import { TopCandidatesPanel } from "@/components/koi/TopCandidatesPanel";
import { ReliabilityDiagram } from "@/components/koi/ReliabilityDiagram";
import { KoiMobileSheet } from "@/components/koi/KoiMobileSheet";

export default function ExoplanetsPage() {
  return (
    <main className="relative h-screen w-screen">
      <KoiBootstrap>
        {/* Desktop layout: 2-column grid with sidebar + reliability strip */}
        <div className="hidden md:grid grid-cols-[1fr_360px] grid-rows-[1fr_auto] h-full">
          <div className="relative"><SkyMap /></div>
          <aside className="border-l border-rule p-4 space-y-4 overflow-y-auto row-span-2">
            <SelectedKoiPanel />
            <TopCandidatesPanel />
          </aside>
          <div className="border-t border-rule p-3">
            <ReliabilityDiagram />
          </div>
        </div>

        {/* Mobile layout: SkyMap fills screen, bottom sheet replaces sidebar */}
        <div className="md:hidden relative h-full">
          <SkyMap />
          <KoiMobileSheet />
        </div>
      </KoiBootstrap>
    </main>
  );
}
