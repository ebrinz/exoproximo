"use client";
import { useKoiStore, type KoiDrawerTab } from "@/lib/koi-store";
import { BottomSheet, haptic } from "@/components/mobile/BottomSheet";
import { SheetShortcuts } from "@/components/mobile/SheetShortcuts";
import { KoiSelectedContextStrip } from "./KoiSelectedContextStrip";
import { SelectedKoiPanelBody } from "./SelectedKoiPanel";
import { HabitableZoneScatter } from "./HabitableZoneScatter";
import { DisagreementTable } from "./DisagreementTable";
import { ReliabilityDiagram } from "./ReliabilityDiagram";

const TABS: { id: KoiDrawerTab; label: string }[] = [
  { id: "target", label: "DETAIL" },
  { id: "zones",  label: "ZONES"  },
  { id: "picks",  label: "PICKS"  },
  { id: "calib",  label: "CALIB"  },
];

export function KoiMobileSheet() {
  const openDrawerTab    = useKoiStore((s) => s.openDrawerTab);
  const setOpenDrawerTab = useKoiStore((s) => s.setOpenDrawerTab);

  const isOpen = openDrawerTab !== null;

  function openTab(id: string) {
    haptic();
    setOpenDrawerTab(id as KoiDrawerTab);
  }

  function handleTabSwitch(id: KoiDrawerTab) {
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

        {/* Context strip on ZONES, PICKS, CALIB — DETAIL already shows selection */}
        {(openDrawerTab === "zones" || openDrawerTab === "picks" || openDrawerTab === "calib") && (
          <KoiSelectedContextStrip />
        )}

        {/* Tab content — key forces re-mount on switch to restart fade animation */}
        <div key={openDrawerTab ?? "none"} className="sheet-tab-content h-[calc(100%-2.5rem)] overflow-hidden">
          {openDrawerTab === "target" && <SelectedKoiPanelBody />}
          {openDrawerTab === "zones"  && <HabitableZoneScatter />}
          {openDrawerTab === "picks"  && <DisagreementTable />}
          {openDrawerTab === "calib"  && (
            <div className="p-3 overflow-y-auto h-full">
              <ReliabilityDiagram />
            </div>
          )}
        </div>
      </BottomSheet>
    </>
  );
}
