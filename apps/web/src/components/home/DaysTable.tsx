import type { DayRow } from '@elec-ha/core';
import { t } from '../../i18n/fr.js';
import { fmt } from '../../lib/format.js';
import { cn } from '../../lib/utils.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.js';
import { TempoColorLabel } from './ComparisonCards.js';

const d = t.home.days;

interface DaysTableProps {
  days: DayRow[];
  /** Colonne « kWh ajoutés » affichée uniquement quand le lissage est actif. */
  smoothing: boolean;
}

const th = 'sticky top-0 bg-white px-3 py-2 text-xs font-medium text-slate-500 whitespace-nowrap';
const td = 'px-3 py-1.5 tabular-nums whitespace-nowrap';

/** Tableau récapitulatif par jour Tempo : couleur, total, HP, HC, kWh ajoutés par le lissage. */
export function DaysTable({ days, smoothing }: DaysTableProps) {
  const kwh = (v: number) => fmt.kwh(v).replace(/\s?kWh$/, '');
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-baseline justify-between gap-2">
        <div>
          <CardTitle>{d.title}</CardTitle>
          <CardDescription>{d.description}</CardDescription>
        </div>
        <span className="text-xs text-slate-500">{d.count(days.length)}</span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left">
                <th scope="col" className={th}>
                  {d.date}
                </th>
                <th scope="col" className={th}>
                  {d.color}
                </th>
                <th scope="col" className={cn(th, 'text-right')}>
                  {d.total} (kWh)
                </th>
                <th scope="col" className={cn(th, 'text-right')}>
                  {d.hp} (kWh)
                </th>
                <th scope="col" className={cn(th, 'text-right')}>
                  {d.hc} (kWh)
                </th>
                {smoothing && (
                  <>
                    <th scope="col" className={cn(th, 'text-right')}>
                      {d.added}
                    </th>
                    <th scope="col" className={cn(th, 'text-right')}>
                      {d.smoothedHp} (kWh)
                    </th>
                    <th scope="col" className={cn(th, 'text-right')}>
                      {d.smoothedHc} (kWh)
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {days.map((row) => {
                const missing = 24 - row.presentHours;
                return (
                  <tr key={row.date} className="border-t border-slate-100 hover:bg-slate-50">
                    <th scope="row" className={cn(td, 'text-left font-normal')}>
                      {fmt.date(row.date)}
                      {row.kwh !== null && missing > 0 && (
                        <span className="ml-2 text-xs text-amber-700">{d.missing(missing)}</span>
                      )}
                    </th>
                    <td className={td}>
                      {row.color ? (
                        <TempoColorLabel color={row.color} />
                      ) : (
                        <span className="text-slate-400">{d.unknownColor}</span>
                      )}
                    </td>
                    <td className={cn(td, 'text-right font-medium')}>
                      {row.kwh === null ? <span className="text-slate-400">—</span> : kwh(row.kwh)}
                    </td>
                    <td className={cn(td, 'text-right')}>
                      {row.kwh === null ? '' : kwh(row.hpKwh)}
                    </td>
                    <td className={cn(td, 'text-right')}>
                      {row.kwh === null ? '' : kwh(row.hcKwh)}
                    </td>
                    {smoothing && (
                      <>
                        <td
                          className={cn(
                            td,
                            'text-right',
                            (row.addedKwh ?? 0) > 0 && 'text-red-700',
                          )}
                        >
                          {row.addedKwh ? fmt.signedKwh(row.addedKwh).replace(/\s?kWh$/, '') : ''}
                        </td>
                        <td
                          className={cn(td, 'text-right', (row.addedKwh ?? 0) > 0 && 'font-medium')}
                        >
                          {row.kwh === null ? '' : kwh(row.smoothedHpKwh ?? row.hpKwh)}
                        </td>
                        <td
                          className={cn(td, 'text-right', (row.addedKwh ?? 0) > 0 && 'font-medium')}
                        >
                          {row.kwh === null ? '' : kwh(row.smoothedHcKwh ?? row.hcKwh)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
