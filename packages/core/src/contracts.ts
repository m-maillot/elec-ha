/**
 * Contrats de l'API interne (backend ↔ front). Types uniquement, aucun code.
 * Réf. spec §6.6.
 */
import type { SimulationResult } from './simulate.js';
import type { SmoothingProfile, SmoothingSummary } from './smoothing.js';
import type {
  OffpeakSets,
  SubscribedPower,
  TariffGrid,
  TariffOption,
  TempoColor,
} from './types.js';

export type TempoSource = 'rte' | 'csv';
export const TEMPO_SOURCES: readonly TempoSource[] = ['rte', 'csv'];

export interface HaSettingsDto {
  url: string | null;
  /** Le token n'est jamais renvoyé, seulement « défini : oui/non ». */
  tokenSet: boolean;
  /**
   * Entités de consommation (statistic_id). Plusieurs entités sont additionnées heure par
   * heure, par exemple un index HP et un index HC issus du Linky.
   */
  entityIds: string[];
}

export interface TempoSettingsDto {
  source: TempoSource;
  rteClientId: string | null;
  rteSecretSet: boolean;
}

export interface AdvancedSettingsDto {
  colorSwitchHour: number;
  smoothingRefDays: number;
  smoothingSearchWindowDays: number;
  smoothingProfile: SmoothingProfile;
}

export interface SettingsDto {
  ha: HaSettingsDto;
  subscribedPowerKva: SubscribedPower;
  currentOption: TariffOption;
  /** `null` tant qu'aucune grille n'a été saisie. */
  grid: TariffGrid | null;
  offpeak: OffpeakSets;
  tempo: TempoSettingsDto;
  advanced: AdvancedSettingsDto;
  /** `true` si HA (URL, token, au moins une entité) et la grille sont renseignés. */
  configured: boolean;
  lastSyncAt: string | null;
  updatedAt: string | null;
}

/** Mise à jour partielle : tout champ absent est inchangé. Les secrets ne sont jamais relus. */
export interface SettingsUpdateDto {
  ha?: {
    url?: string;
    token?: string;
    entityIds?: string[];
  };
  subscribedPowerKva?: SubscribedPower;
  currentOption?: TariffOption;
  grid?: TariffGrid;
  offpeak?: OffpeakSets;
  tempo?: {
    source?: TempoSource;
    rteClientId?: string | null;
    rteClientSecret?: string;
  };
  advanced?: Partial<AdvancedSettingsDto>;
}

export interface HaTestRequest {
  url?: string;
  /** Absent = token déjà stocké. */
  token?: string;
}

export interface HaEntityDto {
  statisticId: string;
  name: string | null;
  unit: string;
  source: string;
}

export interface HaEntitiesResponse {
  entities: HaEntityDto[];
  /** Nombre total de statistiques exposées par le recorder (diagnostic). */
  totalStatistics: number;
}

export interface HaTestResponse extends HaEntitiesResponse {
  ok: true;
  version: string;
  eligibleEntities: number;
}

export type Granularity = 'hour' | 'day' | 'month';

export interface ConsumptionPoint {
  /** Début du point (epoch ms UTC). */
  start: number;
  /** Clé locale : `YYYY-MM-DDTHH:00` (heure), `YYYY-MM-DD` (jour) ou `YYYY-MM` (mois). */
  key: string;
  /** kWh, `null` si toutes les heures du point sont absentes. */
  kwh: number | null;
  missingHours: number;
  /** Part HC selon le jeu HP/HC (maille heure uniquement, sinon 0). */
  hcShareHphc: number;
  /** Part HC selon le jeu Tempo (maille heure uniquement, sinon 0). */
  hcShareTempo: number;
  /** Couleur du jour Tempo (maille heure et jour), `null` si inconnue ou maille mois. */
  tempoColor: TempoColor | null;
}

export interface ConsumptionResponse {
  from: string;
  to: string;
  granularity: Granularity;
  points: ConsumptionPoint[];
  lastSyncAt: string | null;
}

export interface SimulateRequest {
  from: string;
  to: string;
  /** Absent = option actuelle des settings. */
  currentOption?: TariffOption;
  smoothing?: { enabled: boolean };
}

export interface SimulateResponse extends SimulationResult {
  smoothingApplied: boolean;
  /** Présent quand le lissage a été appliqué. */
  smoothing?: SmoothingSummary;
  lastSyncAt: string | null;
}

export interface TempoDayDto {
  date: string;
  color: TempoColor;
  source: string;
}

export interface TempoDaysResponse {
  from: string;
  to: string;
  days: TempoDayDto[];
  /** Dates de la période sans couleur connue. */
  missing: string[];
}

export interface TempoCsvImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Résultat de la complétion automatique des couleurs Tempo lors d'une sync. */
export interface TempoCompletionResult {
  /** Source utilisée (`null` si aucune source automatique n'est configurée). */
  source: TempoSource | null;
  fetched: number;
  /** Dates de la période encore inconnues après complétion. */
  missing: number;
  /** Message d'erreur si la source a échoué (la sync de consommation reste valide). */
  error?: string;
}

export interface RteTestRequest {
  clientId?: string;
  /** Absent = secret déjà stocké. */
  clientSecret?: string;
}

export interface RteTestResponse {
  ok: true;
  date: string;
  color: TempoColor | null;
}

export type SyncEvent =
  | {
      type: 'progress';
      step: 'consumption' | 'tempo';
      done: number;
      total: number;
      message: string;
    }
  | {
      type: 'done';
      consumption: { chunks: number; hoursStored: number; daysRequested: number };
      tempo: TempoCompletionResult;
      lastSyncAt: string;
    }
  | { type: 'error'; code: string; message: string };

export interface ApiError {
  code: string;
  error: string;
}
