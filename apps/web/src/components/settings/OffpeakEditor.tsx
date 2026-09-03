import { Plus, Trash2 } from 'lucide-react';
import { validateOffpeakRanges, type OffpeakRange } from '@elec-ha/core';
import { t } from '../../i18n/fr.js';
import { formatDuration, minToTime, timeToMin } from '../../lib/time.js';
import { Alert } from '../ui/alert.js';
import { Button } from '../ui/button.js';
import { Input } from '../ui/input.js';

const s = t.settings.offpeak;

interface OffpeakEditorProps {
  idPrefix: string;
  label: string;
  ranges: OffpeakRange[];
  onChange: (ranges: OffpeakRange[]) => void;
}

/** Éditeur d'une liste de plages HC `[début, fin[` au pas de 30 min, validée en direct. */
export function OffpeakEditor({ idPrefix, label, ranges, onChange }: OffpeakEditorProps) {
  const validation = validateOffpeakRanges(ranges);

  const update = (i: number, key: keyof OffpeakRange, time: string) => {
    const min = timeToMin(time);
    if (min === null) return;
    onChange(ranges.map((r, j) => (j === i ? { ...r, [key]: min } : r)));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{label}</h3>
        <span className="text-xs text-slate-500">
          {s.total(formatDuration(validation.totalMinutes))}
        </span>
      </div>
      <ul className="flex flex-col gap-2">
        {ranges.map((r, i) => (
          <li key={i} className="flex flex-wrap items-center gap-2">
            <label htmlFor={`${idPrefix}-start-${i}`} className="w-12 text-sm text-slate-600">
              {s.start}
            </label>
            <Input
              id={`${idPrefix}-start-${i}`}
              type="time"
              step={1800}
              className="w-32"
              value={minToTime(r.startMin)}
              onChange={(e) => update(i, 'startMin', e.target.value)}
            />
            <label htmlFor={`${idPrefix}-end-${i}`} className="w-8 text-sm text-slate-600">
              {s.end}
            </label>
            <Input
              id={`${idPrefix}-end-${i}`}
              type="time"
              step={1800}
              className="w-32"
              value={minToTime(r.endMin)}
              onChange={(e) => update(i, 'endMin', e.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={`${t.app.remove} la plage ${i + 1}`}
              onClick={() => onChange(ranges.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...ranges, { startMin: 22 * 60, endMin: 6 * 60 }])}
        >
          <Plus className="h-4 w-4" aria-hidden /> {s.addRange}
        </Button>
      </div>
      {validation.errors.map((e) => (
        <Alert key={e} variant="error" className="py-1">
          {e}
        </Alert>
      ))}
      {validation.valid &&
        validation.warnings.map((w) => (
          <Alert key={w} variant="warning" className="py-1">
            {w}
          </Alert>
        ))}
    </div>
  );
}
