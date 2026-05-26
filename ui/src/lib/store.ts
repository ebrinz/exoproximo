"use client";
import { create } from "zustand";
import { jdNow } from "./time";
import type { NeoRecord, KoiRecord, Meta, CloseApproachRecord } from "./types";

export type BeltDrawerTab = "target" | "targets" | "time";

type State = {
  jd: number;
  playing: boolean;
  playSpeed: number;            // days per real-time second
  selectedDesignation: string | null;
  hoverDesignation: string | null;
  neos: NeoRecord[];
  koi: KoiRecord[];
  closeApproaches: CloseApproachRecord[];
  meta: Meta | null;
  loadError: string | null;
  openDrawerTab: BeltDrawerTab | null;

  setJd: (jd: number) => void;
  setPlaying: (p: boolean) => void;
  setPlaySpeed: (s: number) => void;
  resetToNow: () => void;
  select: (d: string | null) => void;
  hover: (d: string | null) => void;
  setData: (data: {
    neos: NeoRecord[];
    koi: KoiRecord[];
    closeApproaches: CloseApproachRecord[];
    meta: Meta;
  }) => void;
  setLoadError: (err: string | null) => void;
  setOpenDrawerTab: (tab: BeltDrawerTab | null) => void;
};

export const useStore = create<State>((set) => ({
  jd: jdNow(),
  playing: true,
  playSpeed: 30, // 1mo/s by default; the UI starts already animating
  // Default landing: 132 Aethra — large M-type metallic body, the
  // catalog's headline metals candidate (Psyche analog, since Psyche
  // itself is main-belt and not in the NEO catalog).
  selectedDesignation: "132",
  hoverDesignation: null,
  neos: [],
  koi: [],
  closeApproaches: [],
  meta: null,
  loadError: null,
  openDrawerTab: null,

  setJd: (jd) => set({ jd }),
  setPlaying: (playing) => set({ playing }),
  setPlaySpeed: (playSpeed) => set({ playSpeed }),
  resetToNow: () => set({ jd: jdNow() }),
  select: (selectedDesignation) => set((s) => ({
    selectedDesignation,
    // On mobile: open the drawer to "target" only when it's currently
    // CLOSED. If it's already open on another tab (e.g. MANIFEST while
    // browsing the ranked list), keep the user there so they can keep
    // tapping rows without being yanked into DETAIL each time.
    openDrawerTab:
      selectedDesignation != null && s.openDrawerTab === null
        ? "target"
        : s.openDrawerTab,
  })),
  hover: (hoverDesignation) => set({ hoverDesignation }),
  setData: (data) => set(data),
  setLoadError: (loadError) => set({ loadError }),
  setOpenDrawerTab: (openDrawerTab) => set({ openDrawerTab }),
}));
