"use client";
import { useStore, type BeltDrawerTab } from "@/lib/store";
import { BottomSheet, haptic } from "@/components/mobile/BottomSheet";
import { SheetShortcuts } from "@/components/mobile/SheetShortcuts";
import { BeltSelectedContextStrip } from "./BeltSelectedContextStrip";
import { SelectedPanelBody } from "./SelectedPanel";
import { RankingPanelBody } from "./RankingPanel";
import { TimeScrubberControls } from "./TimeScrubber";

const TABS: { id: BeltDrawerTab; label: string }[] = [
  { id: "target",  label: "DETAIL"   },
  { id: "targets", label: "MANIFEST" },
  { id: "time",    label: "RATE"     },
];

export function BeltMobileSheet() {
  const openDrawerTab    = useStore((s) => s.openDrawerTab);
  const setOpenDrawerTab = useStore((s) => s.setOpenDrawerTab);

  const isOpen = openDrawerTab !== null;

  function openTab(id: string) {
    haptic();
    setOpenDrawerTab(id as BeltDrawerTab);
  }

  function handleTabSwitch(id: BeltDrawerTab) {
    haptic();
    setOpenDrawerTab(id);
  }

  return (
    <>
      {/* Unified bottom shortcut bar — hidden while sheet is open */}
      <SheetShortcuts
        tabs={TABS}
        activeTab={openDrawerTab}
        isOpen={isOpen}
        onOpen={openTab}
      />

      {/* Bottom sheet */}
      <BottomSheet isOpen={isOpen} onClose={() => { haptic(); setOpenDrawerTab(null); }}>
        {/* Tab bar */}
        <div className="flex border-b border-rule">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabSwitch(t.id)}
              className={`flex-1 py-2 text-[11px] tracking-caps border-b-2 transition-colors font-mono ${
                openDrawerTab === t.id
                  ? "border-accent text-accent"
                  : "border-transparent text-dim hover:text-fg"
              }`}
            >
              [{t.label}]
            </button>
          ))}
        </div>

        {/* Context strip (MANIFEST + RATE only — DETAIL already shows selection) */}
        {(openDrawerTab === "targets" || openDrawerTab === "time") && (
          <BeltSelectedContextStrip />
        )}

        {/* Tab content — key forces re-mount on switch to restart fade animation */}
        <div key={openDrawerTab ?? "none"} className="sheet-tab-content h-[calc(100%-2.5rem)] overflow-hidden">
          {openDrawerTab === "target"  && <SelectedPanelBody />}
          {openDrawerTab === "targets" && <RankingPanelBody />}
          {openDrawerTab === "time"    && <TimeScrubberControls />}
        </div>
      </BottomSheet>
    </>
  );
}
