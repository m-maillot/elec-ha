import { useState, type FormEvent } from 'react';
import {
  TEMPO_SOURCES,
  type SettingsDto,
  type TempoCsvImportResult,
  type TempoSource,
} from '@elec-ha/core';
import { api, errorMessage } from '../../api/client.js';
import { t } from '../../i18n/fr.js';
import { fmt } from '../../lib/format.js';
import { Alert } from '../ui/alert.js';
import { Badge } from '../ui/badge.js';
import { Button } from '../ui/button.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card.js';
import { Field } from '../ui/field.js';
import { Input, Textarea } from '../ui/input.js';
import { SaveBar } from './SaveBar.js';
import { useSave } from './useSave.js';

const s = t.settings.tempo;

export function TempoSourceSection({ settings }: { settings: SettingsDto }) {
  const [source, setSource] = useState<TempoSource>(settings.tempo.source);
  const [clientId, setClientId] = useState(settings.tempo.rteClientId ?? '');
  const [clientSecret, setClientSecret] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const { save, saving, saved, error } = useSave();

  const [csv, setCsv] = useState('');
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<TempoCsvImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function testRte() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const r = await api.testRte({ clientId, ...(clientSecret ? { clientSecret } : {}) });
      setTestResult(s.testRteOk(fmt.date(r.date), r.color ? t.colors[r.color] : null));
    } catch (err) {
      setTestError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  async function importCsv() {
    setImporting(true);
    setImportResult(null);
    setImportError(null);
    try {
      setImportResult(await api.importTempoCsv(csv, overwrite));
    } catch (err) {
      setImportError(errorMessage(err));
    } finally {
      setImporting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await save({
      tempo: {
        source,
        rteClientId: clientId || null,
        ...(clientSecret ? { rteClientSecret: clientSecret } : {}),
      },
    });
    if (ok) setClientSecret('');
  }

  return (
    <Card>
      <form onSubmit={(e) => void onSubmit(e)}>
        <CardHeader>
          <CardTitle>{s.title}</CardTitle>
          <CardDescription>{s.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">{s.source}</legend>
            {TEMPO_SOURCES.map((src) => (
              <label key={src} className="inline-flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="tempo-source"
                  value={src}
                  checked={source === src}
                  onChange={() => setSource(src)}
                />
                {s.sources[src]}
              </label>
            ))}
          </fieldset>

          {source === 'rte' && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field id="rte-client-id" label={s.clientId}>
                <Input
                  id="rte-client-id"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field
                id="rte-client-secret"
                label={s.clientSecret}
                help={settings.tempo.rteSecretSet ? s.secretSet : undefined}
              >
                <div className="flex items-center gap-2">
                  <Input
                    id="rte-client-secret"
                    type="password"
                    autoComplete="off"
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                  />
                  {settings.tempo.rteSecretSet && <Badge>OK</Badge>}
                </div>
              </Field>
              <div className="flex flex-wrap items-center gap-3 md:col-span-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void testRte()}
                  disabled={testing || !clientId}
                >
                  {testing ? t.app.loading : s.testRte}
                </Button>
                {testResult && (
                  <Alert variant="success" className="py-1">
                    {testResult}
                  </Alert>
                )}
                {testError && (
                  <Alert variant="error" className="py-1">
                    {testError}
                  </Alert>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 rounded-md border border-slate-200 p-4">
            <h3 className="text-sm font-semibold">{s.csv.title}</h3>
            <p className="text-xs text-slate-500">{s.csv.help}</p>
            <Textarea
              id="tempo-csv"
              aria-label={s.csv.title}
              placeholder={s.csv.placeholder}
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={overwrite}
                  onChange={(e) => setOverwrite(e.target.checked)}
                />
                {s.csv.overwrite}
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void importCsv()}
                disabled={importing || !csv.trim()}
              >
                {importing ? t.app.loading : s.csv.import}
              </Button>
            </div>
            {importResult && (
              <Alert variant={importResult.errors.length ? 'warning' : 'success'}>
                {s.csv.result(importResult.imported, importResult.skipped)}
                {importResult.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {importResult.errors.slice(0, 10).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </Alert>
            )}
            {importError && <Alert variant="error">{importError}</Alert>}
          </div>
        </CardContent>
        <CardFooter>
          <SaveBar saving={saving} saved={saved} error={error} />
        </CardFooter>
      </form>
    </Card>
  );
}
