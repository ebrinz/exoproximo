"use client";
import { create } from "zustand";

type State = {
  selectedKepoi: string | null;
  hoverKepoi: string | null;
  highlightedBin: number | null;        // 0..9, the reliability-diagram bin to glow
  select: (id: string | null) => void;
  hover: (id: string | null) => void;
  setHighlightedBin: (b: number | null) => void;
};

export const useKoiStore = create<State>((set) => ({
  selectedKepoi: null,
  hoverKepoi: null,
  highlightedBin: null,
  select: (selectedKepoi) => set({ selectedKepoi }),
  hover: (hoverKepoi) => set({ hoverKepoi }),
  setHighlightedBin: (highlightedBin) => set({ highlightedBin }),
}));
