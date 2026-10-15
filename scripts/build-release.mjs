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

child.on('exit', async (code, signal) => {
  if (signal) {
    console.error(`[build-release] terminated by ${signal}`);
    process.exit(1);
  }
  if (code !== 0) process.exit(code ?? 1);

  /*
   * The portable profile produces only the executable — Tauri has no portable bundle target — so
   * the package is assembled around it here rather than by hand. Doing it in the build script is
   * what makes `pnpm desktop:build:portable` reproduce the same artefact every time; assembling
   * it manually once meant the README shipped in the zip drifted from the one in the repository.
   */
  if (portable) {
    try {
      await assemblePortable();
    } catch (error) {
      console.error('[build-release] could not assemble the portable package:', error);
      process.exit(1);
    }
  }
  process.exit(0);
});

const APP_NAME = 'OpenMark-0.1.0-portable';

/** Copies the executable and the versioned README into a folder and zips it. */
async function assemblePortable() {
  const { cp, mkdir, rm } = await import('node:fs/promises');
  const releaseDir = path.join(ROOT, 'src-tauri', 'target', 'release');
  const stage = path.join(releaseDir, 'portable', APP_NAME);
  const readme = path.join(ROOT, 'src-tauri', 'portable-README.txt');

  await rm(path.join(releaseDir, 'portable'), { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  await cp(path.join(releaseDir, 'openmark.exe'), path.join(stage, 'openmark.exe'));
  await cp(readme, path.join(stage, 'README.txt'));

  // Compress-Archive is present on every supported Windows and needs no dependency.
  const zip = path.join(releaseDir, 'portable', `${APP_NAME}.zip`);
  await new Promise((resolve, reject) => {
    const zipProcess = spawn(
      'powershell',
      ['-NoProfile', '-Command', `Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}' -Force`],
      { stdio: 'inherit' },
    );
    zipProcess.on('error', reject);
    zipProcess.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Compress-Archive exited ${code}`)),
    );
  });

  console.log(`[build-release] portable package: ${zip}`);
}
