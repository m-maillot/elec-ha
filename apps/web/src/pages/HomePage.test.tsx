import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ConsumptionResponse } from '@elec-ha/core';
import { HomePage } from './HomePage.js';
import { configuredSettings, simulation } from '../components/home/fixtures.js';

vi.mock('../components/home/ConsumptionChart.js', () => ({
  ConsumptionChart: ({ points }: { points: unknown[] }) => (
    <div data-testid="chart">{points.length} points</div>
  ),
}));

const consumption: ConsumptionResponse = {
  from: '2026-01-15',
  to: '2026-01-16',
  granularity: 'hour',
  lastSyncAt: configuredSettings.lastSyncAt,
  points: Array.from({ length: 48 }, (_, i) => ({
    start: Date.UTC(2026, 0, 15, i),
    key: `2026-01-${i < 24 ? '15' : '16'}T${String(i % 24).padStart(2, '0')}:00`,
    kwh: i === 40 || i === 41 ? null : 0.5,
    missingHours: i === 40 || i === 41 ? 1 : 0,
    hcShareHphc: 0,
    hcShareTempo: 0,
    tempoColor: 'blue' as const,
  })),
};

const sse = [
  'event: progress\ndata: {"type":"progress","step":"consumption","done":0,"total":1,"message":"Chargement"}\n\n',
  'event: done\ndata: {"type":"done","consumption":{"chunks":1,"hoursStored":48,"daysRequested":2},"tempo":{"source":"rte","fetched":3,"missing":0},"lastSyncAt":"2026-09-03T09:00:00.000Z"}\n\n',
].join('');

function mockFetch() {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
      calls.push(key);
      const json = (body: unknown) =>
        Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      switch (key) {
        case 'GET /api/settings':
          return json(configuredSettings);
        case 'POST /api/simulate':
          return json(simulation);
        case 'GET /api/consumption':
          return json(consumption);
        case 'POST /api/data/sync':
          return Promise.resolve(
            new Response(sse, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
          );
        default:
          return Promise.resolve(
            new Response(JSON.stringify({ code: 'not_found', error: key }), { status: 404 }),
          );
      }
    }),
  );
  return calls;
}

function renderHome() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/settings" element={<p>settings</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('HomePage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche les cartes, l’indicateur d’heures manquantes et le graphique', async () => {
    mockFetch();
    renderHome();
    expect(await screen.findByRole('region', { name: 'Tempo' })).toBeInTheDocument();
    expect(await screen.findByTestId('chart')).toHaveTextContent('48 points');
    expect(screen.getByText('2 h manquante(s) sur la période (1 jour(s))')).toBeInTheDocument();
    expect(screen.getByText(/2 jours · 10 kWh/)).toBeInTheDocument();
  });

  it('lance l’actualisation et affiche le résultat de la sync', async () => {
    const calls = mockFetch();
    renderHome();
    await screen.findByRole('region', { name: 'Tempo' });
    fireEvent.click(screen.getByRole('button', { name: /Actualiser/ }));
    expect(
      await screen.findByText(
        /Actualisation terminée : 48 heure\(s\) chargée\(s\), 3 couleur\(s\)/,
      ),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(calls.filter((c) => c === 'POST /api/simulate').length).toBeGreaterThan(1),
    );
  });

  it('change la présélection de période', async () => {
    mockFetch();
    renderHome();
    await screen.findByRole('region', { name: 'Tempo' });
    fireEvent.click(screen.getByRole('button', { name: 'Année civile précédente' }));
    const year = new Date().getFullYear() - 1;
    expect(screen.getByLabelText('Du')).toHaveValue(`${year}-01-01`);
    expect(screen.getByLabelText('Au')).toHaveValue(`${year}-12-31`);
  });
});
