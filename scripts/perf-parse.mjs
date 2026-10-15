#!/usr/bin/env node
/**
 * Parse performance harness.
 *
 *     node scripts/perf-parse.mjs
 *
 * Measures the synchronous half of the pipeline — the part that runs on every keystroke and
 * therefore decides whether a large document feels responsive — against the generated stress
 * corpus. Typesetting is deliberately excluded: it is lazy, bounded by what is on screen, and
 * dominated by MathJax rather than by anything this project controls.
 *
 * Run `node scripts/gen-corpus-stress.mjs` first; the harness reports which fixtures are
 * missing rather than failing, so it is safe to run on a fresh checkout.
 *
 * Figures are the median of several runs. A single run on a machine with other work in flight
 * is not evidence.
 */
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STRESS = path.join(ROOT, 'tests', 'corpus', 'stress');

const RUNS = 5;

/** The parser is TypeScript; load it through Vite's transform pipeline rather than tsc. */
async function loadParser() {
  const { createServer } = await import('vite');
  const server = await createServer({
    root: ROOT,
    logLevel: 'error',
    server: { middlewareMode: true },
    appType: 'custom',
  });
  const engine = await server.ssrLoadModule('/src/core/markdown/engine.ts');
  return { engine, close: () => server.close() };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

async function main() {
  const { engine, close } = await loadParser();
  const md = engine.createEngine();

  const names = [
    'huge-textbook.md',
    'math-dense.md',
    'many-small-blocks.md',
    'deep-nesting.md',
    'wide-tables.md',
  ];

  const present = [];
  for (const name of names) {
    const file = path.join(STRESS, name);
    if (existsSync(file)) present.push({ name, file });
  }

  if (present.length === 0) {
    console.log('No stress fixtures found. Run: node scripts/gen-corpus-stress.mjs');
    await close();
    return;
  }

  console.log(`\nParse benchmark — median of ${RUNS} runs, Node ${process.version}\n`);
  console.log(
    `${'fixture'.padEnd(24)} ${'size'.padStart(9)} ${'lines'.padStart(8)} ${'parse'.padStart(9)} ${'MB/s'.padStart(8)} ${'blocks'.padStart(7)} ${'math'.padStart(6)} ${'heap Δ'.padStart(9)}`,
  );
  console.log('-'.repeat(86));

  for (const { name, file } of present) {
    const source = await readFile(file, 'utf8');
    const bytes = (await stat(file)).size;

    // One warm run so JIT and the markdown-it instance caches are settled.
    engine.parseDocument(source, md);

    const times = [];
    let last = null;
    let retained = 0;
    for (let i = 0; i < RUNS; i++) {
      /*
       * Memory is measured without a collection in between.
       *
       * Collecting first and reading `heapUsed` afterwards reports the *previous* iteration's
       * garbage as this one's cost, which produces a large negative number and tells the
       * reader nothing. Settling the heap before the run and reading immediately after gives
       * the figure that matters: what this parse holds live.
       */
      globalThis.gc?.();
      const before = process.memoryUsage().heapUsed;
      const started = performance.now();
      last = engine.parseDocument(source, md);
      times.push(performance.now() - started);
      retained = process.memoryUsage().heapUsed - before;
    }
    last.heapDelta = retained;

    const ms = median(times);
    const throughput = bytes / 1048576 / (ms / 1000);
    const lines = last.stats.sourceLines;
    const heap = `${((last.heapDelta ?? 0) / 1048576).toFixed(1)} MB`;

    console.log(
      `${name.padEnd(24)} ${`${(bytes / 1048576).toFixed(2)} MB`.padStart(9)} ${String(lines).padStart(8)} ` +
        `${`${ms.toFixed(0)} ms`.padStart(9)} ${throughput.toFixed(1).padStart(8)} ${String(last.blocks.length).padStart(7)} ` +
        `${String(last.math.length).padStart(6)} ${heap.padStart(9)}`,
    );
  }

  console.log('\nNotes:');
  console.log('  - "parse" is the full synchronous pass: tokenise, resolve positions, build blocks, sanitise, render HTML.');
  console.log('  - A keystroke in instant mode costs one parse of the whole document, so this is the per-edit budget.');
  console.log('  - Typesetting, diagram rendering and highlighting are excluded; they run lazily off the viewport.');
  console.log('  - "heap Δ" is heap growth across the parse, including the token stream, which is the largest');
  console.log('    transient allocation. It is reclaimed by the next collection; it is not retained by the document.');

  await close();
}

main().catch((error) => {
  console.error('[perf-parse] failed:', error);
  process.exit(1);
});
