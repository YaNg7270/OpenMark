#!/usr/bin/env node
/**
 * Deterministic generator for OpenMark's *stress* corpus.
 *
 * ## Why a generator instead of committed files
 *
 * The stress fixtures are 0.2–3 MB each — roughly 7 MB of text that would bloat every
 * clone, every diff and every review while carrying zero information a reader could
 * learn from. They are pure volume with a precisely known shape, so we generate them on
 * demand and keep `tests/corpus/stress/` out of git (see `.gitignore`).
 *
 * ## Determinism
 *
 * Generation uses a seeded `mulberry32` PRNG and index-derived content — never
 * `Math.random()` or the clock. Running the generator twice produces byte-identical
 * files, which is what makes the `contains` expectations in
 * `tests/corpus/manifest.json` (and any future byte-size assertion) meaningful.
 *
 * ## Usage
 *
 *     node scripts/gen-corpus-stress.mjs [--out <dir>] [--quiet]
 *
 * `--out` defaults to `tests/corpus/stress/`. The generator prints one JSON summary
 * object describing every file it wrote (path, bytes, lines, and the structural counts
 * the manifest declares under `contains`).
 */

import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_OUT = 'tests/corpus/stress';

/** Exactly the `contains` counters declared in tests/corpus/manifest.json → stress[]. */
export const STRESS_CONTAINS = {
  'huge-textbook.md': { headings: 400, math: 300, tables: 100 },
  'math-dense.md': { math: 2000 },
  'deep-nesting.md': { listDepth: 30, blockquoteDepth: 30 },
  'many-small-blocks.md': { paragraphs: 20000 },
  'wide-tables.md': { columns: 40, rows: 2000 },
};

// ---------------------------------------------------------------------------- rng ---

/** mulberry32 — tiny, fast, fully deterministic. */
function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------------------ corpus ---

const WORDS = (
  'allocator arithmetic assertion atomic barrier baseline branch buffer cache candidate ' +
  'channel checkpoint closure cluster coherence collector commit compiler concurrency ' +
  'consistency constant constraint container context contract convergence coordinate ' +
  'coroutine cursor deadline decoder delta dependency descriptor diagnostic dispatch ' +
  'domain encoder entropy envelope epoch eviction exponent fence fixture fragment ' +
  'generator gradient granularity graph handle heuristic histogram identity index ' +
  'inference invariant iteration kernel latency lattice ledger lemma lifetime linkage ' +
  'locality manifest margin matrix memoization memory merge metadata method metric ' +
  'namespace nesting node normalization offset operand operator ordinal overflow ' +
  'partition pipeline placeholder pointer polynomial precision predicate prefix ' +
  'priority projection protocol quantum queue quorum radix reducer redundancy region ' +
  'registry relaxation replica resolution resource retention rotation runtime scheduler ' +
  'schema segment selector sequence serialization shard signature snapshot sparse ' +
  'spectrum stability stack staging stride structure subset subtree suffix supervisor ' +
  'symmetry syntax tablet threshold throughput token topology trace trajectory transform ' +
  'transient traversal tuple uniformity validator variance vector velocity verification ' +
  'viewport volatility watermark window workspace wrapper yield zero'
)
  .split(/\s+/)
  .filter(Boolean);

const TOPICS = [
  'Scheduling Under Contention',
  'Cache Coherence and False Sharing',
  'Incremental Garbage Collection',
  'Deterministic Replay of Concurrency Bugs',
  'Adaptive Query Planning',
  'Vectorised Execution Engines',
  'Approximate Membership Structures',
  'Consensus Without a Clock',
  'Tail Latency in Fan-Out Services',
  'Speculative Decoding Pipelines',
  'Numerical Stability of Summations',
  'Sparse Matrix Reordering',
  'Interval Arithmetic and Rounding',
  'Graph Partitioning Heuristics',
  'Register Allocation by Graph Colouring',
  'Type Inference for Row Polymorphism',
  'Parser Recovery Strategies',
  'Layout Engines and Line Breaking',
  'Incremental Build Graphs',
  'Content-Addressed Storage',
];

function word(rng) {
  return WORDS[Math.floor(rng() * WORDS.length)];
}

/** A deterministic sentence of `n` words. */
function sentence(rng, n) {
  const words = [];
  for (let i = 0; i < n; i++) words.push(word(rng));
  const first = words[0];
  words[0] = first[0].toUpperCase() + first.slice(1);
  return `${words.join(' ')}.`;
}

function paragraph(rng, sentences) {
  const out = [];
  for (let i = 0; i < sentences; i++) out.push(sentence(rng, 8 + Math.floor(rng() * 9)));
  return out.join(' ');
}

const MACROS = [
  (i) => `\\int_{0}^{${i}} x^{2}\\,dx = \\frac{${i}^{3}}{3}`,
  (i) => `\\sum_{k=1}^{${i}} \\frac{1}{k^{2}} \\le \\frac{\\pi^{2}}{6}`,
  (i) => `\\lim_{n \\to \\infty} \\left(1 + \\frac{${i}}{n}\\right)^{n} = e^{${i}}`,
  (i) => `\\frac{\\partial^{2} u}{\\partial x^{2}} + \\frac{\\partial^{2} u}{\\partial y^{2}} = ${i}`,
  (i) => `\\begin{pmatrix} ${i} & 1 \\\\ 0 & ${i} \\end{pmatrix}^{2} = ${i * i} I`,
  (i) => `\\prod_{j=1}^{${i}} \\left(1 - \\frac{1}{j + 1}\\right) = \\frac{1}{${i} + 1}`,
  (i) => `\\oint_{C} \\mathbf{F} \\cdot d\\mathbf{r} = ${i} \\pi`,
  (i) => `\\sqrt[3]{${i}^{3} + 1} \\approx ${i} + \\frac{1}{3${i}^{2}}`,
];

function formula(i) {
  return MACROS[i % MACROS.length](i);
}

// ------------------------------------------------------------------- generators ---

function hugeTextbook() {
  const rng = makeRng(0x0f1e2d3c);
  const out = [];
  out.push('# Stress Corpus — Huge Textbook', '');
  out.push(
    'A mechanically generated textbook used to measure parse time, outline construction',
    'and memory pressure on a document with a deliberately flat but very wide structure.',
    '',
  );
  const sections = 399; // + 1 H1 == 400 headings
  const formulas = 300;
  const tables = 100;
  let fi = 0;
  let ti = 0;
  for (let s = 1; s <= sections; s++) {
    const topic = TOPICS[s % TOPICS.length];
    out.push(`## ${s}. ${topic}`, '');
    for (let p = 0; p < 8; p++) out.push(paragraph(rng, 8), '');
    if (fi < formulas) {
      out.push('$$', formula(fi + 1), '$$', '');
      fi++;
    }
    if (ti < tables) {
      out.push('| Metric | Value | Unit |', '| :--- | ---: | :---: |');
      for (let r = 0; r < 3; r++) {
        out.push(`| ${word(rng)}-${r} | ${Math.floor(rng() * 10000)} | ${word(rng)} |`);
      }
      out.push('');
      ti++;
    }
    out.push(paragraph(rng, 8), '');
  }
  return { text: out.join('\n') + '\n', contains: STRESS_CONTAINS['huge-textbook.md'] };
}

function mathDense() {
  const rng = makeRng(0x77113399);
  const out = [];
  out.push('# Stress Corpus — Math Dense', '');
  const count = 2000;
  for (let i = 1; i <= count; i++) {
    out.push('$$', formula(i), '$$', '');
    out.push(paragraph(rng, 2), '');
  }
  return { text: out.join('\n') + '\n', contains: STRESS_CONTAINS['math-dense.md'] };
}

function deepNesting() {
  const rng = makeRng(0x2468ace0);
  const out = [];
  out.push('# Stress Corpus — Deep Nesting', '');
  const DEPTH = 30;
  const LISTS = 22;
  for (let l = 0; l < LISTS; l++) {
    out.push(`## Nested list ${l + 1}`, '');
    for (let d = 1; d <= DEPTH; d++) {
      const marker = d % 3 === 0 ? `${d}.` : '-';
      out.push(`${'  '.repeat(d - 1)}${marker} ${paragraph(rng, 2)}`);
    }
    out.push('');
  }
  const QUOTES = 8;
  for (let q = 0; q < QUOTES; q++) {
    out.push(`## Nested quote ${q + 1}`, '');
    for (let d = 1; d <= DEPTH; d++) {
      out.push(`${'> '.repeat(d)}${paragraph(rng, 1)}`);
    }
    out.push('');
  }
  return { text: out.join('\n') + '\n', contains: STRESS_CONTAINS['deep-nesting.md'] };
}

function manySmallBlocks() {
  const out = [];
  out.push('# Stress Corpus — Many Small Blocks', '');
  const count = 20000;
  for (let i = 1; i <= count; i++) {
    // Deliberately terse: 20 000 blocks of roughly 60 bytes is what stresses the
    // block tokenizer, not the prose.
    out.push(`Paragraph ${String(i).padStart(5, '0')}: a short block of text for the reader.`, '');
  }
  return { text: out.join('\n') + '\n', contains: STRESS_CONTAINS['many-small-blocks.md'] };
}

function wideTables() {
  const rng = makeRng(0x0badc0de);
  const COLUMNS = 40;
  const ROWS = 2000;
  const out = [];
  out.push('# Stress Corpus — Wide Tables', '');
  const header = [];
  for (let c = 1; c <= COLUMNS; c++) header.push(`column_${c}`);
  out.push(`| row | ${header.join(' | ')} |`);
  const sep = [];
  for (let c = 1; c <= COLUMNS; c++) sep.push(c % 2 === 0 ? '---:' : ':---');
  out.push(`| --- | ${sep.join(' | ')} |`);
  for (let r = 1; r <= ROWS; r++) {
    const cells = [];
    for (let c = 1; c <= COLUMNS; c++) cells.push(String(Math.floor(rng() * 100000)));
    out.push(`| r${r} | ${cells.join(' | ')} |`);
  }
  out.push('');
  return { text: out.join('\n') + '\n', contains: STRESS_CONTAINS['wide-tables.md'] };
}

export const GENERATORS = {
  'huge-textbook.md': hugeTextbook,
  'math-dense.md': mathDense,
  'deep-nesting.md': deepNesting,
  'many-small-blocks.md': manySmallBlocks,
  'wide-tables.md': wideTables,
};

// --------------------------------------------------------------------------- cli ---

function parseArgs(argv) {
  const opts = { out: DEFAULT_OUT, quiet: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out') {
      const value = argv[++i];
      if (!value) throw new Error('--out requires a directory argument');
      opts.out = value;
    } else if (arg.startsWith('--out=')) {
      opts.out = arg.slice('--out='.length);
    } else if (arg === '--quiet' || arg === '-q') {
      opts.quiet = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else {
      throw new Error(`unrecognised argument: ${arg}`);
    }
  }
  return opts;
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(2);
  }
  if (opts.help) {
    process.stdout.write(
      'Usage: node scripts/gen-corpus-stress.mjs [--out <dir>] [--quiet]\n\n' +
        `Writes the deterministic stress fixtures to <dir> (default: ${DEFAULT_OUT}).\n`,
    );
    return;
  }

  const outDir = resolve(opts.out);
  mkdirSync(outDir, { recursive: true });

  const summary = [];
  for (const [name, generate] of Object.entries(GENERATORS)) {
    const { text: raw, contains } = generate();
    // UTF-8, LF, exactly one trailing newline: the same rules the rest of the corpus obeys.
    const text = raw.replace(/\r\n/g, '\n').replace(/\n+$/, '\n');
    const target = join(outDir, name);
    writeFileSync(target, Buffer.from(text, 'utf8'));
    const bytes = statSync(target).size;
    const lines = text.split('\n').length - 1;
    summary.push({ file: name, bytes, lines, contains });
  }

  if (!opts.quiet) {
    process.stdout.write(JSON.stringify({ out: opts.out, files: summary }, null, 2) + '\n');
  }
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) main();
