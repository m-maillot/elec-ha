import { useState, type FormEvent } from 'react';
import { validateOffpeakRanges, type OffpeakRange, type SettingsDto } from '@elec-ha/core';
import { t } from '../../i18n/fr.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../ui/card.js';
import { OffpeakEditor } from './OffpeakEditor.js';
import { SaveBar } from './SaveBar.js';
import { useSave } from './useSave.js';

const s = t.settings.offpeak;

export function OffpeakSection({ settings }: { settings: SettingsDto }) {
  const [hphc, setHphc] = useState<OffpeakRange[]>(settings.offpeak.hphc);
  const [tempo, setTempo] = useState<OffpeakRange[]>(settings.offpeak.tempo);
  const { save, saving, saved, error } = useSave();
  const valid = validateOffpeakRanges(hphc).valid && validateOffpeakRanges(tempo).valid;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (valid) void save({ offpeak: { hphc, tempo } });
  }

  return (
    <Card>
      <form onSubmit={onSubmit}>
        <CardHeader>
          <CardTitle>{s.title}</CardTitle>
          <CardDescription>{s.description}</CardDescription>
        </CardHeader>
        <CardContent className="gap-6">
          <OffpeakEditor idPrefix="hphc" label={s.hphc} ranges={hphc} onChange={setHphc} />
          <OffpeakEditor idPrefix="tempo" label={s.tempo} ranges={tempo} onChange={setTempo} />
        </CardContent>
        <CardFooter>
          <SaveBar saving={saving} saved={saved} error={error} disabled={!valid} />
        </CardFooter>
      </form>
    </Card>
  );
}
