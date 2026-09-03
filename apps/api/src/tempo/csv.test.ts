import type { FastifyInstance } from 'fastify';
import { testApp } from '../../test/helpers.js';

describe('/api/tempo/days', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await testApp();
  });
  afterEach(() => app.close());

  it('importe un CSV date;couleur et liste les jours manquants', async () => {
    const csv = [
      'date;couleur',
      '2026-01-14;bleu',
      '15/01/2026;ROUGE',
      '2026-01-16;white',
      'oops;bleu',
      '2026-01-17;violet',
    ].join('\n');
    const res = await app.inject({
      method: 'POST',
      url: '/api/tempo/days',
      payload: csv,
      headers: { 'content-type': 'text/csv' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ imported: 3, skipped: 0 });
    expect(res.json().errors).toHaveLength(2);

    const get = await app.inject({
      method: 'GET',
      url: '/api/tempo/days?from=2026-01-13&to=2026-01-17',
    });
    expect(get.json().days).toEqual([
      { date: '2026-01-14', color: 'blue', source: 'csv' },
      { date: '2026-01-15', color: 'red', source: 'csv' },
      { date: '2026-01-16', color: 'white', source: 'csv' },
    ]);
    expect(get.json().missing).toEqual(['2026-01-13', '2026-01-17']);
  });

  it('n’écrase pas une date existante sauf overwrite', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/tempo/days',
      payload: { csv: '2026-01-15;rouge' },
    });
    const again = await app.inject({
      method: 'POST',
      url: '/api/tempo/days',
      payload: { csv: '2026-01-15;bleu' },
    });
    expect(again.json()).toMatchObject({ imported: 0, skipped: 1 });
    const forced = await app.inject({
      method: 'POST',
      url: '/api/tempo/days',
      payload: { csv: '2026-01-15;bleu', overwrite: true },
    });
    expect(forced.json()).toMatchObject({ imported: 1 });
    const get = await app.inject({
      method: 'GET',
      url: '/api/tempo/days?from=2026-01-15&to=2026-01-15',
    });
    expect(get.json().days[0].color).toBe('blue');
  });
});
