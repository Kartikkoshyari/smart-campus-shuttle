/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// "npm run preview" sends the same security headers as the deployed site, so
// problems with the Content Security Policy show up before deployment.
const vercel = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[]
}
const siteHeaders = Object.fromEntries(
  (vercel.headers.find((rule) => rule.source === '/(.*)')?.headers ?? []).map(({ key, value }) => [key, value]),
)

// Vite builds and serves the app; the "test" section configures Vitest.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // Leaflet and the Supabase client make one bundle of about 700 kB (200 kB zipped).
    // That is fine for this app, so the size warning starts a little higher.
    chunkSizeWarningLimit: 800,
  },
  server: {
    port: 5173,
    open: true,
  },
  preview: {
    headers: siteHeaders,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    // "npm run test:coverage" writes a report to coverage/index.html.
    // The build fails if coverage drops clearly below what Phase 7 measured.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts'],
      reporter: ['text-summary', 'html'],
      thresholds: { statements: 78, branches: 68, functions: 80, lines: 80 },
    },
  },
})
