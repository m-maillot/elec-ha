import { testApp } from '../test/helpers.js';

describe('GET /api/health', () => {
  it('répond ok', async () => {
    const app = await testApp();
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok' });
    await app.close();
  });
});
