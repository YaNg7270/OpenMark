#!/usr/bin/env node
/**
 * Launches the WebdriverIO desktop suite with the project-local Rust toolchain on PATH.
 *
 * ## Why this wrapper exists
 *
 * `@wdio/tauri-service` locates the Rust toolchain by looking for `cargo` on `PATH`. This
 * repository deliberately keeps Rust *inside* the project (`.tools/cargo`, `.tools/rustup`)
 * so that nothing global on the machine is modified — which means `cargo` is not on `PATH`
 * and the service reports "Rust toolchain (cargo) not found" before it ever starts a driver.
 *
 * The toolchain is reachable through a space-free junction (`C:\omkth` -> `<repo>\.tools`),
 * because this shell cannot resolve executables whose PATH entry contains a space and the
 * repository path contains one. The junction is created by the bootstrap steps in
 * `SESSION_HANDOFF.md`; recreate it with:
 *
 *   cmd /c mklink /J C:\omkth "<repo>\.tools"
 *
 * Everything is passed through the child's environment rather than the parent's, so the
 * wrapper works regardless of how it is invoked.
 */
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOOLS = path.join(ROOT, '.tools');
const JUNCTION = 'C:\\omkth';

/** Prefers the space-free junction, falling back to the real path when it is absent. */
function toolRoot(segment, realName) {
  const viaJunction = path.join(JUNCTION, segment);
  if (existsSync(viaJunction)) return viaJunction;
  return path.join(TOOLS, realName);
}

const cargoHome = toolRoot('cargo', 'cargo');
const rustupHome = toolRoot('rustup', 'rustup');
const cargoBin = path.join(cargoHome, 'bin');

if (!existsSync(cargoBin)) {
  console.error(`[desktop-e2e] cargo not found at ${cargoBin}`);
  console.error('[desktop-e2e] Run the bootstrap steps in SESSION_HANDOFF.md first.');
  process.exit(1);
}

/*
 * `@wdio/native-core` spawns tauri-driver with `shell: true` and does not quote the command,
 * so cmd.exe truncates any executable path containing a space — and this repository lives
 * under one. A driver resolved through PATH is used verbatim, so the space-free junction copy
 * is handed to the service explicitly. Install it with:
 *
 *   cargo install tauri-driver --locked
 */
const tauriDriver = path.join(cargoBin, 'tauri-driver.exe');

const wdio = path.join(ROOT, 'node_modules', '@wdio', 'cli', 'bin', 'wdio.js');
const config = path.join(ROOT, 'tests', 'desktop', 'wdio.conf.ts');

/**
 * Refuses to run against a binary that predates the frontend it is supposed to contain.
 *
 * The frontend is embedded at compile time, and a stale `src-tauri/target/debug/openmark.exe`
 * still launches, still renders, and still passes tests — it simply does not contain the change
 * under test, so a green run proves nothing. This happened: `dist/` was rebuilt, cargo reported
 * "Finished" without recompiling, and the suite passed against the previous UI.
 *
 * `src-tauri/build.rs` now declares `rerun-if-changed=../dist` so cargo re-embeds the frontend,
 * which makes this check redundant for the default flow. It stays as a backstop because
 * `OPENMARK_BINARY` can point anywhere.
 *
 * Note the build command in the messages below. `tauri build --debug` enables
 * `tauri/custom-protocol`, and `tauri-2.12.4/build.rs` sets `dev = !custom_protocol`; without
 * that feature the binary is a *dev-server* binary that loads `devUrl`
 * (`http://localhost:1420`) instead of embedding `dist/`. Running a plain `cargo build` here
 * silently replaces the good binary with one that cannot render, and every test in this suite
 * fails for a reason that has nothing to do with the app.
 */
function assertBinaryIsFresh() {
  // Mirrors `appBinary` in tests/desktop/wdio.conf.ts; keep the two in step.
  const binary =
    process.env['OPENMARK_BINARY'] ??
    path.join(ROOT, 'src-tauri', 'target', 'debug', 'openmark.exe');

  if (!existsSync(binary)) {
    console.error(`[desktop-e2e] binary not found at ${binary}`);
    console.error(`[desktop-e2e] Build it with: pnpm tauri build --debug --no-bundle`);
    process.exit(1);
  }

  /** Newest modification time under `dir`, walking subdirectories. */
  const newest = (dir) => {
    let latest = 0;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const time = entry.isDirectory() ? newest(full) : statSync(full).mtimeMs;
      if (time > latest) latest = time;
    }
    return latest;
  };

  const dist = path.join(ROOT, 'dist');
  if (!existsSync(dist)) {
    console.error('[desktop-e2e] dist/ not found; run: pnpm build');
    process.exit(1);
  }

  const binaryTime = statSync(binary).mtimeMs;
  const distTime = newest(dist);
  if (binaryTime < distTime) {
    console.error('[desktop-e2e] refusing to run: the binary is older than dist/');
    console.error(`[desktop-e2e]   binary ${new Date(binaryTime).toISOString()}`);
    console.error(`[desktop-e2e]   dist   ${new Date(distTime).toISOString()}`);
    console.error('[desktop-e2e] Rebuild with: pnpm tauri build --debug --no-bundle');
    process.exit(1);
  }
}

assertBinaryIsFresh();

const child = spawn(process.execPath, [wdio, 'run', config, ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    CARGO_HOME: cargoHome,
    RUSTUP_HOME: rustupHome,
    // Cargo writes several gigabytes of build output; keep it inside the project.
    CARGO_TARGET_DIR: path.join(TOOLS, 'target'),
    // The driver executable has to be findable by name, not just by absolute path.
    PATH: `${cargoBin}${path.delimiter}${process.env.PATH ?? ''}`,
    ...(existsSync(tauriDriver) ? { OPENMARK_TAURI_DRIVER: tauriDriver } : {}),
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[desktop-e2e] terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
