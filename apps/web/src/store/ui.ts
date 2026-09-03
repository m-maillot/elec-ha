import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TariffOption } from '@elec-ha/core';

export type ColorMode = TariffOption;
export type PeriodPreset = 'last30' | 'last12m' | 'tempoSeason' | 'lastYear' | 'custom';

interface UiState {
  from: string;
  to: string;
  preset: PeriodPreset;
  smoothing: boolean;
  colorMode: ColorMode;
  showSmoothed: boolean;
  setPeriod: (from: string, to: string, preset?: PeriodPreset) => void;
  setSmoothing: (v: boolean) => void;
  setColorMode: (m: ColorMode) => void;
  setShowSmoothed: (v: boolean) => void;
}

function isoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Bornes d'une présélection de période (dates locales incluses). */
export function presetRange(
  preset: Exclude<PeriodPreset, 'custom'>,
  now = new Date(),
): { from: string; to: string } {
  const to = new Date(now);
  to.setDate(to.getDate() - 1); // hier : aujourd'hui est incomplet
  switch (preset) {
    case 'last30': {
      const from = new Date(to);
      from.setDate(from.getDate() - 29);
      return { from: isoLocal(from), to: isoLocal(to) };
    }
    case 'last12m': {
      const from = new Date(to);
      from.setFullYear(from.getFullYear() - 1);
      from.setDate(from.getDate() + 1);
      return { from: isoLocal(from), to: isoLocal(to) };
    }
    case 'tempoSeason': {
      const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      return { from: `${year}-09-01`, to: isoLocal(to) };
    }
    case 'lastYear': {
      const y = now.getFullYear() - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
  }
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      ...presetRange('last30'),
      preset: 'last30',
      smoothing: false,
      colorMode: 'tempo',
      showSmoothed: true,
      setPeriod: (from, to, preset = 'custom') => set({ from, to, preset }),
      setSmoothing: (smoothing) => set({ smoothing }),
      setColorMode: (colorMode) => set({ colorMode }),
      setShowSmoothed: (showSmoothed) => set({ showSmoothed }),
    }),
    { name: 'elec-ha-ui' },
  ),
);
