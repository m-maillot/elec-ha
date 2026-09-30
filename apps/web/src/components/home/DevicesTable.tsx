import { Link } from 'react-router-dom';
import type { DeviceCostsResponse, SeriesCost, TariffOption } from '@elec-ha/core';
import { TARIFF_OPTIONS } from '@elec-ha/core';
import { t } from '../../i18n/fr.js';
import { fmt } from '../../lib/format.js';
import { cn } from '../../lib/utils.js';
import { Alert } from '../ui/alert.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.js';

const d = t.home.devices;

const th = 'px-3 py-2 text-xs font-medium text-slate-500 whitespace-nowrap';
const td = 'px-3 py-1.5 tabular-nums whitespace-nowrap text-right';
const kwh = (v: number) => fmt.kwh(v).replace(/\s?kWh$/, '');

function Cells({
  row,
  share,
  current,
}: {
  row: SeriesCost;
  share: number | null;
  current: TariffOption;
}) {
  return (
    <>
      <td className={cn(td, 'font-medium')}>{kwh(row.kwh)}</td>
      <td className={td}>{share === null ? '' : fmt.pct(share).replace('+', '')}</td>
      <td className={td}>{kwh(row.hpKwh)}</td>
      <td className={td}>{kwh(row.hcKwh)}</td>
      {TARIFF_OPTIONS.map((o) => (
        <td key={o} className={cn(td, o === current && 'bg-slate-50 font-medium')}>
          {fmt.eur(row.cost[o])}
          {o === 'tempo' && row.tempoExcludedKwh > 0.0005 && (
            <span className="text-amber-700" title={d.tempoPartial(fmt.kwh(row.tempoExcludedKwh))}>
              {' '}
              *
            </span>
          )}
        </td>
      ))}
    </>
  );
}

interface DevicesTableProps {
  costs: DeviceCostsResponse | undefined;
  /** Nombre d'appareils configurés. */
  configured: number;
  currentOption: TariffOption;
  loading?: boolean;
}

/** Consommation et coût de chaque appareil individuel dans les trois options. */
export function DevicesTable({ costs, configured, currentOption, loading }: DevicesTableProps) {
  const partial = costs !== undefined && costs.total.tempoExcludedKwh > 0.0005;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{d.title}</CardTitle>
        <CardDescription>{d.description}</CardDescription>
      </CardHeader>
      <CardContent className={configured === 0 ? undefined : 'p-0'}>
        {configured === 0 && (
          <p className="text-sm text-slate-600">
            {d.none}{' '}
            <Link to="/settings" className="underline">
              {d.configure}
            </Link>
          </p>
        )}
        {configured > 0 && loading && !costs && (
          <p className="p-5 text-slate-500">{t.app.loading}</p>
        )}
        {configured > 0 && costs && (
          <>
            {costs.overcounted && (
              <Alert variant="warning" className="m-3">
                {d.overcounted}
              </Alert>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th scope="col" className={cn(th, 'text-left')}>
                      {d.device}
                    </th>
                    <th scope="col" className={cn(th, 'text-right')}>
                      {d.total}
                    </th>
                    <th scope="col" className={cn(th, 'text-right')}>
                      {d.share}
                    </th>
                    <th scope="col" className={cn(th, 'text-right')}>
                      {d.hp}
                    </th>
                    <th scope="col" className={cn(th, 'text-right')}>
                      {d.hc}
                    </th>
                    {TARIFF_OPTIONS.map((o) => (
                      <th
                        key={o}
                        scope="col"
                        className={cn(
                          th,
                          'text-right',
                          o === currentOption && 'bg-slate-50 text-slate-900',
                        )}
                      >
                        {o === currentOption
                          ? `${d.cost(t.options[o])} (${t.home.cards.current})`
                          : d.cost(t.options[o])}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {costs.devices.map((row) => (
                    <tr
                      key={row.statisticId}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <th
                        scope="row"
                        className="px-3 py-1.5 text-left font-normal whitespace-nowrap"
                      >
                        {row.name}
                        {row.presentHours === 0 ? (
                          <span className="ml-2 text-xs text-amber-700">{d.noData}</span>
                        ) : (
                          row.presentHours < costs.total.presentHours * 0.98 && (
                            <span className="ml-2 text-xs text-amber-700">
                              {d.coverage(
                                fmt
                                  .pct(row.presentHours / costs.total.presentHours)
                                  .replace('+', ''),
                              )}
                            </span>
                          )
                        )}
                      </th>
                      <Cells row={row} share={row.share} current={currentOption} />
                    </tr>
                  ))}
                  {costs.untracked && (
                    <tr className="border-t border-slate-100 text-slate-600">
                      <th
                        scope="row"
                        className="px-3 py-1.5 text-left font-normal whitespace-nowrap italic"
                      >
                        {d.untracked}
                      </th>
                      <Cells
                        row={costs.untracked}
                        share={costs.untracked.share}
                        current={currentOption}
                      />
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 font-semibold">
                    <th scope="row" className="px-3 py-2 text-left whitespace-nowrap">
                      {d.house}
                    </th>
                    <Cells
                      row={costs.total}
                      share={costs.total.kwh > 0 ? 1 : null}
                      current={currentOption}
                    />
                  </tr>
                </tfoot>
              </table>
            </div>
            {partial && <p className="px-5 pb-3 text-xs text-amber-700">* {d.tempoPartialNote}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}
