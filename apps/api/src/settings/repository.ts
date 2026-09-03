import { eq } from 'drizzle-orm';
import {
  DEFAULT_TEMPO_OFFPEAK,
  TEMPO_SOURCES,
  type BasePrices,
  type HpHcPrices,
  type TempoPrices,
  type OffpeakRange,
  type OffpeakSetKey,
  type OffpeakSets,
  type SettingsDto,
  type SettingsUpdateDto,
  type SubscribedPower,
  type TariffGrid,
  type TariffOption,
  type TempoSource,
  validateOffpeakRanges,
} from '@elec-ha/core';
import type { Db } from '../db/index.js';
import { offpeakRanges, settings, tariffs } from '../db/schema.js';
import type { SecretCipher } from '../crypto.js';
import { badRequest } from '../errors.js';

export interface Secrets {
  haToken: string | null;
  rteClientSecret: string | null;
}

/** Paramètres nécessaires à une simulation. */
export interface SimulationSettings {
  grid: TariffGrid;
  offpeak: OffpeakSets;
  currentOption: TariffOption;
  colorSwitchHour: number;
  smoothingRefDays: number;
  smoothingSearchWindowDays: number;
}

export class SettingsRepository {
  constructor(
    private readonly db: Db,
    private readonly cipher: SecretCipher,
  ) {
    this.ensureRow();
  }

  private ensureRow(): void {
    const row = this.db.select().from(settings).where(eq(settings.id, 1)).get();
    if (!row) {
      this.db.insert(settings).values({ id: 1 }).run();
      this.db
        .insert(offpeakRanges)
        .values(DEFAULT_TEMPO_OFFPEAK.map((r) => ({ tariffSet: 'tempo', ...r })))
        .run();
    }
  }

  private row() {
    return this.db.select().from(settings).where(eq(settings.id, 1)).get()!;
  }

  getGrid(): TariffGrid | null {
    const rows = this.db.select().from(tariffs).all();
    const byOption = new Map(rows.map((r) => [r.option, r]));
    const base = byOption.get('base');
    const hphc = byOption.get('hphc');
    const tempo = byOption.get('tempo');
    if (!base || !hphc || !tempo) return null;
    const grid: TariffGrid = {
      base: {
        subscriptionYearly: base.subscriptionYearly,
        prices: JSON.parse(base.priceJson) as BasePrices,
      },
      hphc: {
        subscriptionYearly: hphc.subscriptionYearly,
        prices: JSON.parse(hphc.priceJson) as HpHcPrices,
      },
      tempo: {
        subscriptionYearly: tempo.subscriptionYearly,
        prices: JSON.parse(tempo.priceJson) as TempoPrices,
      },
    };
    if (base.validFrom) grid.validFrom = base.validFrom;
    return grid;
  }

  getOffpeak(): OffpeakSets {
    const rows = this.db.select().from(offpeakRanges).all();
    const pick = (set: string): OffpeakRange[] =>
      rows
        .filter((r) => r.tariffSet === set)
        .map((r) => ({ startMin: r.startMin, endMin: r.endMin }));
    return { hphc: pick('hphc'), tempo: pick('tempo') };
  }

  get(): SettingsDto {
    const r = this.row();
    const grid = this.getGrid();
    return {
      ha: {
        url: r.haUrl,
        tokenSet: r.haTokenEnc !== null,
        entityId: r.entityId,
        tempoEntityId: r.tempoEntityId,
      },
      subscribedPowerKva: r.subscribedPowerKva as SubscribedPower,
      currentOption: r.currentOption as TariffOption,
      grid,
      offpeak: this.getOffpeak(),
      tempo: {
        source: r.tempoSource as TempoSource,
        rteClientId: r.rteClientId,
        rteSecretSet: r.rteSecretEnc !== null,
      },
      advanced: {
        colorSwitchHour: r.colorSwitchHour,
        smoothingRefDays: r.smoothingRefDays,
        smoothingSearchWindowDays: r.smoothingSearchWindowDays,
      },
      configured: r.haUrl !== null && r.haTokenEnc !== null && r.entityId !== null && grid !== null,
      lastSyncAt: r.lastSyncAt,
      updatedAt: r.updatedAt,
    };
  }

  getSecrets(): Secrets {
    const r = this.row();
    return {
      haToken: r.haTokenEnc ? this.cipher.decrypt(r.haTokenEnc) : null,
      rteClientSecret: r.rteSecretEnc ? this.cipher.decrypt(r.rteSecretEnc) : null,
    };
  }

  /** Connexion HA effective (URL, token, entité) ou `null` si incomplète. */
  getHaConnection(): { url: string; token: string; entityId: string | null } | null {
    const r = this.row();
    if (!r.haUrl || !r.haTokenEnc) return null;
    return { url: r.haUrl, token: this.cipher.decrypt(r.haTokenEnc), entityId: r.entityId };
  }

  getSimulationSettings(): SimulationSettings | null {
    const grid = this.getGrid();
    if (!grid) return null;
    const r = this.row();
    return {
      grid,
      offpeak: this.getOffpeak(),
      currentOption: r.currentOption as TariffOption,
      colorSwitchHour: r.colorSwitchHour,
      smoothingRefDays: r.smoothingRefDays,
      smoothingSearchWindowDays: r.smoothingSearchWindowDays,
    };
  }

  setLastSyncAt(iso: string): void {
    this.db.update(settings).set({ lastSyncAt: iso }).where(eq(settings.id, 1)).run();
  }

  update(patch: SettingsUpdateDto): SettingsDto {
    const values: Partial<typeof settings.$inferInsert> = { updatedAt: new Date().toISOString() };

    if (patch.ha) {
      if (patch.ha.url !== undefined) values.haUrl = normalizeUrl(patch.ha.url);
      if (patch.ha.token !== undefined) {
        values.haTokenEnc = patch.ha.token === '' ? null : this.cipher.encrypt(patch.ha.token);
      }
      if (patch.ha.entityId !== undefined) values.entityId = patch.ha.entityId;
      if (patch.ha.tempoEntityId !== undefined) values.tempoEntityId = patch.ha.tempoEntityId;
    }
    if (patch.subscribedPowerKva !== undefined)
      values.subscribedPowerKva = patch.subscribedPowerKva;
    if (patch.currentOption !== undefined) values.currentOption = patch.currentOption;
    if (patch.tempo) {
      if (patch.tempo.source !== undefined) {
        if (!TEMPO_SOURCES.includes(patch.tempo.source)) {
          throw badRequest(`Source Tempo inconnue : ${patch.tempo.source}`);
        }
        values.tempoSource = patch.tempo.source;
      }
      if (patch.tempo.rteClientId !== undefined) values.rteClientId = patch.tempo.rteClientId;
      if (patch.tempo.rteClientSecret !== undefined) {
        values.rteSecretEnc =
          patch.tempo.rteClientSecret === ''
            ? null
            : this.cipher.encrypt(patch.tempo.rteClientSecret);
      }
    }
    if (patch.advanced) {
      const a = patch.advanced;
      if (a.colorSwitchHour !== undefined) values.colorSwitchHour = a.colorSwitchHour;
      if (a.smoothingRefDays !== undefined) values.smoothingRefDays = a.smoothingRefDays;
      if (a.smoothingSearchWindowDays !== undefined) {
        values.smoothingSearchWindowDays = a.smoothingSearchWindowDays;
      }
    }

    const offpeakEntries = patch.offpeak
      ? (Object.entries(patch.offpeak) as [OffpeakSetKey, OffpeakRange[]][])
      : [];
    for (const [set, ranges] of offpeakEntries) {
      {
        const v = validateOffpeakRanges(ranges);
        if (!v.valid) throw badRequest(`Créneaux HC (${set}) invalides : ${v.errors.join(' ')}`);
      }
    }

    this.db.transaction((tx) => {
      tx.update(settings).set(values).where(eq(settings.id, 1)).run();
      if (patch.grid) {
        const g = patch.grid;
        const rows = [
          {
            option: 'base',
            subscriptionYearly: g.base.subscriptionYearly,
            priceJson: JSON.stringify(g.base.prices),
          },
          {
            option: 'hphc',
            subscriptionYearly: g.hphc.subscriptionYearly,
            priceJson: JSON.stringify(g.hphc.prices),
          },
          {
            option: 'tempo',
            subscriptionYearly: g.tempo.subscriptionYearly,
            priceJson: JSON.stringify(g.tempo.prices),
          },
        ].map((r) => ({ ...r, validFrom: g.validFrom ?? null }));
        tx.delete(tariffs).run();
        tx.insert(tariffs).values(rows).run();
      }
      {
        for (const [set, ranges] of offpeakEntries) {
          tx.delete(offpeakRanges).where(eq(offpeakRanges.tariffSet, set)).run();
          if (ranges.length > 0) {
            tx.insert(offpeakRanges)
              .values(
                ranges.map((r) => ({ tariffSet: set, startMin: r.startMin, endMin: r.endMin })),
              )
              .run();
          }
        }
      }
    });

    return this.get();
  }
}

export function normalizeUrl(url: string): string {
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//.test(trimmed)) throw badRequest(`URL Home Assistant invalide : ${url}`);
  return trimmed;
}
