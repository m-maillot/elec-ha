import { useState, type FormEvent } from 'react';
import { Download, Plus, Trash2 } from 'lucide-react';
import type { DeviceDto, SettingsDto } from '@elec-ha/core';
import { api, errorMessage } from '../../api/client.js';
import { useHaEntities } from '../../api/queries.js';
import { t } from '../../i18n/fr.js';
import { Alert } from '../ui/alert.js';
import { Button } from '../ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card.js';
import { Input, Select } from '../ui/input.js';
import { SaveBar } from './SaveBar.js';
import { useSave } from './useSave.js';

const s = t.settings.devices;

/** Appareils individuels dont on détaille la consommation et le coût (comme le tableau Énergie de HA). */
export function DevicesSection({ settings }: { settings: SettingsDto }) {
  const [devices, setDevices] = useState<DeviceDto[]>(settings.devices);
  const [importing, setImporting] = useState(false);
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [toAdd, setToAdd] = useState('');
  const { save, saving, saved, error } = useSave();
  const connected = settings.ha.tokenSet && settings.ha.url !== null;
  const entities = useHaEntities(connected);

  const known = new Set(devices.map((d) => d.statisticId));
  const candidates = (entities.data?.entities ?? []).filter((e) => !known.has(e.statisticId));

  async function importFromHa() {
    setImporting(true);
    setImportInfo(null);
    setImportError(null);
    try {
      const res = await api.getEnergyDevices();
      const fresh = res.devices.filter((d) => !known.has(d.statisticId));
      setDevices((list) => [...list, ...fresh]);
      setImportInfo(s.imported(fresh.length, res.devices.length));
    } catch (err) {
      setImportError(errorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  function add() {
    const entity = candidates.find((e) => e.statisticId === toAdd);
    if (!entity) return;
    setDevices((list) => [
      ...list,
      { statisticId: entity.statisticId, name: entity.name ?? entity.statisticId },
    ]);
    setToAdd('');
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save({ devices });
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>{s.title}</CardTitle>
          <CardDescription>{s.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void importFromHa()}
              disabled={importing || !connected}
            >
              <Download className="h-4 w-4" aria-hidden />
              {importing ? t.app.loading : s.importButton}
            </Button>
            {importInfo && (
              <Alert variant="success" className="py-1">
                {importInfo}
              </Alert>
            )}
            {importError && (
              <Alert variant="error" className="py-1">
                {importError}
              </Alert>
            )}
          </div>

          {devices.length === 0 ? (
            <p className="text-sm text-slate-500">{s.empty}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {devices.map((d, i) => (
                <li key={d.statisticId} className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={s.nameOf(d.statisticId)}
                    className="w-56"
                    value={d.name}
                    onChange={(e) =>
                      setDevices((list) =>
                        list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)),
                      )
                    }
                  />
                  <code className="min-w-0 flex-1 truncate text-xs text-slate-500">
                    {d.statisticId}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={s.remove(d.name || d.statisticId)}
                    onClick={() => setDevices((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Select
              aria-label={s.addLabel}
              className="w-full md:w-96"
              value={toAdd}
              onChange={(e) => setToAdd(e.target.value)}
              disabled={candidates.length === 0}
            >
              <option value="">{s.addPlaceholder}</option>
              {candidates.map((e) => (
                <option key={e.statisticId} value={e.statisticId}>
                  {e.name ? `${e.name} (${e.statisticId})` : e.statisticId}
                </option>
              ))}
            </Select>
            <Button type="button" variant="outline" size="sm" onClick={add} disabled={!toAdd}>
              <Plus className="h-4 w-4" aria-hidden /> {t.app.add}
            </Button>
          </div>
          <p className="text-xs text-slate-500">{s.syncHint}</p>
        </CardContent>
        <CardFooter>
          <SaveBar saving={saving} saved={saved} error={error} />
        </CardFooter>
      </form>
    </Card>
  );
}
