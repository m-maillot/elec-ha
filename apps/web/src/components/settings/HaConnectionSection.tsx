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
import { Input, Select } from '../ui/input.js';
import { SaveBar } from './SaveBar.js';
import { useSave } from './useSave.js';

const s = t.settings.ha;

export function HaConnectionSection({ settings }: { settings: SettingsDto }) {
  const [url, setUrl] = useState(settings.ha.url ?? '');
  const [token, setToken] = useState('');
  const [entityId, setEntityId] = useState(settings.ha.entityId ?? '');
  const [tempoEntityId, setTempoEntityId] = useState(settings.ha.tempoEntityId ?? '');
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
      setTested({ entities: r.entities, tempoEntities: r.tempoEntities });
      setTestResult(s.testOk(r.version, r.eligibleEntities));
    } catch (err) {
      setTestError(errorMessage(err));
    } finally {
      setTesting(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const ok = await save({
      ha: {
        url,
        ...(token ? { token } : {}),
        entityId: entityId || null,
        tempoEntityId: tempoEntityId || null,
      },
    });
    if (ok) setToken('');
  }

  const entityOptions = lists?.entities ?? [];
  const tempoOptions = lists?.tempoEntities ?? [];
  // Conserve l'entité déjà choisie même si la liste n'est pas (encore) chargée.
  const knownEntity = entityId && !entityOptions.some((e) => e.statisticId === entityId);
  const knownTempo = tempoEntityId && !tempoOptions.some((e) => e.entityId === tempoEntityId);

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
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="ha-entity" label={s.entity} help={lists ? s.entityHelp : s.entitiesEmpty}>
              <Select id="ha-entity" value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                <option value="">{s.entityNone}</option>
                {knownEntity && <option value={entityId}>{entityId}</option>}
                {entityOptions.map((e) => (
                  <option key={e.statisticId} value={e.statisticId}>
                    {e.name
                      ? `${e.name} (${e.statisticId}, ${e.unit})`
                      : `${e.statisticId} (${e.unit})`}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="ha-tempo-entity" label={s.tempoEntity}>
              <Select
                id="ha-tempo-entity"
                value={tempoEntityId}
                onChange={(e) => setTempoEntityId(e.target.value)}
              >
                <option value="">{s.tempoEntityNone}</option>
                {knownTempo && <option value={tempoEntityId}>{tempoEntityId}</option>}
                {tempoOptions.map((e) => (
                  <option key={e.entityId} value={e.entityId}>
                    {e.name
                      ? `${e.name} (${e.entityId}) – ${e.state}`
                      : `${e.entityId} – ${e.state}`}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </CardContent>
        <CardFooter>
          <SaveBar saving={saving} saved={saved} error={error} />
        </CardFooter>
      </form>
    </Card>
  );
}
