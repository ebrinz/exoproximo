"use client";
import { create } from "zustand";
import { jdNow } from "./time";
import type { NeoRecord, KoiRecord, Meta, CloseApproachRecord } from "./types";

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
};

export const useStore = create<State>((set) => ({
  jd: jdNow(),
  playing: false,
  playSpeed: 1, // 1 day/sec by default
  selectedDesignation: null,
  hoverDesignation: null,
  neos: [],
  koi: [],
  closeApproaches: [],
  meta: null,
  loadError: null,

  setJd: (jd) => set({ jd }),
  setPlaying: (playing) => set({ playing }),
  setPlaySpeed: (playSpeed) => set({ playSpeed }),
  resetToNow: () => set({ jd: jdNow() }),
  select: (selectedDesignation) => set({ selectedDesignation }),
  hover: (hoverDesignation) => set({ hoverDesignation }),
  setData: (data) => set(data),
  setLoadError: (loadError) => set({ loadError }),
}));
