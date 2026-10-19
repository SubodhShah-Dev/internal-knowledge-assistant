import { defineConfig } from '@playwright/test';

// Requires: Docker Postgres running, schema applied, a populated .env
// (DATABASE_URL, JWT_SECRET, LLM_*). Reuses an already-running API/frontend.
export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 60_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'npm run dev:api',
      cwd: '../..',
      url: 'http://localhost:4000/api/health',
      reuseExistingServer: true,
      timeout: 30_000
    },
    {
      command: 'npm run dev:web',
      cwd: '../..',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 30_000
    }
  ]
});
