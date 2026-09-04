import { render, screen, within } from '@testing-library/react';
import { ComparisonCards } from './ComparisonCards.js';
import { simulation } from './fixtures.js';

describe('ComparisonCards', () => {
  it('affiche les trois cartes, la meilleure option et l’option actuelle', () => {
    render(<ComparisonCards result={simulation} />);
    const base = screen.getByRole('region', { name: 'Base' });
    const hphc = screen.getByRole('region', { name: 'HP / HC' });
    const tempo = screen.getByRole('region', { name: 'Tempo' });
    expect(within(base).getByText('actuelle')).toBeInTheDocument();
    expect(within(base).queryByText(/Écart vs option actuelle/)).not.toBeInTheDocument();
    expect(within(hphc).getByText('meilleure option')).toBeInTheDocument();
    expect(within(hphc).getByText(/Écart vs option actuelle/)).toBeInTheDocument();
    expect(within(hphc).getByText(/-0,19 €/)).toBeInTheDocument();
    expect(within(tempo).getByText(/\+1,88 €/)).toBeInTheDocument();
    expect(within(tempo).getByText(/\+61,8 %/)).toBeInTheDocument();
  });

  it('détaille HP/HC et le tableau Tempo par couleur avec libellés', () => {
    render(<ComparisonCards result={simulation} />);
    const hphc = screen.getByRole('region', { name: 'HP / HC' });
    expect(within(hphc).getByRole('row', { name: /Heures creuses/ })).toHaveTextContent('60');
    const tempo = screen.getByRole('region', { name: 'Tempo' });
    const red = within(tempo).getByText('Rouge').closest('tr')!;
    expect(red).toHaveTextContent('1 jour(s)');
    expect(red).toHaveTextContent('3,89');
    expect(red).toHaveTextContent('HP 4 kWh');
    expect(within(tempo).getByText('Bleu')).toBeInTheDocument();
  });

  it('signale un total Tempo partiel', () => {
    const partial = {
      ...simulation,
      best: 'hphc' as const,
      tempo: { ...simulation.tempo, partial: true, excludedKwh: 2.5 },
    };
    render(<ComparisonCards result={partial} />);
    const tempo = screen.getByRole('region', { name: 'Tempo' });
    expect(within(tempo).getByText('partiel')).toBeInTheDocument();
    expect(within(tempo).getByText(/2,5 kWh exclus/)).toBeInTheDocument();
  });
});

describe('ComparisonCards – lissage', () => {
  it('affiche le coût sans lissage et les kWh redistribués', () => {
    const smoothed = {
      ...simulation,
      smoothingApplied: true,
      smoothing: {
        refDays: 3,
        searchWindowDays: 14,
        periods: [
          {
            days: ['2026-01-15'],
            colors: ['red' as const],
            referencesBefore: ['2026-01-12', '2026-01-13', '2026-01-14'],
            referencesAfter: ['2026-01-16', '2026-01-17', '2026-01-18'],
            smoothed: true,
            skippedDays: [],
          },
        ],
        costWithoutSmoothing: 3.21,
        redistributedKwh: 22,
        substitutedHours: [],
      },
    };
    render(<ComparisonCards result={smoothed} />);
    const tempo = screen.getByRole('region', { name: 'Tempo' });
    expect(within(tempo).getByText('Coût sans lissage')).toBeInTheDocument();
    expect(within(tempo).getByText(/3,21\s€/)).toBeInTheDocument();
    expect(within(tempo).getByText(/\+22\skWh/)).toBeInTheDocument();
  });
});
