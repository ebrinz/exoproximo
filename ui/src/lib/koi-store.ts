"use client";
import { create } from "zustand";

export type KoiDrawerTab = "target" | "top" | "calibration";

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
    // On mobile, auto-open to "target" tab when something is selected
    openDrawerTab: selectedKepoi != null ? "target" : s.openDrawerTab,
  })),
  hover: (hoverKepoi) => set({ hoverKepoi }),
  setHighlightedBin: (highlightedBin) => set({ highlightedBin }),
  setOpenDrawerTab: (openDrawerTab) => set({ openDrawerTab }),
}));
