import { useEffect } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { isIsoDate } from '@elec-ha/core';
import { TARIFF_OPTIONS } from '@elec-ha/core';
import { errorMessage } from '../api/client.js';
import { useConsumption, useSettings, useSimulate } from '../api/queries.js';
import { ComparisonCards } from '../components/home/ComparisonCards.js';
import { ConsumptionChart } from '../components/home/ConsumptionChart.js';
import { ParamsBar } from '../components/home/ParamsBar.js';
import { StatusBanners } from '../components/home/StatusBanners.js';
import { Alert } from '../components/ui/alert.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Select } from '../components/ui/input.js';
import { t } from '../i18n/fr.js';
import { fmt } from '../lib/format.js';
import { useUiStore, type ColorMode } from '../store/ui.js';

const h = t.home;

export function HomePage() {
  const settings = useSettings();
  const { from, to, smoothing, colorMode, setColorMode, setPeriod } = useUiStore();
  const [params, setParams] = useSearchParams();

  // Période fournie dans l'URL (?from&to) : appliquée puis retirée de l'adresse.
  useEffect(() => {
    const f = params.get('from');
    const tt = params.get('to');
    if (f && tt && isIsoDate(f) && isIsoDate(tt) && f <= tt) {
      setPeriod(f, tt);
      setParams({}, { replace: true });
    }
  }, [params, setParams, setPeriod]);
  const configured = settings.data?.configured ?? false;
  const simulation = useSimulate({ from, to, smoothing: { enabled: smoothing } }, configured);
  const consumption = useConsumption(from, to, configured);

  if (settings.isPending) return <p className="text-slate-500">{t.app.loading}</p>;
  if (settings.isError) return <Alert variant="error">{errorMessage(settings.error)}</Alert>;
  if (!settings.data.configured) return <Navigate to="/settings?welcome=1" replace />;

  const result = simulation.data;
  const points = consumption.data?.points ?? [];
  const missingHours = points.reduce((a, p) => a + p.missingHours, 0);
  const missingDays = new Set(
    points.filter((p) => p.missingHours > 0).map((p) => p.key.slice(0, 10)),
  ).size;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-2xl font-semibold">{h.title}</h2>
      <ParamsBar settings={settings.data} />
      <StatusBanners
        lastSyncAt={settings.data.lastSyncAt}
        result={result}
        smoothingRequested={smoothing}
      />
      {simulation.isError && <Alert variant="error">{errorMessage(simulation.error)}</Alert>}

      <section aria-label={h.cards.title} className="flex flex-col gap-2">
        {simulation.isPending && !result && <p className="text-slate-500">{t.app.loading}</p>}
        {result && (
          <>
            <p className="text-sm text-slate-600">
              {fmt.date(result.period.from)} → {fmt.date(result.period.to)} · {result.period.days}{' '}
              jours · {fmt.kwh(result.kwhTotal)}
            </p>
            <ComparisonCards result={result} />
          </>
        )}
      </section>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle>{h.chart.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-slate-500">
              {missingHours > 0 ? h.missingHours(missingHours, missingDays) : h.noMissing}
            </span>
            <label className="flex items-center gap-2 text-sm">
              <span className="text-slate-600">{h.chart.colorBy}</span>
              <Select
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value as ColorMode)}
                className="w-28"
              >
                {TARIFF_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {t.options[o]}
                  </option>
                ))}
              </Select>
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {consumption.isError && <Alert variant="error">{errorMessage(consumption.error)}</Alert>}
          {consumption.isPending && <p className="text-slate-500">{t.app.loading}</p>}
          {consumption.data && (
            <ConsumptionChart
              key={`${from}_${to}`}
              points={points}
              grid={settings.data.grid}
              colorMode={colorMode}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
