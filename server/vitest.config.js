import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    env: {
      DATABASE_PATH: ':memory:',
    },
    testTimeout: 10000,
  },
});
