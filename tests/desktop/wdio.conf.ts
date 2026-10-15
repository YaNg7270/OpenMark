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
 *     # see `tauriDriverPath` below — the service cannot spawn a driver from a spaced path
 *     export OPENMARK_TAURI_DRIVER="C:/omkth/cargo/bin/tauri-driver.exe"
 *     pnpm test:desktop
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(here, '..', '..');

const appBinary =
  process.env['OPENMARK_BINARY'] ?? resolve(repositoryRoot, 'src-tauri', 'target', 'debug', 'openmark.exe');

/**
 * `@wdio/native-core@1.3.0` starts tauri-driver with `shell: true` and concatenates the
 * command without quoting, so on Windows cmd.exe truncates any executable path containing a
 * space: this repository lives under "D:/OMP WorkSpace/REA typora", the spawn fails with
 * `'D:/OMP' is not recognized as an internal or external command`, and tauri-driver exits 1
 * before it can log anything. A driver resolved through PATH is used verbatim, so the
 * workaround is to hand the service an executable outside every spaced directory — on this
 * machine the pre-existing `C:\omkth` junction to `<repo>\.tools` (see SESSION_HANDOFF.md).
 * Set OPENMARK_TAURI_DRIVER to that space-free copy; otherwise the service's own
 * `where tauri-driver` lookup is used.
 */
const tauriDriverPath = process.env['OPENMARK_TAURI_DRIVER'];

/**
 * The fixture is *not* passed on the app's command line. On Windows, msedgedriver launches
 * the WebView2 host process with a bare command line — `tauri:options.args` is dropped before
 * it reaches the app (verified against the live process) — so the spec opens
 * `fixtures/math-render.md` through the shell's own `openmark://open-file` event instead.
 */

export const config = {
  runner: 'local',
  specs: [resolve(here, 'openmark.spec.ts')],
  maxInstances: 1,

  capabilities: [
    {
      browserName: 'tauri',
      'tauri:options': {
        application: appBinary,
      },
    },
  ],

  services: [
    [
      '@wdio/tauri-service',
      {
        driverProvider: 'external',
        ...(tauriDriverPath ? { tauriDriverPath } : {}),
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
