/**
 * Shared loading helpers for the corpus-driven suites.
 *
 * `tests/corpus/manifest.json` is the single source of truth for what each fixture
 * contains and which diagnostics it is designed to produce. These helpers only locate the
 * fixture files and read their bytes; the actual counting stays in the test files so the
 * derivation from the *parse result* is explicit at every assertion.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `tests/corpus` — resolved from this file so the suites work from any cwd. */
export const CORPUS_DIR = fileURLToPath(new URL('../../corpus', import.meta.url));

/** The seven per-fixture counters declared in the manifest. */
export interface ExpectCounts {
  headings: number;
  tables: number;
  codeBlocks: number;
  math: number;
  images: number;
  footnotes: number;
  taskLists: number;
}

/** One entry of `manifest.markdown`. */
export interface FixtureEntry {
  file: string;
  title: string;
  categories: string[];
  language: string;
  expect: ExpectCounts;
  diagnostics: string[];
  notes: string;
}

interface Manifest {
  markdown: FixtureEntry[];
}

export interface Fixture {
  entry: FixtureEntry;
  /** Absolute path on disk. */
  path: string;
  /** Raw committed bytes. */
  bytes: Buffer;
  /** UTF-8 text with any BOM stripped (the corpus forbids a BOM, but be tolerant). */
  source: string;
}

const manifest = JSON.parse(
  readFileSync(join(CORPUS_DIR, 'manifest.json'), 'utf8'),
) as Manifest;

/** Every committed markdown fixture, in manifest order. */
export const fixtures: Fixture[] = manifest.markdown.map((entry) => {
  const path = join(CORPUS_DIR, entry.file);
  const bytes = readFileSync(path);
  let source = bytes.toString('utf8');
  if (source.charCodeAt(0) === 0xfeff) source = source.slice(1);
  return { entry, path, bytes, source };
});
