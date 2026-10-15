#!/usr/bin/env node
/**
 * Vendors MathJax 4 and its font data into `public/` so the renderer runs fully offline.
 *
 * ## Why a copy step instead of an import
 *
 * MathJax's browser distribution is a classic script that boots a component *loader*. The
 * loader resolves `[tex]/mhchem` and the font files at runtime from URLs it builds itself,
 * which a bundler cannot see. Copying the trees verbatim is the supported deployment shape
 * and keeps the app network-free.
 *
 * ## The three trees, and why the directory names are load-bearing
 *
 * MathJax builds font URLs as `<fonts>/<fontName>/svg.js`, where `<fontName>` is
 * `mathjax-newcm-font` (all maths glyphs) or `mathjax-mhchem-font-extension` (the extra
 * upright glyphs `\ce` needs). Renaming either directory breaks chemistry silently, with a
 * CDN fallback that surfaces only as an equation full of missing glyphs.
 *
 *  - `node_modules/mathjax`                   → `public/mathjax/v4`
 *  - `@mathjax/mathjax-newcm-font`            → `public/mathjax-fonts/mathjax-newcm-font`
 *  - `@mathjax/mathjax-mhchem-font-extension` → `public/mathjax-fonts/mathjax-mhchem-font-extension`
 *
 * ## Pruning
 *
 * The upstream trees carry four output formats (`cjs`, `mjs`, `chtml`, `svg`) plus every
 * component bundle. We use SVG output in a browser, so only the SVG payload is copied:
 * that takes the font cost from 47 MB to about 10 MB.
 *
 * ## Windows/pnpm details this script exists to handle
 *
 * `node_modules/<pkg>` is a *symlink* into the pnpm store, and creating symlinks requires
 * Developer Mode or elevation. `fs.cp({recursive:true})` fails on the symlink itself, so
 * the real path is resolved and the tree is walked manually.
 *
 * This file is plain JavaScript on purpose: it runs before the build, so it must not
 * depend on a TypeScript toolchain being wired up.
 */
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NODE_MODULES = path.join(ROOT, 'node_modules');

/** Node-only entry points and docs: never served to the webview. */
const EXCLUDE_FILES = {
  'node-main.js': true,
  'node-main.mjs': true,
  'node-main.cjs': true,
  'node-main-setup.cjs': true,
  'require.mjs': true,
  'CONTRIBUTING.md': true,
  'README.md': true,
  '.vendor-stamp': true,
  'tsconfig.json': true,
};

/**
 * Component bundles we never load. Rendering uses SVG output only, so the CHTML bundles,
 * the `-nofont` variants and the standalone MathML bundles are dead weight.
 */
const EXCLUDE_MATHJAX_BUNDLES = {
  'mml-chtml.js': true,
  'mml-chtml-nofont.js': true,
  'mml-svg.js': true,
  'mml-svg-nofont.js': true,
  'tex-chtml.js': true,
  'tex-chtml-nofont.js': true,
  'tex-mml-chtml.js': true,
  'tex-mml-chtml-nofont.js': true,
  'tex-svg-nofont.js': true,
  'tex-mml-svg-nofont.js': true,
};

/**
 * The only entries taken from a font package.
 *
 * The loader requests `<fonts>/<fontName>/svg.js`, and that file pulls the per-Unicode-range
 * glyph tables out of `svg/dynamic/` on demand. `def` is TypeScript metadata: tiny, and kept
 * so the copied tree is a faithful subset rather than a mysterious handful of files.
 * Everything else (`cjs`, `mjs`, `chtml`, `examples`) is another output format we never use.
 */
const FONT_ROOT_ALLOWLIST = {
  'svg.js': true,
  svg: true,
  def: true,
};

/**
 * Recursively copies `from` to `to`, calling `skip` only for entries directly inside
 * `from`. Subtrees that survive that test are copied whole — a filter applied at every
 * level would prune the nested payload we actually want.
 */
async function copyTree(from, to, skip) {
  await mkdir(to, { recursive: true });
  let files = 0;
  let bytes = 0;

  for (const entry of await readdir(from, { withFileTypes: true })) {
    if (skip(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);

    if (entry.isSymbolicLink() || entry.isDirectory()) {
      const real = entry.isSymbolicLink() ? await realpath(src) : src;
      const nested = await copyTree(real, dst, () => false);
      files += nested.files;
      bytes += nested.bytes;
      continue;
    }
    await writeFile(dst, await readFile(src));
    files++;
    bytes += (await stat(dst)).size;
  }
  return { files, bytes };
}

async function packageVersion(dir) {
  const pkg = JSON.parse(await readFile(path.join(dir, 'package.json'), 'utf8'));
  return pkg.version;
}

async function vendorMathjax() {
  const src = await realpath(path.join(NODE_MODULES, 'mathjax'));
  const dest = path.join(ROOT, 'public', 'mathjax', 'v4');
  return copyTree(src, dest, (name) => EXCLUDE_FILES[name] === true || EXCLUDE_MATHJAX_BUNDLES[name] === true);
}

async function vendorFont(packageName) {
  const src = await realpath(path.join(NODE_MODULES, '@mathjax', packageName));
  const dest = path.join(ROOT, 'public', 'mathjax-fonts', packageName);
  return copyTree(
    src,
    dest,
    (name) => EXCLUDE_FILES[name] === true || !(FONT_ROOT_ALLOWLIST[name] === true || name === 'package.json' || name === 'LICENSE'),
  );
}

async function main() {
  if (!existsSync(path.join(NODE_MODULES, 'mathjax'))) {
    console.error('[prepare-mathjax] mathjax is not installed. Run `pnpm install` first.');
    process.exit(1);
  }

  const stampPath = path.join(ROOT, 'public', 'mathjax', 'v4', '.vendor-stamp');
  const stamp = [
    `mathjax@${await packageVersion(await realpath(path.join(NODE_MODULES, 'mathjax')))}`,
    `newcm@${await packageVersion(await realpath(path.join(NODE_MODULES, '@mathjax', 'mathjax-newcm-font')))}`,
    `mhchem@${await packageVersion(await realpath(path.join(NODE_MODULES, '@mathjax', 'mathjax-mhchem-font-extension')))}`,
  ].join(' ');

  if (existsSync(stampPath) && (await readFile(stampPath, 'utf8')) === stamp) {
    console.log(`[prepare-mathjax] up to date (${stamp})`);
    return;
  }

  await rm(path.join(ROOT, 'public', 'mathjax'), { recursive: true, force: true, maxRetries: 3 });
  await rm(path.join(ROOT, 'public', 'mathjax-fonts'), { recursive: true, force: true, maxRetries: 3 });

  const core = await vendorMathjax();
  const newcm = await vendorFont('mathjax-newcm-font');
  const mhchem = await vendorFont('mathjax-mhchem-font-extension');

  await writeFile(stampPath, stamp);

  const mb = (bytes) => (bytes / 1048576).toFixed(1);
  console.log(`[prepare-mathjax] vendored ${stamp}`);
  console.log(`  public/mathjax/v4                              ${core.files} files, ${mb(core.bytes)} MB`);
  console.log(`  public/mathjax-fonts/mathjax-newcm-font         ${newcm.files} files, ${mb(newcm.bytes)} MB`);
  console.log(`  public/mathjax-fonts/mathjax-mhchem-font-ext    ${mhchem.files} files, ${mb(mhchem.bytes)} MB`);
  console.log(`  total ${mb(core.bytes + newcm.bytes + mhchem.bytes)} MB`);
}

main().catch((err) => {
  console.error('[prepare-mathjax] failed:', err);
  process.exit(1);
});
