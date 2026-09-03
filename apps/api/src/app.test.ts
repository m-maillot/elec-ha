import { buildApp } from './app.js';

describe('GET /api/health', () => {
  it('répond ok', async () => {
    const app = await buildApp({ config: { webDistDir: undefined }, logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
    await app.close();
  });
});
