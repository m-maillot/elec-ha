import { startFakeRte, type FakeRte } from '../../test/fake-rte.js';
import { RteTempoClient } from './rte.js';

describe('RteTempoClient', () => {
  let rte: FakeRte;
  afterEach(() => rte.close());

  it('obtient un jeton, le met en cache, et lit le calendrier', async () => {
    rte = await startFakeRte({
      colorOf: (d) => (d === '2026-01-15' ? 'red' : d === '2026-01-16' ? 'white' : 'blue'),
    });
    const client = new RteTempoClient('cid', 'csecret', { baseUrl: rte.url });
    const cal = await client.fetchCalendar('2026-01-14', '2026-01-16');
    expect(cal).toEqual({ '2026-01-14': 'blue', '2026-01-15': 'red', '2026-01-16': 'white' });
    expect(rte.calendarRequests).toEqual([
      { start: '2026-01-14T00:00:00+01:00', end: '2026-01-17T00:00:00+01:00' },
    ]);
    await client.fetchCalendar('2026-07-01', '2026-07-01');
    expect(rte.tokenRequests).toBe(1);
    expect(rte.calendarRequests[1]).toEqual({
      start: '2026-07-01T00:00:00+02:00',
      end: '2026-07-02T00:00:00+02:00',
    });
  });

  it('découpe en tranches de 366 jours au plus', async () => {
    rte = await startFakeRte({ colorOf: () => 'blue' });
    const client = new RteTempoClient('cid', 'csecret', { baseUrl: rte.url });
    const cal = await client.fetchCalendar('2024-09-01', '2026-08-31');
    expect(Object.keys(cal)).toHaveLength(730);
    expect(rte.calendarRequests.map((r) => r.start.slice(0, 10))).toEqual([
      '2024-09-01',
      '2025-09-02',
    ]);
  });

  it('signale des identifiants refusés et le quota', async () => {
    rte = await startFakeRte({ clientSecret: 'other', quota: 0 });
    await expect(
      new RteTempoClient('cid', 'wrong', { baseUrl: rte.url }).getToken(),
    ).rejects.toMatchObject({ code: 'rte_unauthorized' });
    const ok = new RteTempoClient('cid', 'other', { baseUrl: rte.url });
    await expect(ok.fetchCalendar('2026-01-01', '2026-01-02')).rejects.toMatchObject({
      code: 'rte_quota',
    });
  });

  it('renouvelle le jeton expiré', async () => {
    rte = await startFakeRte({ expiresIn: 120 });
    let now = 1_000_000;
    const client = new RteTempoClient('cid', 'csecret', { baseUrl: rte.url, now: () => now });
    await client.getToken();
    now += 30_000;
    await client.getToken();
    expect(rte.tokenRequests).toBe(1);
    now += 60_000; // > 120 s − 60 s de marge
    await client.getToken();
    expect(rte.tokenRequests).toBe(2);
  });

  it('remonte une URL injoignable', async () => {
    rte = await startFakeRte();
    await expect(
      new RteTempoClient('cid', 'csecret', { baseUrl: 'http://127.0.0.1:1' }).getToken(),
    ).rejects.toMatchObject({ code: 'rte_unreachable' });
  });
});
