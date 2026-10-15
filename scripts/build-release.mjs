#!/usr/bin/env node
/**
 * Builds the Windows release and its installers, with the project-local Rust toolchain.
 *
 *     node scripts/build-release.mjs            # installers + app bundle
 *     node scripts/build-release.mjs --portable # the portable profile instead
 *
 * ## Why this wrapper exists
 *
 * The Tauri CLI shells out to `cargo`, and this repository deliberately keeps Rust *inside*
 * the project (`.tools/cargo`) so that nothing global on the machine is modified — which means
 * `cargo` is not on `PATH` and the CLI fails with "program not found".
 *
 * The toolchain is reachable through a space-free junction (`C:\omkth` -> `<repo>\.tools`),
 * because this shell cannot resolve executables whose PATH entry contains a space and the
 * repository path contains one. Recreate the junction with:
 *
 *   cmd /c mklink /J C:\omkth "<repo>\.tools"
 *
 * The environment is passed to the child explicitly rather than inherited, so this works
 * regardless of how it is invoked.
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
  return existsSync(viaJunction) ? viaJunction : path.join(TOOLS, realName);
}

const cargoHome = toolRoot('cargo', 'cargo');
const rustupHome = toolRoot('rustup', 'rustup');
const cargoBin = path.join(cargoHome, 'bin');

if (!existsSync(cargoBin)) {
  console.error(`[build-release] cargo not found at ${cargoBin}`);
  console.error('[build-release] Run the bootstrap steps in SESSION_HANDOFF.md first.');
  process.exit(1);
}

/** The installed pnpm shim, needed by Tauri's `beforeBuildCommand`. */
const npmBin = path.join(process.env['APPDATA'] ?? '', 'npm');

const tauri = path.join(ROOT, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
if (!existsSync(tauri)) {
  console.error(`[build-release] Tauri CLI not found at ${tauri}. Run \`pnpm install\` first.`);
  process.exit(1);
}

const portable = process.argv.includes('--portable');
/*
 * `--no-bundle` for the portable profile: Tauri has no portable bundle target, so the
 * executable is produced and the portable directory is assembled around it. See
 * `src-tauri/tauri.portable.conf.json` and docs/KNOWN_ISSUES.md P3-5.
 */
const args = portable
  ? ['build', '--no-bundle', '-c', path.join('src-tauri', 'tauri.portable.conf.json')]
  : ['build'];

const child = spawn(process.execPath, [tauri, ...args], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    CARGO_HOME: cargoHome,
    RUSTUP_HOME: rustupHome,
    // Cargo must be findable by name: the CLI looks it up, it does not derive the path.
    PATH: `${cargoBin}${path.delimiter}${npmBin}${path.delimiter}${process.env['PATH'] ?? ''}`,
    // The bundler downloads NSIS and WiX on first use; keep them inside the project.
    ...(process.env['TAURI_BUNDLER_TOOLS_GITHUB_MIRROR']
      ? { TAURI_BUNDLER_TOOLS_GITHUB_MIRROR: process.env['TAURI_BUNDLER_TOOLS_GITHUB_MIRROR'] }
      : {}),
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[build-release] terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
