import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DeviceCostsResponse, SeriesCost } from '@elec-ha/core';
import { DevicesTable } from './DevicesTable.js';

const cost = (kwh: number, hc: number, base: number, hphc: number, tempo: number): SeriesCost => ({
  kwh,
  hpKwh: kwh - hc,
  hcKwh: hc,
  presentHours: 48,
  cost: { base, hphc, tempo },
  tempoExcludedKwh: 0,
});

const costs: DeviceCostsResponse = {
  period: { from: '2026-01-15', to: '2026-01-16' },
  total: cost(92, 40, 18.41, 17.49, 16.2),
  devices: [
    {
      statisticId: 'sensor.voiture',
      name: 'Voiture',
      share: 24 / 92,
      ...cost(24, 24, 4.8, 3.81, 3.57),
    },
    { statisticId: 'sensor.nas', name: 'NAS', share: 2.4 / 92, ...cost(2.4, 0.8, 0.48, 0.47, 0.5) },
  ],
  untracked: {
    statisticId: null,
    name: '',
    share: 65.6 / 92,
    ...cost(65.6, 15.2, 13.13, 13.21, 12.13),
  },
  overcounted: false,
  lastSyncAt: null,
};

const renderTable = (props: Partial<Parameters<typeof DevicesTable>[0]> = {}) =>
  render(
    <MemoryRouter>
      <DevicesTable costs={costs} configured={2} currentOption="tempo" {...props} />
    </MemoryRouter>,
  );

describe('DevicesTable', () => {
  it('affiche consommation, part et coût de chaque appareil dans les trois options', () => {
    renderTable();
    const car = screen.getByRole('row', { name: /^Voiture/ });
    expect(car).toHaveTextContent('24');
    expect(car).toHaveTextContent('26,1');
    expect(within(car).getByText(/4,80\s€/)).toBeInTheDocument();
    expect(within(car).getByText(/3,81\s€/)).toBeInTheDocument();
    expect(within(car).getByText(/3,57\s€/)).toBeInTheDocument();
    expect(car).not.toHaveTextContent('données sur');
    expect(screen.getByRole('row', { name: /Non suivi/ })).toHaveTextContent('65,6');
    expect(screen.getByRole('row', { name: /Logement/ })).toHaveTextContent('92');
    expect(
      screen.getByRole('columnheader', { name: /Coût Tempo \(actuelle\)/ }),
    ).toBeInTheDocument();
  });

  it('invite à configurer les appareils quand il n’y en a aucun', () => {
    renderTable({ costs: undefined, configured: 0 });
    expect(screen.getByText(/Aucun appareil individuel/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /configuration/i })).toHaveAttribute(
      'href',
      '/settings',
    );
  });

  it('signale un coût Tempo partiel et un dépassement du total', () => {
    renderTable({
      costs: {
        ...costs,
        overcounted: true,
        total: { ...costs.total, tempoExcludedKwh: 5 },
        devices: [
          { ...costs.devices[0]!, tempoExcludedKwh: 5, presentHours: 12 },
          { ...costs.devices[1]!, presentHours: 0 },
        ],
      },
    });
    expect(screen.getByText(/dépasse la consommation du logement/)).toBeInTheDocument();
    expect(screen.getByText(/sans couleur Tempo connue/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /^Voiture/ })).toHaveTextContent(
      'données sur 25 % de la période',
    );
    expect(screen.getByRole('row', { name: /^NAS/ })).toHaveTextContent(
      'aucune donnée sur la période',
    );
  });
});
