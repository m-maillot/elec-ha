import { useState, type FormEvent } from 'react';
import {
  SUBSCRIBED_POWERS,
  defaultGridFor,
  TARIF_BLEU_VALID_FROM,
  type SettingsDto,
  type SubscribedPower,
  type TariffGrid,
} from '@elec-ha/core';
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
import { Field } from '../ui/field.js';
import { Input, Select } from '../ui/input.js';
import { SaveBar } from './SaveBar.js';
import { useSave } from './useSave.js';

const s = t.settings.tariff;

/** Grille sous forme de chaînes (saisie), clés plates. */
type GridForm = Record<GridKey, string>;
type GridKey =
  | 'baseSub'
  | 'baseKwh'
  | 'hphcSub'
  | 'hp'
  | 'hc'
  | 'tempoSub'
  | 'blueHp'
  | 'blueHc'
  | 'whiteHp'
  | 'whiteHc'
  | 'redHp'
  | 'redHc';

const EMPTY: GridForm = {
  baseSub: '',
  baseKwh: '',
  hphcSub: '',
  hp: '',
  hc: '',
  tempoSub: '',
  blueHp: '',
  blueHc: '',
  whiteHp: '',
  whiteHc: '',
  redHp: '',
  redHc: '',
};

const money = (v: number, digits: number) => v.toFixed(digits);

export function gridToForm(g: TariffGrid | null): GridForm {
  if (!g) return EMPTY;
  return {
    baseSub: money(g.base.subscriptionYearly, 2),
    baseKwh: money(g.base.prices.kwh, 4),
    hphcSub: money(g.hphc.subscriptionYearly, 2),
    hp: money(g.hphc.prices.hp, 4),
    hc: money(g.hphc.prices.hc, 4),
    tempoSub: money(g.tempo.subscriptionYearly, 2),
    blueHp: money(g.tempo.prices.blueHp, 4),
    blueHc: money(g.tempo.prices.blueHc, 4),
    whiteHp: money(g.tempo.prices.whiteHp, 4),
    whiteHc: money(g.tempo.prices.whiteHc, 4),
    redHp: money(g.tempo.prices.redHp, 4),
    redHc: money(g.tempo.prices.redHc, 4),
  };
}

export function formToGrid(f: GridForm, validFrom: string): TariffGrid | null {
  const n = (v: string) => {
    const x = Number(v.replace(',', '.'));
    return v.trim() !== '' && Number.isFinite(x) && x >= 0 ? x : NaN;
  };
  const values = Object.fromEntries(
    (Object.keys(f) as GridKey[]).map((k) => [k, n(f[k])]),
  ) as Record<GridKey, number>;
  if (Object.values(values).some((v) => Number.isNaN(v))) return null;
  return {
    ...(validFrom ? { validFrom } : {}),
    base: { subscriptionYearly: values.baseSub, prices: { kwh: values.baseKwh } },
    hphc: { subscriptionYearly: values.hphcSub, prices: { hp: values.hp, hc: values.hc } },
    tempo: {
      subscriptionYearly: values.tempoSub,
      prices: {
        blueHp: values.blueHp,
        blueHc: values.blueHc,
        whiteHp: values.whiteHp,
        whiteHc: values.whiteHc,
        redHp: values.redHp,
        redHc: values.redHc,
      },
    },
  };
}

function PriceInput({
  id,
  label,
  value,
  onChange,
  digits = 4,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  digits?: 2 | 4;
}) {
  return (
    <Field id={id} label={label}>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={digits === 4 ? '0.0001' : '0.01'}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function TariffSection({ settings }: { settings: SettingsDto }) {
  const [power, setPower] = useState<SubscribedPower>(settings.subscribedPowerKva);
  const [validFrom, setValidFrom] = useState(settings.grid?.validFrom ?? '');
  const [form, setForm] = useState<GridForm>(() => gridToForm(settings.grid));
  const [prefilled, setPrefilled] = useState(false);
  const { save, saving, saved, error, setError } = useSave();

  const set = (k: GridKey) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const defaults = defaultGridFor(power);

  function prefill() {
    if (!defaults) return;
    setForm(gridToForm(defaults));
    setValidFrom(TARIF_BLEU_VALID_FROM);
    setPrefilled(true);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const grid = formToGrid(form, validFrom);
    if (!grid) {
      setError(s.invalid);
      return;
    }
    void save({ subscribedPowerKva: power, grid });
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>{s.title}</CardTitle>
          <CardDescription>{s.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Field id="power" label={s.power}>
              <Select
                id="power"
                value={power}
                onChange={(e) => setPower(Number(e.target.value) as SubscribedPower)}
              >
                {SUBSCRIBED_POWERS.map((p) => (
                  <option key={p} value={p}>
                    {p} kVA
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="valid-from" label={s.validFrom}>
              <Input
                id="valid-from"
                type="date"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
              />
            </Field>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                onClick={prefill}
                disabled={!defaults}
                title={defaults ? undefined : s.prefillNone}
              >
                {s.prefill}
              </Button>
            </div>
          </div>
          {prefilled && <Alert variant="warning">{s.prefillWarning}</Alert>}
          {!defaults && <p className="text-xs text-slate-500">{s.prefillNone}</p>}

          <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 md:grid-cols-3">
            <legend className="px-1 text-sm font-semibold">{t.options.base}</legend>
            <PriceInput
              id="base-sub"
              label={s.subscription}
              value={form.baseSub}
              onChange={set('baseSub')}
              digits={2}
            />
            <PriceInput
              id="base-kwh"
              label={s.kwh}
              value={form.baseKwh}
              onChange={set('baseKwh')}
            />
          </fieldset>

          <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 md:grid-cols-3">
            <legend className="px-1 text-sm font-semibold">{t.options.hphc}</legend>
            <PriceInput
              id="hphc-sub"
              label={s.subscription}
              value={form.hphcSub}
              onChange={set('hphcSub')}
              digits={2}
            />
            <PriceInput id="hphc-hp" label={s.hp} value={form.hp} onChange={set('hp')} />
            <PriceInput id="hphc-hc" label={s.hc} value={form.hc} onChange={set('hc')} />
          </fieldset>

          <fieldset className="grid gap-4 rounded-md border border-slate-200 p-4 md:grid-cols-3">
            <legend className="px-1 text-sm font-semibold">{t.options.tempo}</legend>
            <PriceInput
              id="tempo-sub"
              label={s.subscription}
              value={form.tempoSub}
              onChange={set('tempoSub')}
              digits={2}
            />
            <div className="hidden md:block" />
            <div className="hidden md:block" />
            {(['blueHp', 'blueHc', 'whiteHp', 'whiteHc', 'redHp', 'redHc'] as const).map((k) => (
              <PriceInput
                key={k}
                id={`tempo-${k}`}
                label={`${s.tempo[k]} (€/kWh)`}
                value={form[k]}
                onChange={set(k)}
              />
            ))}
          </fieldset>
        </CardContent>
        <CardFooter>
          <SaveBar saving={saving} saved={saved} error={error} />
        </CardFooter>
      </form>
    </Card>
  );
}
