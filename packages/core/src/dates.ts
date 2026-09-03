/** Utilitaires sur les dates civiles `YYYY-MM-DD` (sans fuseau, arithmétique pure). */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  return toIsoDate(ms) === value;
}

/** Formate un timestamp (interprété en UTC) en `YYYY-MM-DD`. */
export function toIsoDate(utcMs: number): string {
  const d = new Date(utcMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Convertit `YYYY-MM-DD` en timestamp UTC de minuit (utile pour l'arithmétique). */
export function isoDateToUtcMs(date: string): number {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`Date invalide : ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function addDays(date: string, days: number): string {
  return toIsoDate(isoDateToUtcMs(date) + days * 86_400_000);
}

/** Nombre de jours civils inclus dans `[from, to]` (bornes incluses). */
export function daysInclusive(from: string, to: string): number {
  return Math.round((isoDateToUtcMs(to) - isoDateToUtcMs(from)) / 86_400_000) + 1;
}

/** Liste des dates de `from` à `to` incluses. */
export function eachDay(from: string, to: string): string[] {
  const n = daysInclusive(from, to);
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(addDays(from, i));
  return out;
}

/** Comparaison lexicographique valable pour le format `YYYY-MM-DD`. */
export function compareDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
