import type { SettingsDto, SimulateResponse } from '@elec-ha/core';
import { TARIF_BLEU_2026_08 } from '@elec-ha/core';

export const configuredSettings: SettingsDto = {
  ha: {
    url: 'http://ha.local:8123',
    tokenSet: true,
    entityIds: ['sensor.linky_hp', 'sensor.linky_hc'],
  },
  subscribedPowerKva: 6,
  currentOption: 'base',
  grid: TARIF_BLEU_2026_08[6]!,
  offpeak: { hphc: [{ startMin: 1320, endMin: 360 }], tempo: [{ startMin: 1320, endMin: 360 }] },
  tempo: { source: 'rte', rteClientId: 'cid', rteSecretSet: true },
  advanced: { colorSwitchHour: 6, smoothingRefDays: 3, smoothingSearchWindowDays: 14 },
  configured: true,
  lastSyncAt: '2026-09-03T08:00:00.000Z',
  updatedAt: '2026-09-03T08:00:00.000Z',
};

export const simulation: SimulateResponse = {
  period: { from: '2026-01-15', to: '2026-01-16', days: 2 },
  kwhTotal: 10,
  hours: { expected: 48, present: 48, missing: 0 },
  missingDays: [],
  negativeHours: 0,
  base: {
    option: 'base',
    total: 3.0439,
    consumption: 2.001,
    subscription: 1.0429,
    kwh: 10,
    averagePrice: 0.2001,
    deltaVsCurrent: null,
  },
  hphc: {
    option: 'hphc',
    total: 2.8531,
    consumption: 1.8102,
    subscription: 1.0429,
    kwh: 10,
    averagePrice: 0.18102,
    deltaVsCurrent: { amount: -0.1908, percent: -6.27 },
    hp: { kwh: 4, share: 0.4, cost: 0.8568 },
    hc: { kwh: 6, share: 0.6, cost: 0.9534 },
  },
  tempo: {
    option: 'tempo',
    total: 4.9259,
    consumption: 3.887,
    subscription: 1.0389,
    kwh: 10,
    averagePrice: 0.3887,
    deltaVsCurrent: { amount: 1.882, percent: 61.83 },
    partial: false,
    excludedKwh: 0,
    excludedDays: [],
    unknownDays: [],
    byColor: {
      blue: { days: 1, hpKwh: 0, hcKwh: 0, hpCost: 0, hcCost: 0, total: 0 },
      white: { days: 0, hpKwh: 0, hcKwh: 0, hpCost: 0, hcCost: 0, total: 0 },
      red: { days: 1, hpKwh: 4, hcKwh: 6, hpCost: 2.918, hcCost: 0.969, total: 3.887 },
    },
  },
  best: 'hphc',
  warnings: [],
  smoothingApplied: false,
  lastSyncAt: '2026-09-03T08:00:00.000Z',
};
