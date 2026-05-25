"use client";
import dynamic from "next/dynamic";

const Scene = dynamic(
  () => import("@/components/belt/Scene").then((m) => m.Scene),
  { ssr: false }
);

export default function BeltPage() {
  return (
    <main className="h-screen w-screen">
      <Scene />
    </main>
  );
}
