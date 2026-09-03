import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    conditions: ['development'],
  },
  test: {
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
