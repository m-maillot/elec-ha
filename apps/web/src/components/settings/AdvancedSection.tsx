import { useState, type FormEvent } from 'react';
import {
  SMOOTHING_PROFILES,
  TARIFF_OPTIONS,
  type SettingsDto,
  type SmoothingProfile,
  type TariffOption,
} from '@elec-ha/core';
import { t } from '../../i18n/fr.js';
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

const s = t.settings.advanced;

export function AdvancedSection({ settings }: { settings: SettingsDto }) {
  const [currentOption, setCurrentOption] = useState<TariffOption>(settings.currentOption);
  const [colorSwitchHour, setColorSwitchHour] = useState(String(settings.advanced.colorSwitchHour));
  const [refDays, setRefDays] = useState(String(settings.advanced.smoothingRefDays));
  const [window, setWindow] = useState(String(settings.advanced.smoothingSearchWindowDays));
  const [profile, setProfile] = useState<SmoothingProfile>(settings.advanced.smoothingProfile);
  const { save, saving, saved, error } = useSave();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void save({
      currentOption,
      advanced: {
        colorSwitchHour: Number(colorSwitchHour),
        smoothingRefDays: Number(refDays),
        smoothingSearchWindowDays: Number(window),
        smoothingProfile: profile,
      },
    });
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>{s.title}</CardTitle>
          <CardDescription>{s.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <Field id="current-option" label={s.currentOption}>
              <Select
                id="current-option"
                value={currentOption}
                onChange={(e) => setCurrentOption(e.target.value as TariffOption)}
              >
                {TARIFF_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {t.options[o]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="color-switch-hour" label={s.colorSwitchHour}>
              <Input
                id="color-switch-hour"
                type="number"
                min={0}
                max={23}
                step={1}
                required
                value={colorSwitchHour}
                onChange={(e) => setColorSwitchHour(e.target.value)}
              />
            </Field>
            <Field id="smoothing-ref-days" label={s.smoothingRefDays}>
              <Input
                id="smoothing-ref-days"
                type="number"
                min={1}
                max={10}
                step={1}
                required
                value={refDays}
                onChange={(e) => setRefDays(e.target.value)}
              />
            </Field>
            <Field id="smoothing-profile" label={s.smoothingProfile}>
              <Select
                id="smoothing-profile"
                value={profile}
                onChange={(e) => setProfile(e.target.value as SmoothingProfile)}
              >
                {SMOOTHING_PROFILES.map((p) => (
                  <option key={p} value={p}>
                    {s.smoothingProfiles[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="smoothing-window" label={s.smoothingSearchWindowDays}>
              <Input
                id="smoothing-window"
                type="number"
                min={1}
                max={60}
                step={1}
                required
                value={window}
                onChange={(e) => setWindow(e.target.value)}
              />
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
