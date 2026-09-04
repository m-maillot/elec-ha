import type { SimulateResponse, TariffOption, TempoColor } from '@elec-ha/core';
import { TEMPO_COLORS } from '@elec-ha/core';
import { Award } from 'lucide-react';
import { t } from '../../i18n/fr.js';
import { fmt } from '../../lib/format.js';
import { cn } from '../../lib/utils.js';
import { Badge } from '../ui/badge.js';

const c = t.home.cards;

const COLOR_DOT: Record<TempoColor, string> = {
  blue: 'bg-tempo-blue',
  white: 'bg-tempo-white',
  red: 'bg-tempo-red',
};

/** Pastille de couleur Tempo toujours accompagnée de son libellé (accessibilité). */
export function TempoColorLabel({ color }: { color: TempoColor }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('inline-block h-2.5 w-2.5 rounded-full', COLOR_DOT[color])} aria-hidden />
      {t.colors[color]}
    </span>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-2 text-sm',
        strong && 'text-base font-semibold',
      )}
    >
      <span className="text-slate-600">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function Delta({ delta }: { delta: { amount: number; percent: number } }) {
  const cls =
    delta.amount > 0 ? 'text-red-700' : delta.amount < 0 ? 'text-green-700' : 'text-slate-600';
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-slate-600">{c.delta}</span>
      <span className={cn('tabular-nums font-medium', cls)}>
        {fmt.signedEur(delta.amount)} ({fmt.pct(delta.percent / 100)})
      </span>
    </div>
  );
}

interface CardProps {
  option: TariffOption;
  result: SimulateResponse;
}

function OptionCard({ option, result }: CardProps) {
  const r = result[option];
  const isBest = result.best === option;
  const isCurrent = r.deltaVsCurrent === null;
  const partial = option === 'tempo' && result.tempo.partial;

  return (
    <section
      aria-label={t.options[option]}
      className={cn(
        'flex flex-col gap-3 rounded-lg border bg-white p-5 shadow-sm',
        isBest ? 'border-green-500 ring-2 ring-green-200' : 'border-slate-200',
      )}
    >
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{t.options[option]}</h3>
        {isCurrent && <Badge>{c.current}</Badge>}
        {isBest && (
          <Badge className="bg-green-100 text-green-800">
            <Award className="mr-1 h-3 w-3" aria-hidden /> {c.best}
          </Badge>
        )}
        {partial && <Badge className="bg-amber-100 text-amber-800">{c.partial}</Badge>}
      </header>
      <div className="flex flex-col gap-1">
        <Row label={c.total} value={fmt.eur(r.total)} strong />
        <Row label={c.consumption} value={fmt.eur(r.consumption)} />
        <Row label={c.subscription} value={fmt.eur(r.subscription)} />
        {r.deltaVsCurrent && <Delta delta={r.deltaVsCurrent} />}
        <Row label={c.kwh} value={fmt.kwh(r.kwh)} />
        <Row label={c.averagePrice} value={`${fmt.eur4(r.averagePrice)}/kWh`} />
        {partial && (
          <p className="text-xs text-amber-700">{c.excluded(fmt.kwh(result.tempo.excludedKwh))}</p>
        )}
        {option === 'tempo' && result.smoothing && (
          <div className="mt-1 rounded-md bg-slate-50 px-2 py-1.5">
            <Row
              label={c.costWithoutSmoothing}
              value={fmt.eur(result.smoothing.costWithoutSmoothing)}
            />
            <Row label={c.redistributed} value={fmt.signedKwh(result.smoothing.redistributedKwh)} />
          </div>
        )}
      </div>
      {option === 'hphc' && <HpHcDetail result={result} />}
      {option === 'tempo' && <TempoDetail result={result} />}
    </section>
  );
}

function HpHcDetail({ result }: { result: SimulateResponse }) {
  const rows = [
    { label: c.hp, d: result.hphc.hp },
    { label: c.hc, d: result.hphc.hc },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-slate-500">
          <th scope="col" className="py-1 font-medium" />
          <th scope="col" className="py-1 text-right font-medium">
            kWh
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            %
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            €
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} className="border-t border-slate-100">
            <th scope="row" className="py-1 text-left font-normal">
              {row.label}
            </th>
            <td className="py-1 text-right tabular-nums">{fmt.kwh(row.d.kwh)}</td>
            <td className="py-1 text-right tabular-nums">
              {fmt.pct(row.d.share).replace('+', '')}
            </td>
            <td className="py-1 text-right tabular-nums">{fmt.eur(row.d.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Tableau croisé couleur × HP/HC, présenté en deux lignes par couleur pour tenir dans la carte. */
function TempoDetail({ result }: { result: SimulateResponse }) {
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{c.tempoTable}</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">{c.color}</th>
          <th scope="col">{c.days}</th>
          <th scope="col">{c.kwhHp}</th>
          <th scope="col">{c.eurHp}</th>
          <th scope="col">{c.kwhHc}</th>
          <th scope="col">{c.eurHc}</th>
          <th scope="col">{c.eurTotal}</th>
        </tr>
      </thead>
      <tbody>
        {TEMPO_COLORS.map((color) => {
          const d = result.tempo.byColor[color];
          return (
            <tr key={color} className="border-t border-slate-100">
              <td colSpan={7} className="py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-medium">
                    <TempoColorLabel color={color} />
                  </span>
                  <span className="text-xs text-slate-500">
                    {d.days} {c.daysUnit}
                  </span>
                  <span className="ml-auto font-medium tabular-nums">{fmt.eur(d.total)}</span>
                </div>
                <div className="mt-0.5 grid grid-cols-2 gap-2 text-xs text-slate-600 tabular-nums">
                  <span>
                    {c.hpShort} {fmt.kwh(d.hpKwh)} · {fmt.eur(d.hpCost)}
                  </span>
                  <span>
                    {c.hcShort} {fmt.kwh(d.hcKwh)} · {fmt.eur(d.hcCost)}
                  </span>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function ComparisonCards({ result }: { result: SimulateResponse }) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {(['base', 'hphc', 'tempo'] as const).map((o) => (
        <OptionCard key={o} option={o} result={result} />
      ))}
    </div>
  );
}
