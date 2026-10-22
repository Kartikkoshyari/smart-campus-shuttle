import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end tests in a real browser (Chromium).
 * First time only:  npx playwright install chromium
 * Then:             npm run test:e2e
 *
 * The tests always build the app in LOCAL DEMO mode (the Supabase variables
 * are emptied below), so they never touch your real database.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx vite build --outDir dist-e2e && npx vite preview --outDir dist-e2e --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' },
  },
})
