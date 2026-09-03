import {
  createConnection,
  createLongLivedTokenAuth,
  ERR_CANNOT_CONNECT,
  ERR_INVALID_AUTH,
  ERR_INVALID_HTTPS_TO_HTTP,
  type Connection,
} from 'home-assistant-js-websocket';
import { ApiError } from '../errors.js';

export class HaError extends ApiError {
  constructor(code: 'ha_unauthorized' | 'ha_unreachable' | 'ha_protocol', message: string) {
    super(code === 'ha_unauthorized' ? 401 : 502, code, message);
    this.name = 'HaError';
  }
}

/**
 * Élément de `recorder/list_statistic_ids`. HA ≥ 2022.10 expose
 * `statistics_unit_of_measurement` / `display_unit_of_measurement` et `unit_class` ;
 * les versions plus anciennes exposaient `unit_of_measurement`.
 */
export interface HaStatisticId {
  statistic_id: string;
  name: string | null;
  source: string;
  has_sum: boolean;
  has_mean?: boolean;
  mean_type?: number;
  unit_class?: string | null;
  statistics_unit_of_measurement?: string | null;
  display_unit_of_measurement?: string | null;
  unit_of_measurement?: string | null;
}

/** Bucket brut renvoyé par `recorder/statistics_during_period`. */
export interface HaStatBucket {
  /** Début (epoch ms UTC). */
  start: number;
  end: number;
  sum: number | null;
  change: number | null;
}

const ELIGIBLE_UNITS = new Set(['kwh', 'wh', 'mwh', 'gwh']);

/** Unité affichée d'une statistique, quel que soit le format de la version HA. */
export function statisticUnit(s: HaStatisticId): string {
  return (
    s.display_unit_of_measurement ?? s.statistics_unit_of_measurement ?? s.unit_of_measurement ?? ''
  );
}

/** Énergie cumulée (index) : `has_sum` et unité d'énergie (ou `unit_class: energy`). */
export function isEligibleEnergyStatistic(s: HaStatisticId): boolean {
  if (!s.has_sum) return false;
  if (s.unit_class === 'energy') return true;
  return ELIGIBLE_UNITS.has(statisticUnit(s).trim().toLowerCase());
}

function toMs(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return Date.parse(v);
  throw new HaError('ha_protocol', `Horodatage inattendu dans la réponse HA : ${String(v)}`);
}

/** Client Home Assistant : REST pour le test, WebSocket pour le recorder. */
export class HaClient {
  constructor(
    readonly url: string,
    private readonly token: string,
  ) {}

  /** `GET /api/` + `GET /api/config` : vérifie l'accès et récupère la version. */
  async testRest(): Promise<{ version: string }> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/api/config`, {
        headers: { Authorization: `Bearer ${this.token}` },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      throw new HaError(
        'ha_unreachable',
        `Home Assistant injoignable sur ${this.url} : ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    if (res.status === 401 || res.status === 403) {
      throw new HaError('ha_unauthorized', 'Token Home Assistant refusé (401).');
    }
    if (!res.ok)
      throw new HaError('ha_protocol', `Réponse inattendue de Home Assistant : HTTP ${res.status}`);
    const body = (await res.json()) as { version?: string };
    return { version: body.version ?? 'inconnue' };
  }

  async withConnection<T>(fn: (conn: Connection) => Promise<T>): Promise<T> {
    let conn: Connection;
    try {
      conn = await createConnection({
        auth: createLongLivedTokenAuth(this.url, this.token),
        setupRetry: 0,
      });
    } catch (err) {
      switch (err) {
        case ERR_INVALID_AUTH:
          throw new HaError('ha_unauthorized', 'Token Home Assistant refusé par le WebSocket.');
        case ERR_CANNOT_CONNECT:
        case ERR_INVALID_HTTPS_TO_HTTP:
          throw new HaError(
            'ha_unreachable',
            `Impossible d'ouvrir le WebSocket Home Assistant sur ${this.url}.`,
          );
        default:
          throw new HaError('ha_unreachable', `Connexion Home Assistant échouée : ${String(err)}`);
      }
    }
    try {
      return await fn(conn);
    } catch (err) {
      if (err instanceof HaError) throw err;
      const msg =
        typeof err === 'object' && err && 'message' in err ? String(err.message) : String(err);
      throw new HaError('ha_protocol', `Erreur Home Assistant : ${msg}`);
    } finally {
      conn.close();
    }
  }

  listStatisticIds(conn: Connection): Promise<HaStatisticId[]> {
    return conn.sendMessagePromise<HaStatisticId[]>({ type: 'recorder/list_statistic_ids' });
  }

  /** Statistiques horaires `[startMs, endMs[` converties en kWh, par entité. */
  async statisticsDuringPeriod(
    conn: Connection,
    statisticIds: readonly string[],
    startMs: number,
    endMs: number,
  ): Promise<Record<string, HaStatBucket[]>> {
    const result = await conn.sendMessagePromise<Record<string, Array<Record<string, unknown>>>>({
      type: 'recorder/statistics_during_period',
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
      statistic_ids: [...statisticIds],
      period: 'hour',
      types: ['sum', 'change'],
      units: { energy: 'kWh' },
    });
    const out: Record<string, HaStatBucket[]> = {};
    for (const id of statisticIds) {
      out[id] = (result[id] ?? []).map((r) => ({
        start: toMs(r['start']),
        end: toMs(r['end']),
        sum: typeof r['sum'] === 'number' ? r['sum'] : null,
        change: typeof r['change'] === 'number' ? r['change'] : null,
      }));
    }
    return out;
  }
}
