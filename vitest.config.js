/**
 * Root vitest config — exists purely as a guardrail.
 *
 * The real config is server/vitest.config.js. But vitest only picks that up
 * when you run from inside server/; running `npx vitest run` from the repo root
 * finds no config, DATABASE_PATH stays unset, and server/src/db/db.js falls
 * back to the real data/family.db. The suite's beforeEach then DELETEs every
 * row from users, families and 15 other tables — against live data.
 *
 * That happened on 2026-07-29 and cost the whole dev family. This file makes
 * the root invocation safe by pinning the same in-memory database.
 *
 * Deliberately a plain object rather than defineConfig(): vitest isn't a
 * dependency at the repo root, so importing 'vitest/config' here would crash
 * before any of the above could take effect.
 */
export default {
  test: {
    env: {
      DATABASE_PATH: ':memory:',
    },
    include: ['server/tests/**/*.test.js'],
    testTimeout: 10000,
  },
};
