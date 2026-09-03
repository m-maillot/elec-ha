import { useState } from 'react';
import type { SimulateResponse } from '@elec-ha/core';
import { t } from '../../i18n/fr.js';
import { fmt } from '../../lib/format.js';
import { Alert } from '../ui/alert.js';

const h = t.home;
const STALE_AFTER_MS = 2 * 86_400_000;

function DayList({ days }: { days: string[] }) {
  if (days.length === 0) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs underline">{h.showDays}</summary>
      <p className="mt-1 text-xs">{days.map((d) => fmt.date(d)).join(', ')}</p>
    </details>
  );
}

export function StatusBanners({
  lastSyncAt,
  result,
  smoothingRequested,
}: {
  lastSyncAt: string | null;
  result: SimulateResponse | undefined;
  smoothingRequested: boolean;
}) {
  const [now] = useState(() => Date.now());
  const stale = lastSyncAt !== null && now - Date.parse(lastSyncAt) > STALE_AFTER_MS;
  const missing = result?.warnings.find((w) => w.code === 'missing_hours');
  const unknown = result?.warnings.find((w) => w.code === 'unknown_tempo_days');
  const negative = result?.warnings.find((w) => w.code === 'negative_values');
  const showPartial = missing || unknown || negative;

  return (
    <div className="flex flex-col gap-2">
      {lastSyncAt === null && <Alert variant="warning">{h.neverSynced}</Alert>}
      {lastSyncAt !== null && stale && (
        <Alert variant="warning">{h.staleSince(fmt.dateTime(lastSyncAt))}</Alert>
      )}
      {smoothingRequested && result && !result.smoothingApplied && (
        <Alert>{h.smoothingUnavailable}</Alert>
      )}
      {showPartial && (
        <Alert variant="warning">
          <p className="font-medium">{h.warningsTitle}</p>
          <ul className="list-disc pl-4">
            {missing && (
              <li>
                {h.missingHours(result!.hours.missing, result!.missingDays.length)}
                <DayList days={result!.missingDays} />
              </li>
            )}
            {unknown && (
              <li>
                {h.unknownTempoDays(result!.tempo.unknownDays.length)}
                <DayList days={result!.tempo.unknownDays} />
              </li>
            )}
            {negative && <li>{negative.message}</li>}
          </ul>
        </Alert>
      )}
    </div>
  );
}
