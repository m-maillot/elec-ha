import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { TARIFF_OPTIONS, type SettingsDto, type SyncEvent, type TariffOption } from '@elec-ha/core';
import { api, errorMessage } from '../../api/client.js';
import { useUpdateSettings } from '../../api/queries.js';
import { t } from '../../i18n/fr.js';
import { presetRange, useUiStore, type PeriodPreset } from '../../store/ui.js';
import { Alert } from '../ui/alert.js';
import { Button } from '../ui/button.js';
import { Input, Select } from '../ui/input.js';
import { Switch } from '../ui/switch.js';
import { cn } from '../../lib/utils.js';

const h = t.home;
const PRESETS: Exclude<PeriodPreset, 'custom'>[] = ['last30', 'last12m', 'tempoSeason', 'lastYear'];

interface SyncState {
  running: boolean;
  step: 'consumption' | 'tempo' | null;
  done: number;
  total: number;
  message: string | null;
  result: string | null;
  error: string | null;
}

const idle: SyncState = {
  running: false,
  step: null,
  done: 0,
  total: 0,
  message: null,
  result: null,
  error: null,
};

export function ParamsBar({ settings }: { settings: SettingsDto }) {
  const { from, to, preset, smoothing, setPeriod, setSmoothing } = useUiStore();
  const update = useUpdateSettings();
  const qc = useQueryClient();
  const [sync, setSync] = useState<SyncState>(idle);

  async function refresh() {
    setSync({ ...idle, running: true });
    try {
      let summary: string | null = null;
      let tempoError: string | null = null;
      await api.sync(from, to, (e: SyncEvent) => {
        if (e.type === 'progress') {
          setSync((s) => ({
            ...s,
            step: e.step,
            done: e.done,
            total: e.total,
            message: e.message,
          }));
        } else if (e.type === 'done') {
          summary = h.syncDone(e.consumption.hoursStored, e.tempo.fetched);
          tempoError = e.tempo.error ?? null;
        }
      });
      setSync({
        ...idle,
        result: summary,
        error: tempoError ? h.syncTempoError(tempoError) : null,
      });
    } catch (err) {
      setSync({ ...idle, error: errorMessage(err) });
    } finally {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['consumption'] }),
        qc.invalidateQueries({ queryKey: ['simulate'] }),
        qc.invalidateQueries({ queryKey: ['settings'] }),
      ]);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{h.period.from}</span>
          <Input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setPeriod(e.target.value, to)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{h.period.to}</span>
          <Input
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && setPeriod(from, e.target.value)}
          />
        </label>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Présélections">
          {PRESETS.map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={preset === p ? 'default' : 'outline'}
              onClick={() => {
                const r = presetRange(p);
                setPeriod(r.from, r.to, p);
              }}
            >
              {h.presets[p]}
            </Button>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-slate-600">{h.currentOption}</span>
          <Select
            value={settings.currentOption}
            onChange={(e) => update.mutate({ currentOption: e.target.value as TariffOption })}
            className="w-32"
          >
            {TARIFF_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {t.options[o]}
              </option>
            ))}
          </Select>
        </label>
        <Switch
          id="smoothing"
          checked={smoothing}
          onCheckedChange={setSmoothing}
          label={h.smoothing}
          className="pb-2"
        />
        <Button
          type="button"
          onClick={() => void refresh()}
          disabled={sync.running}
          className="ml-auto"
        >
          <RefreshCw className={cn('h-4 w-4', sync.running && 'animate-spin')} aria-hidden />
          {sync.running ? h.refreshing : h.refresh}
        </Button>
      </div>
      {sync.running && (
        <div className="flex flex-col gap-1" aria-live="polite">
          <progress
            className="w-full"
            value={sync.total > 0 ? sync.done : undefined}
            max={sync.total || undefined}
          />
          <p className="text-xs text-slate-500">
            {sync.step ? `${h.syncStep[sync.step]} – ` : ''}
            {sync.message ?? h.refreshing}
          </p>
        </div>
      )}
      {sync.result && <Alert variant="success">{sync.result}</Alert>}
      {sync.error && <Alert variant={sync.result ? 'warning' : 'error'}>{sync.error}</Alert>}
    </div>
  );
}
