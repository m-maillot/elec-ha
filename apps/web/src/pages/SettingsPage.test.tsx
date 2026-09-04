import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { SettingsDto } from '@elec-ha/core';
import { SettingsPage } from './SettingsPage.js';

const defaults: SettingsDto = {
  ha: { url: null, tokenSet: false, entityIds: [] },
  subscribedPowerKva: 6,
  currentOption: 'base',
  grid: null,
  offpeak: { hphc: [], tempo: [{ startMin: 1320, endMin: 360 }] },
  tempo: { source: 'rte', rteClientId: null, rteSecretSet: false },
  advanced: {
    colorSwitchHour: 6,
    smoothingRefDays: 3,
    smoothingSearchWindowDays: 14,
    smoothingProfile: 'median',
  },
  configured: false,
  lastSyncAt: null,
  updatedAt: null,
};

function mockFetch(handlers: Record<string, (init?: RequestInit) => unknown>) {
  const calls: Array<{ url: string; init?: RequestInit | undefined }> = [];
  const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const key = `${init?.method ?? 'GET'} ${url.split('?')[0]}`;
    calls.push({ url, init });
    const handler = handlers[key];
    if (!handler)
      return Promise.resolve(
        new Response(JSON.stringify({ code: 'not_found', error: key }), { status: 404 }),
      );
    return Promise.resolve(
      new Response(JSON.stringify(handler(init)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function renderPage(path = '/settings') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SettingsPage', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('affiche le message d’accueil et pré-remplit la grille 6 kVA', async () => {
    let settings = defaults;
    const calls = mockFetch({
      'GET /api/settings': () => settings,
      'PUT /api/settings': (init) => {
        const patch = JSON.parse(init?.body as string) as Partial<SettingsDto>;
        settings = { ...settings, ...patch, updatedAt: '2026-09-03T10:00:00Z' };
        return settings;
      },
    });
    renderPage('/settings?welcome=1');
    expect(await screen.findByText(/Bienvenue/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Pré-remplir/ }));
    expect(screen.getByLabelText('Rouge HP (€/kWh)')).toHaveValue(0.7295);
    expect(screen.getByLabelText<HTMLInputElement>('En vigueur depuis (informatif)').value).toBe(
      '2026-08-01',
    );
    expect(screen.getByText(/Valeurs publiques indicatives/)).toBeInTheDocument();

    const forms = screen.getAllByRole('button', { name: 'Enregistrer' });
    fireEvent.click(forms[1]!); // section grille
    await waitFor(() => expect(calls.some((c) => c.init?.method === 'PUT')).toBe(true));
    const put = calls.find((c) => c.init?.method === 'PUT')!;
    const body = JSON.parse(put.init?.body as string) as {
      grid: { tempo: { prices: { redHp: number } } };
      subscribedPowerKva: number;
    };
    expect(body.subscribedPowerKva).toBe(6);
    expect(body.grid.tempo.prices.redHp).toBe(0.7295);
    expect(await screen.findByText('Enregistré.')).toBeInTheDocument();
  });

  it('valide les créneaux HC en direct et bloque l’enregistrement', async () => {
    mockFetch({ 'GET /api/settings': () => defaults });
    renderPage();
    await screen.findByText('Créneaux heures creuses');
    // Jeu Tempo : 22:00–06:00 par défaut ; on ajoute une plage qui chevauche
    fireEvent.click(screen.getAllByRole('button', { name: /Ajouter une plage/ })[1]!);
    expect((await screen.findAllByText(/chevauchent/)).length).toBeGreaterThan(0);
    const saveButtons = screen.getAllByRole('button', { name: 'Enregistrer' });
    expect(saveButtons[2]).toBeDisabled();
    // Suppression de la plage ajoutée → valide, 8 h
    fireEvent.click(screen.getByRole('button', { name: /Supprimer la plage 2/ }));
    expect(screen.queryAllByText(/chevauchent/)).toHaveLength(0);
    expect(saveButtons[2]).toBeEnabled();
  });

  it('teste la connexion HA et remplit la liste des entités', async () => {
    mockFetch({
      'GET /api/settings': () => defaults,
      'POST /api/ha/test': () => ({
        ok: true,
        version: '2026.8.1',
        eligibleEntities: 2,
        totalStatistics: 40,
        entities: [
          { statisticId: 'sensor.linky_hp', name: 'Index HP', unit: 'kWh', source: 'recorder' },
          { statisticId: 'sensor.linky_hc', name: 'Index HC', unit: 'kWh', source: 'recorder' },
        ],
      }),
    });
    renderPage();
    await screen.findByText('Connexion Home Assistant');
    fireEvent.change(screen.getByLabelText('URL de l’instance'), {
      target: { value: 'http://ha.local:8123' },
    });
    fireEvent.change(screen.getByLabelText('Token longue durée'), { target: { value: 'tok' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tester la connexion' }));
    expect(await screen.findByText(/Connecté à Home Assistant 2026.8.1/)).toBeInTheDocument();
    const hp = screen.getByRole('checkbox', { name: /Index HP/ });
    const hc = screen.getByRole('checkbox', { name: /Index HC/ });
    fireEvent.click(hp);
    fireEvent.click(hc);
    expect(screen.getByText('2 entité(s) sélectionnée(s)')).toBeInTheDocument();
    fireEvent.click(hp);
    expect(screen.getByText('1 entité(s) sélectionnée(s)')).toBeInTheDocument();
  });
});
