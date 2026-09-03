import { useState, type FormEvent } from 'react';
import type { HaEntitiesResponse, SettingsDto } from '@elec-ha/core';
import { api, errorMessage } from '../../api/client.js';
import { useHaEntities } from '../../api/queries.js';
import { t } from '../../i18n/fr.js';
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
import { Input } from '../ui/input.js';
import { SaveBar } from './SaveBar.js';
import { useSave } from './useSave.js';

const s = t.settings.ha;

export function HaConnectionSection({ settings }: { settings: SettingsDto }) {
  const [url, setUrl] = useState(settings.ha.url ?? '');
  const [token, setToken] = useState('');
  const [entityIds, setEntityIds] = useState<string[]>(settings.ha.entityIds);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [tested, setTested] = useState<HaEntitiesResponse | null>(null);
  const { save, saving, saved, error } = useSave();

  const stored = useHaEntities(settings.ha.tokenSet && settings.ha.url !== null && tested === null);
  const lists: HaEntitiesResponse | undefined = tested ?? stored.data;

  async function test() {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const r = await api.testHa({ url, ...(token ? { token } : {}) });
      setTested({ entities: r.entities, totalStatistics: r.totalStatistics });
      setTestResult(s.testOk(r.version, r.eligibleEntities, r.totalStatistics));
    } catch (err) {
      setTestError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await save({ ha: { url, ...(token ? { token } : {}), entityIds } });
    if (ok) setToken('');
  }

  const toggle = (id: string, checked: boolean) =>
    setEntityIds((ids) => (checked ? [...new Set([...ids, id])] : ids.filter((x) => x !== id)));

  // Entités déjà sélectionnées mais absentes de la liste (liste non chargée ou entité disparue).
  const listed = new Set((lists?.entities ?? []).map((e) => e.statisticId));
  const orphans = entityIds.filter((id) => !listed.has(id));

  return (
    <Card>
      <form onSubmit={(e) => void onSubmit(e)}>
        <CardHeader>
          <CardTitle>{s.title}</CardTitle>
          <CardDescription>{s.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="ha-url" label={s.url}>
              <Input
                id="ha-url"
                type="url"
                required
                placeholder={s.urlPlaceholder}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
            <Field
              id="ha-token"
              label={s.token}
              help={settings.ha.tokenSet ? s.tokenSet : undefined}
            >
              <div className="flex items-center gap-2">
                <Input
                  id="ha-token"
                  type="password"
                  autoComplete="off"
                  placeholder={s.tokenPlaceholder}
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                {settings.ha.tokenSet && <Badge>OK</Badge>}
              </div>
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => void test()}
              disabled={testing || !url}
            >
              {testing ? s.testing : s.testButton}
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
            {stored.isError && !tested && (
              <Alert variant="warning" className="py-1">
                {errorMessage(stored.error)}
              </Alert>
            )}
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium text-slate-700">{s.entities}</legend>
            <p className="text-xs text-slate-500">{lists ? s.entitiesHelp : s.entitiesEmpty}</p>
            {orphans.map((id) => (
              <label key={id} className="inline-flex items-center gap-2 text-sm">
                <input type="checkbox" checked onChange={(e) => toggle(id, e.target.checked)} />
                <code className="text-xs">{id}</code>
              </label>
            ))}
            <div className="grid gap-1 md:grid-cols-2">
              {(lists?.entities ?? []).map((e) => (
                <label key={e.statisticId} className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={entityIds.includes(e.statisticId)}
                    onChange={(ev) => toggle(e.statisticId, ev.target.checked)}
                  />
                  <span>
                    {e.name ?? e.statisticId}{' '}
                    <span className="text-xs text-slate-500">
                      ({e.statisticId}, {e.unit})
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {entityIds.length > 0 ? s.entitiesSelected(entityIds.length) : s.entitiesNone}
            </p>
          </fieldset>
        </CardContent>
        <CardFooter>
          <SaveBar saving={saving} saved={saved} error={error} />
        </CardFooter>
      </form>
    </Card>
  );
}
