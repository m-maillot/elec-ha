import { loadConfig } from './config.js';

describe('loadConfig', () => {
  it('refuse de démarrer sans APP_SECRET', () => {
    expect(() => loadConfig({})).toThrow(/APP_SECRET/);
  });
  it('lit PORT et DATA_DIR', () => {
    const cfg = loadConfig({ APP_SECRET: 'x'.repeat(32), PORT: '4000', DATA_DIR: '/data' });
    expect(cfg.port).toBe(4000);
    expect(cfg.dataDir).toBe('/data');
  });
});
