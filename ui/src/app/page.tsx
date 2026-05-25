"use client";
import dynamic from "next/dynamic";
import { SceneBootstrap } from "@/components/belt/SceneBootstrap";
import { HoverTooltip } from "@/components/belt/HoverTooltip";

const Scene = dynamic(() => import("@/components/belt/Scene").then((m) => m.Scene), { ssr: false });

export default function BeltPage() {
  return (
    <main className="h-screen w-screen">
      <SceneBootstrap>
        <Scene />
        <HoverTooltip />
      </SceneBootstrap>
    </main>
  );
}
