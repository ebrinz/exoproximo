"use client";
import { useStore, type BeltDrawerTab } from "@/lib/store";
import { BottomSheet } from "@/components/mobile/BottomSheet";
import { SelectedPanelBody } from "./SelectedPanel";
import { RankingPanelBody } from "./RankingPanel";
import { TimeScrubberControls } from "./TimeScrubber";

const TABS: { id: BeltDrawerTab; icon: string; label: string }[] = [
  { id: "target", icon: "🎯", label: "TARGET" },
  { id: "targets", icon: "⛏", label: "TARGETS" },
  { id: "time", icon: "⏵", label: "TIME" },
];

export function BeltMobileSheet() {
  const openDrawerTab = useStore((s) => s.openDrawerTab);
  const setOpenDrawerTab = useStore((s) => s.setOpenDrawerTab);

  const isOpen = openDrawerTab !== null;

  return (
    <>
      {/* Icon row + handle — visible only when sheet is closed, above BottomHud */}
      <div className={`fixed bottom-7 left-0 right-0 z-50 md:hidden flex flex-col items-center gap-1 transition-opacity duration-150 ${isOpen ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
        {/* Three tab shortcut icons */}
        <div className="flex gap-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenDrawerTab(t.id)}
              className="flex flex-col items-center gap-0.5 text-dim hover:text-fg transition-colors px-3 py-1"
              aria-label={`Open ${t.label} panel`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              <span className="text-[9px] tracking-caps">{t.label}</span>
            </button>
          ))}
        </div>
        {/* Drag handle indicator */}
        <div className="w-10 h-1 bg-dim rounded-full opacity-40" />
      </div>

      {/* Bottom sheet */}
      <BottomSheet isOpen={isOpen} onClose={() => setOpenDrawerTab(null)}>
        {/* Tab bar */}
        <div className="flex border-b border-rule">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setOpenDrawerTab(t.id)}
              className={`flex-1 py-2 text-[11px] tracking-caps border-b-2 transition-colors ${
                openDrawerTab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-dim hover:text-fg"
              }`}
            >
              <span className="mr-1">{t.icon}</span>
              [{t.label}]
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="h-[calc(100%-2.5rem)] overflow-hidden">
          {openDrawerTab === "target" && <SelectedPanelBody />}
          {openDrawerTab === "targets" && <RankingPanelBody />}
          {openDrawerTab === "time" && <TimeScrubberControls />}
        </div>
      </BottomSheet>
    </>
  );
}
