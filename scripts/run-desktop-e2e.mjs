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
import { existsSync } from 'node:fs';
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
