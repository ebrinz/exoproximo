"use client";
import dynamic from "next/dynamic";
import { SceneBootstrap } from "@/components/belt/SceneBootstrap";
import { HoverTooltip } from "@/components/belt/HoverTooltip";
import { TimeScrubber } from "@/components/belt/TimeScrubber";
import { PlayLoop } from "@/components/belt/PlayLoop";
import { SelectedPanel } from "@/components/belt/SelectedPanel";
import { RankingPanel } from "@/components/belt/RankingPanel";
import { HashSelector } from "@/components/belt/HashSelector";
import { BeltMobileSheet } from "@/components/belt/BeltMobileSheet";

const Scene = dynamic(() => import("@/components/belt/Scene").then((m) => m.Scene), { ssr: false });

export default function BeltPage() {
  return (
    <main className="h-screen w-screen">
      <SceneBootstrap>
        <PlayLoop />
        <HashSelector />
        <Scene />
        <SelectedPanel />
        <RankingPanel />
        <HoverTooltip />
        <TimeScrubber />
        <BeltMobileSheet />
      </SceneBootstrap>
    </main>
  );
}
