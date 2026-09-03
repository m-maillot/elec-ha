import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import frLocale from 'echarts/i18n/langFR-obj.js';
import type { ConsumptionPoint, Granularity, TariffGrid } from '@elec-ha/core';
import { t } from '../../i18n/fr.js';
import { fmt } from '../../lib/format.js';
import type { ColorMode } from '../../store/ui.js';
import {
  aggregate,
  bucketKey,
  chooseGranularity,
  formatBucketLabel,
  type ChartBucket,
  type ColorKey,
} from './chart-data.js';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  LegendComponent,
  CanvasRenderer,
]);
echarts.registerLocale('FR', frLocale);

/** Couleurs des séries : HC en teinte plus claire (doublé d'un libellé dans la légende et l'infobulle). */
const PALETTE = {
  base: '#334155',
  hp: '#1d4ed8',
  hc: '#93c5fd',
  tempo: {
    blue: { hp: '#2563eb', hc: '#93c5fd' },
    white: { hp: '#6b7280', hc: '#d1d5db' },
    red: { hp: '#dc2626', hc: '#fca5a5' },
    unknown: { hp: '#a3a3a3', hc: '#e5e5e5' },
  },
} as const;

interface ConsumptionChartProps {
  points: ConsumptionPoint[];
  grid: TariffGrid | null;
  colorMode: ColorMode;
  /** Heures substituées par le lissage (début UTC → kWh lissés), superposées en pointillés. */
  smoothed?: ReadonlyMap<number, number>;
}

type Series = Record<string, unknown>;

function seriesFor(buckets: ChartBucket[], colorMode: ColorMode): Series[] {
  const x = (b: ChartBucket) => b.start + (b.end - b.start) / 2;
  const bar = (name: string, color: string, value: (b: ChartBucket) => number | null): Series => ({
    name,
    type: 'bar',
    stack: 'kwh',
    itemStyle: { color },
    barMaxWidth: 40,
    emphasis: { focus: 'none' },
    data: buckets.map((b) => [x(b), value(b)]),
  });
  const s = t.home.chart.series;
  if (colorMode === 'base') return [bar(s.base, PALETTE.base, (b) => b.kwh)];
  if (colorMode === 'hphc') {
    return [
      bar(s.hp, PALETTE.hp, (b) => (b.kwh === null ? null : b.hp)),
      bar(s.hc, PALETTE.hc, (b) => (b.kwh === null ? null : b.hc)),
    ];
  }
  const out: Series[] = [];
  for (const c of ['blue', 'white', 'red', 'unknown'] as ColorKey[]) {
    // Les couleurs absentes de la période ne sont pas listées dans la légende.
    if (!buckets.some((b) => b.tempo[c].hp > 0 || b.tempo[c].hc > 0)) continue;
    const label = c === 'unknown' ? s.unknown : t.colors[c];
    out.push(
      bar(`${label} ${s.hp}`, PALETTE.tempo[c].hp, (b) => (b.kwh === null ? null : b.tempo[c].hp)),
    );
    out.push(
      bar(`${label} ${s.hc}`, PALETTE.tempo[c].hc, (b) => (b.kwh === null ? null : b.tempo[c].hc)),
    );
  }
  return out;
}

function tooltipHtml(b: ChartBucket, granularity: Granularity): string {
  const tt = t.home.chart.tooltip;
  const rows: string[] = [`<strong>${formatBucketLabel(b.key, granularity)}</strong>`];
  if (b.kwh === null) {
    rows.push(tt.missing(b.missingHours));
    return rows.join('<br/>');
  }
  rows.push(
    `${fmt.kwh3(b.kwh)} (${t.home.chart.series.hp} ${fmt.kwh(b.hp)} · ${t.home.chart.series.hc} ${fmt.kwh(b.hc)})`,
  );
  const color = b.tempoColor ? t.colors[b.tempoColor] : tt.mixed;
  rows.push(`${tt.tempoColor} : ${color}`);
  if (b.missingHours > 0) rows.push(tt.missing(b.missingHours));
  if (b.cost) {
    rows.push(
      `${tt.costs} : ${t.options.base} ${fmt.eur(b.cost.base)} · ${t.options.hphc} ${fmt.eur(b.cost.hphc)} · ${t.options.tempo} ${
        b.cost.tempo === null ? '—' : fmt.eur(b.cost.tempo)
      }`,
    );
  }
  return rows.join('<br/>');
}

export function ConsumptionChart({ points, grid, colorMode, smoothed }: ConsumptionChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const zoomRef = useRef<{ startValue?: number; endValue?: number }>({});
  const span =
    points.length > 0 ? points[points.length - 1]!.start + 3_600_000 - points[0]!.start : 0;
  const [granularity, setGranularity] = useState<Granularity>(() => chooseGranularity(span));

  const buckets = useMemo(() => aggregate(points, granularity, grid), [points, granularity, grid]);
  // Série lissée : points d'origine avec les heures substituées ; à la maille heure/jour,
  // seuls les points contenant une substitution sont tracés (nulls ailleurs → ligne interrompue).
  const smoothedBuckets = useMemo(() => {
    if (!smoothed || smoothed.size === 0) return null;
    const substitutedPoints = points.map((p) => {
      const v = smoothed.get(p.start);
      return v === undefined ? p : { ...p, kwh: v };
    });
    const flagged = new Set(
      points.filter((p) => smoothed.has(p.start)).map((p) => bucketKey(p, granularity)),
    );
    return aggregate(substitutedPoints, granularity, null).map((b) =>
      granularity === 'month' || flagged.has(b.key) ? b : { ...b, kwh: null },
    );
  }, [smoothed, points, granularity]);

  // Initialisation et redimensionnement
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas', locale: 'FR' });
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    chart.on('datazoom', () => {
      const opt = chart.getOption() as {
        dataZoom?: Array<{ startValue?: number; endValue?: number }>;
      };
      const dz = opt.dataZoom?.[0];
      if (!dz || dz.startValue === undefined || dz.endValue === undefined) return;
      zoomRef.current = { startValue: dz.startValue, endValue: dz.endValue };
      setGranularity(chooseGranularity(dz.endValue - dz.startValue));
    });
    chart.getZr().on('dblclick', () => {
      zoomRef.current = {};
      chart.dispatchAction({ type: 'dataZoom', start: 0, end: 100 });
    });
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Mise à jour des séries
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const series = seriesFor(buckets, colorMode);
    if (smoothedBuckets) {
      series.push({
        name: t.home.chart.smoothedSeries,
        type: 'line',
        showSymbol: false,
        lineStyle: { type: 'dashed', width: 2, color: '#b91c1c' },
        itemStyle: { color: '#b91c1c' },
        data: smoothedBuckets.map((b) => [b.start + (b.end - b.start) / 2, b.kwh]),
      });
    }
    const zoom = zoomRef.current;
    chart.setOption(
      {
        animation: false,
        grid: { left: 56, right: 16, top: 36, bottom: 64 },
        legend: { top: 0, type: 'scroll' },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params: unknown) => {
            const list = params as Array<{ dataIndex: number }>;
            const b = buckets[list[0]?.dataIndex ?? -1];
            return b ? tooltipHtml(b, granularity) : '';
          },
        },
        xAxis: { type: 'time' },
        yAxis: { type: 'value', name: 'kWh', axisLabel: { formatter: '{value}' } },
        dataZoom: [
          { type: 'inside', filterMode: 'none', ...zoom },
          { type: 'slider', filterMode: 'none', height: 24, bottom: 8, ...zoom },
        ],
        series,
      },
      { replaceMerge: ['series'] },
    );
  }, [buckets, smoothedBuckets, colorMode, granularity]);

  return (
    <div className="flex flex-col gap-1">
      <div ref={containerRef} className="h-96 w-full" role="img" aria-label={t.home.chart.title} />
      <p className="text-xs text-slate-500">
        {t.home.chart.hint} · {t.home.chart.granularity[granularity]}
      </p>
    </div>
  );
}
