import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';

import { playwright } from '@vitest/browser-playwright';

const dirname =
  typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
export default defineConfig({
  resolve: {
    alias: { '@': path.join(dirname, 'src') },
  },
  test: {
    projects: [
      {
        // The goals server: the repo layer is SQL and transactions, so these run
        // against a real Postgres (`docker compose up -d db`) rather than a fake,
        // which would only prove the fake was called. They share one database and
        // truncate between tests, so the files must not run in parallel.
        extends: true,
        resolve: {
          alias: {
            '@': path.join(dirname, 'src'),
            // `server-only` throws outside a React Server Component; stub it out so
            // the server modules under test import cleanly in plain Node.
            'server-only': path.join(dirname, 'src/server/test/noop.ts'),
          },
        },
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/server/test/**/*.test.ts'],
          fileParallelism: false,
        },
      },
      {
        // Pure client-side logic (the store's sync/persistence), with the server
        // mocked out. No Postgres, no browser — the module only needs a stubbed
        // `window` for its push subscriber to attach.
        extends: true,
        test: {
          name: 'lib',
          environment: 'node',
          include: ['src/lib/test/**/*.test.ts'],
        },
      },
      {
        extends: true,
        plugins: [
          // The plugin will run tests for the stories defined in your Storybook config
          // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
          storybookTest({ configDir: path.join(dirname, '.storybook') }),
        ],
        test: {
          name: 'storybook',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright({}),
            instances: [{ browser: 'chromium' }],
          },
        },
      },
    ],
  },
});
