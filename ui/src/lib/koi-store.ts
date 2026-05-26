"use client";
import { create } from "zustand";

export type KoiDrawerTab = "target" | "zones" | "picks" | "calib";

type State = {
  selectedKepoi: string | null;
  hoverKepoi: string | null;
  highlightedBin: number | null;        // 0..9, the reliability-diagram bin to glow
  openDrawerTab: KoiDrawerTab | null;
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setHighlightedBin: (b: number | null) => void;
  setOpenDrawerTab: (tab: KoiDrawerTab | null) => void;
};

export const useKoiStore = create<State>((set) => ({
  selectedKepoi: null,
  hoverKepoi: null,
  highlightedBin: null,
  openDrawerTab: null,
  select: (selectedKepoi) => set((s) => ({
    selectedKepoi,
    // On mobile: open the drawer to "target" only when it's currently
    // CLOSED. If the user is already on TOP or CALIB and clicks a row,
    // keep them there.
    openDrawerTab:
      selectedKepoi != null && s.openDrawerTab === null
        ? "target"
        : s.openDrawerTab,
  })),
  hover: (hoverKepoi) => set({ hoverKepoi }),
  setHighlightedBin: (highlightedBin) => set({ highlightedBin }),
  setOpenDrawerTab: (openDrawerTab) => set({ openDrawerTab }),
}));
