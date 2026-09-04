import { render, screen, within } from '@testing-library/react';
import type { DayRow } from '@elec-ha/core';
import { DaysTable } from './DaysTable.js';

const days: DayRow[] = [
  {
    date: '2026-01-14',
    color: 'blue',
    kwh: 30,
    hpKwh: 12,
    hcKwh: 18,
    presentHours: 24,
    addedKwh: 0,
  },
  { date: '2026-01-15', color: 'red', kwh: 10, hpKwh: 4, hcKwh: 6, presentHours: 24, addedKwh: 22 },
  { date: '2026-01-16', color: null, kwh: null, hpKwh: 0, hcKwh: 0, presentHours: 0 },
  { date: '2026-01-17', color: 'white', kwh: 20.4, hpKwh: 10, hcKwh: 10.4, presentHours: 20 },
];

describe('DaysTable', () => {
  it('liste chaque jour avec couleur, total, HP, HC et kWh ajoutés', () => {
    render(<DaysTable days={days} smoothing />);
    expect(screen.getByText('4 jour(s)')).toBeInTheDocument();
    const red = screen.getByRole('row', { name: /15 janv\. 2026/ });
    expect(within(red).getByText('Rouge')).toBeInTheDocument();
    expect(red).toHaveTextContent('10');
    expect(within(red).getByText('+22')).toBeInTheDocument();
    const unknown = screen.getByRole('row', { name: /16 janv\. 2026/ });
    expect(within(unknown).getByText('inconnue')).toBeInTheDocument();
    expect(within(unknown).getByText('—')).toBeInTheDocument();
    const white = screen.getByRole('row', { name: /17 janv\. 2026/ });
    expect(within(white).getByText('4 h manquante(s)')).toBeInTheDocument();
    expect(white).toHaveTextContent('20,4');
  });

  it('masque la colonne des kWh ajoutés sans lissage', () => {
    render(<DaysTable days={days} smoothing={false} />);
    expect(screen.queryByText('kWh ajoutés (lissage)')).not.toBeInTheDocument();
  });
});
