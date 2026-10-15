/**
 * WebdriverIO desktop E2E for OpenMark.
 *
 *     pnpm test:desktop          # node_modules/.bin/wdio.CMD run tests/desktop/wdio.conf.ts
 *
 * This drives the **real Tauri binary** — no mocks, no dev server, no browser shim. On
 * Windows `tauri-driver` proxies WebDriver to `msedgedriver`, which launches the app as a
 * WebView2 host and attaches over CDP, so the suite exercises the same runtime a user gets.
 *
 * Why `driverProvider: 'external'`:
 *   - the default `embedded` provider needs `tauri-plugin-wdio-webdriver`, which this app
 *     does not depend on;
 *   - `tauri-plugin-wdio` (registered in `src-tauri/src/lib.rs` under `debug_assertions`)
 *     only backs `browser.tauri.execute()`, command mocking and log capture, and those also
 *     need the `@wdio/tauri-plugin` frontend import, which the app does not ship.
 *   The suite therefore sticks to plain WebDriver commands, which works against any build.
 *
 * Target binary: `src-tauri/target/debug/openmark.exe` — the profile in which the wdio
 * plugin is registered and the `wdio.json` capability is meaningful. Build it with
 * `node_modules/.bin/tauri.CMD build --debug --no-bundle`. Point `OPENMARK_BINARY` at
 * another binary (e.g. the release build) to run the same specs against it.
 *
 * The toolchain is project-local and the repository path contains a space, so `cargo`,
 * `tauri-driver` and `msedgedriver` must be reachable on PATH from this process:
 *
 *     export RUSTUP_HOME="<repo>/.tools/rustup"
 *     export CARGO_HOME="<repo>/.tools/cargo"
 *     export PATH="<repo>/.tools/cargo/bin;$APPDATA/npm;$PATH"
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');

const appBinary =
  process.env['OPENMARK_BINARY'] ?? resolve(repositoryRoot, 'src-tauri', 'target', 'debug', 'openmark.exe');

/**
 * The fixture is handed to the app as a command-line argument, which is the same path the
 * Windows "Open with" integration uses: `markdown_paths()` in `src-tauri/src/lib.rs` parks
 * it and replays it as `openmark://open-file` once the frontend reports it is listening.
 * Driving the native file dialog is not possible from WebDriver, so this *is* the real
 * user-facing open flow.
 */
const fixture = resolve(here, 'fixtures', 'math-render.md');

export const config = {
  runner: 'local',
  specs: [resolve(here, 'openmark.spec.ts')],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': {
        application: appBinary,
        args: [fixture],
      },
    },
  ],

  services: [
    [
      '@wdio/tauri-service',
      {
        driverProvider: 'external',
        // tauri-driver is a Rust binary; `autoInstallTauriDriver` runs `cargo install`
        // when it is not already on PATH. msedgedriver is fetched from Microsoft to match
        // the installed WebView2 runtime (149.x on this machine).
        autoInstallTauriDriver: true,
        autoDownloadEdgeDriver: true,
        tauriDriverPort: 4444,
        logLevel: 'info',
      },
    ],
  ],

  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: {
    ui: 'bdd',
    // The first launch of a debug binary plus a WebView2 cold start is slow.
    timeout: 180_000,
  },

  logLevel: 'info',
  waitforTimeout: 20_000,
  connectionRetryTimeout: 120_000,
  connectionRetryCount: 3,
};
