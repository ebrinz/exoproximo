"use client";
import { KoiBootstrap } from "@/components/koi/KoiBootstrap";
import { SkyMap } from "@/components/koi/SkyMap";
import { SelectedKoiPanel } from "@/components/koi/SelectedKoiPanel";
import { TopCandidatesPanel } from "@/components/koi/TopCandidatesPanel";

export default function ExoplanetsPage() {
  return (
    <main className="relative h-screen w-screen">
      <KoiBootstrap>
        <div className="grid grid-cols-[1fr_360px] h-full">
          <div className="relative"><SkyMap /></div>
          <aside className="border-l border-rule p-4 space-y-4 overflow-y-auto">
            <SelectedKoiPanel />
            <TopCandidatesPanel />
          </aside>
        </div>
      </KoiBootstrap>
    </main>
  );
}
