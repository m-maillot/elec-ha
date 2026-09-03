import { addDays, compareDates, LocalClock, type TempoColor } from '@elec-ha/core';
import { ApiError } from '../errors.js';

export const RTE_BASE_URL = 'https://digital.iservices.rte-france.com';
/** Tranche maximale acceptée par l'API (jours). Réf. spec §6.4. */
export const RTE_MAX_RANGE_DAYS = 366;
/** Premier jour couvert par l'API Tempo Like Supply Contract. */
export const RTE_FIRST_DATE = '2014-09-01';

export class RteError extends ApiError {
  constructor(
    code: 'rte_unauthorized' | 'rte_quota' | 'rte_unreachable' | 'rte_error',
    message: string,
  ) {
    super(code === 'rte_unauthorized' ? 401 : 502, code, message);
    this.name = 'RteError';
  }
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
}

interface CalendarResponse {
  tempo_like_calendars?: {
    values?: Array<{ start_date: string; end_date: string; value: string }>;
  };
}

const VALUE_TO_COLOR: Record<string, TempoColor> = { BLUE: 'blue', WHITE: 'white', RED: 'red' };

export interface RteClientOptions {
  baseUrl?: string;
  clock?: LocalClock;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * Client de l'API RTE « Tempo Like Supply Contract » : OAuth2 client credentials
 * (jeton mis en cache) puis lecture du calendrier par tranches ≤ 366 jours.
 */
export class RteTempoClient {
  private readonly baseUrl: string;
  private readonly clock: LocalClock;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
    options: RteClientOptions = {},
  ) {
    this.baseUrl = (options.baseUrl ?? RTE_BASE_URL).replace(/\/+$/, '');
    this.clock = options.clock ?? new LocalClock();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      throw new RteError(
        'rte_unreachable',
        `API RTE injoignable : ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Jeton OAuth2, renouvelé une minute avant expiration. */
  async getToken(): Promise<string> {
    if (this.token && this.token.expiresAt > this.now()) return this.token.value;
    const basic = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const res = await this.request(`${this.baseUrl}/token/oauth/`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    if (res.status === 401 || res.status === 403) {
      throw new RteError(
        'rte_unauthorized',
        'Identifiants RTE refusés (client_id / client_secret).',
      );
    }
    if (!res.ok) throw new RteError('rte_error', `Obtention du jeton RTE : HTTP ${res.status}`);
    const body = (await res.json()) as TokenResponse;
    if (!body.access_token)
      throw new RteError('rte_error', 'Réponse OAuth2 RTE sans access_token.');
    const ttlMs = Math.max(60, body.expires_in ?? 7200) * 1000;
    this.token = { value: body.access_token, expiresAt: this.now() + ttlMs - 60_000 };
    return body.access_token;
  }

  /** `YYYY-MM-DDT00:00:00+01:00` (décalage local effectif à cette date). */
  formatDate(date: string): string {
    const off = this.clock.offsetMinutes(this.clock.localMidnightUtcMs(date));
    const sign = off < 0 ? '-' : '+';
    const abs = Math.abs(off);
    const hh = String(Math.floor(abs / 60)).padStart(2, '0');
    const mm = String(abs % 60).padStart(2, '0');
    return `${date}T00:00:00${sign}${hh}:${mm}`;
  }

  /** Couleurs connues sur `[from, to]` (bornes incluses), une requête par tranche de 366 jours. */
  async fetchCalendar(from: string, to: string): Promise<Record<string, TempoColor>> {
    const out: Record<string, TempoColor> = {};
    let start = compareDates(from, RTE_FIRST_DATE) < 0 ? RTE_FIRST_DATE : from;
    while (compareDates(start, to) <= 0) {
      const chunkEnd = addDays(start, RTE_MAX_RANGE_DAYS - 1);
      const end = compareDates(chunkEnd, to) > 0 ? to : chunkEnd;
      Object.assign(out, await this.fetchChunk(start, end));
      start = addDays(end, 1);
    }
    return out;
  }

  private async fetchChunk(from: string, to: string): Promise<Record<string, TempoColor>> {
    const token = await this.getToken();
    const params = new URLSearchParams({
      start_date: this.formatDate(from),
      end_date: this.formatDate(addDays(to, 1)),
    });
    const url = `${this.baseUrl}/open_api/tempo_like_supply_contract/v1/tempo_like_calendars?${params}`;
    const res = await this.request(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    });
    if (res.status === 401) {
      this.token = null;
      throw new RteError('rte_unauthorized', 'Jeton RTE refusé.');
    }
    if (res.status === 429)
      throw new RteError('rte_quota', 'Quota de l’API RTE dépassé, réessayez plus tard.');
    if (!res.ok) throw new RteError('rte_error', `Calendrier Tempo RTE : HTTP ${res.status}`);
    const body = (await res.json()) as CalendarResponse;
    const out: Record<string, TempoColor> = {};
    for (const v of body.tempo_like_calendars?.values ?? []) {
      const color = VALUE_TO_COLOR[v.value.toUpperCase()];
      const ms = Date.parse(v.start_date);
      if (!color || Number.isNaN(ms)) continue;
      // La date civile locale de début (les valeurs sont exprimées avec l'heure de bascule 06:00).
      out[this.clock.toLocal(ms).date] = color;
    }
    return out;
  }

  /** Couleur d'une date (test de configuration). */
  async colorOf(date: string): Promise<TempoColor | null> {
    const cal = await this.fetchCalendar(date, date);
    return cal[date] ?? null;
  }
}
