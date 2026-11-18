import { randomUUID } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';

process.env.NFS_E2E_PREFIX ??= `e2e-${randomUUID()}-`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: 'list',
  globalTeardown: './e2e/cleanup.ts',
  use: {
    baseURL: 'http://localhost:5163',
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
    trace: 'off',
  },
});
