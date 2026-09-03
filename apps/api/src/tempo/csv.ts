import { isIsoDate, type TempoColor, type TempoCsvImportResult } from '@elec-ha/core';
import type { Db } from '../db/index.js';
import { tempoDays } from '../db/schema.js';

const COLOR_ALIASES: Record<string, TempoColor> = {
  blue: 'blue',
  bleu: 'blue',
  white: 'white',
  blanc: 'white',
  red: 'red',
  rouge: 'red',
};

export function parseColor(raw: string): TempoColor | undefined {
  return COLOR_ALIASES[raw.trim().toLowerCase()];
}

/** Normalise `JJ/MM/AAAA` ou `AAAA-MM-JJ` vers `AAAA-MM-JJ`. */
export function parseDate(raw: string): string | undefined {
  const s = raw.trim();
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : s;
  return isIsoDate(iso) ? iso : undefined;
}

/**
 * Import CSV `date;couleur` (séparateur `;` ou `,`, en-tête facultatif, `#` = commentaire).
 * Une date déjà renseignée par une autre source n'est pas écrasée sauf si `overwrite`.
 */
export function importTempoCsv(db: Db, csv: string, overwrite = false): TempoCsvImportResult {
  const result: TempoCsvImportResult = { imported: 0, skipped: 0, errors: [] };
  const fetchedAt = new Date().toISOString();
  const rows: { date: string; color: TempoColor }[] = [];

  csv.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [rawDate = '', rawColor = ''] = trimmed.split(/[;,\t]/);
    const date = parseDate(rawDate);
    const color = parseColor(rawColor);
    if (!date || !color) {
      // En-tête toléré sur la première ligne
      if (i === 0 && !date) return;
      result.errors.push(`Ligne ${i + 1} ignorée : « ${trimmed} »`);
      return;
    }
    rows.push({ date, color });
  });

  db.transaction((tx) => {
    for (const r of rows) {
      const q = tx.insert(tempoDays).values({ ...r, source: 'csv', fetchedAt });
      const res = overwrite
        ? q
            .onConflictDoUpdate({
              target: tempoDays.date,
              set: { color: r.color, source: 'csv', fetchedAt },
            })
            .run()
        : q.onConflictDoNothing().run();
      if (res.changes > 0) result.imported++;
      else result.skipped++;
    }
  });
  return result;
}
