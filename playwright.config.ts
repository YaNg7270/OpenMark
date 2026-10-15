import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * Two deliberate choices:
 *
 *  - **Edge rather than a downloaded Chromium.** The shipping runtime is WebView2, which
 *    *is* Edge, so testing against the installed Edge channel exercises the same engine
 *    family as production while avoiding a ~150 MB browser download in a constrained
 *    environment.
 *  - **`vite preview` rather than the dev server.** The suite therefore runs against the
 *    minified production bundle, so a build-time mistake (a missing dynamic-import chunk,
 *    a stripped MathJax asset) fails the tests instead of hiding until release.
 */

const PORT = Number(process.env.OM_E2E_PORT ?? 4173);
const BASE_URL = process.env.OM_E2E_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results/e2e',
  // A formula-heavy screenshot comparison is worth re-running once on a flaky first paint.
  retries: process.env.CI ? 1 : 0,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],

  use: {
    baseURL: BASE_URL,
    // The app marks interactive elements with `data-om-testid` rather than Playwright's
    // default `data-testid`, so that production markup never carries an automation-only
    // attribute name that a real user agent might also use.
    testIdAttribute: 'data-om-testid',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
  },

  projects: [
    {
      name: 'msedge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
  ],

  expect: {
    toHaveScreenshot: {
      // Antialiasing of CJK glyphs differs by a pixel or two between GPU states.
      maxDiffPixelRatio: 0.002,
      animations: 'disabled',
    },
  },

  /*
   * Serve the built app; `pnpm build` must have run first.
   *
   * `--host 127.0.0.1` is load-bearing. Vite preview otherwise binds `localhost`, which on
   * Windows resolves to `::1`, while the readiness probe polls the IPv4 literal — the
   * server starts fine and Playwright still times out waiting for it.
   */
  webServer: process.env.OM_E2E_BASE_URL
    ? undefined
    : {
        command: `node node_modules/vite/bin/vite.js preview --host 127.0.0.1 --port ${PORT} --strictPort`,
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
