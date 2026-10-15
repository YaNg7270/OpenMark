#!/usr/bin/env node
/**
 * `pnpm corpus:verify` — validates `tests/corpus/manifest.json` against the bytes on
 * disk and reports the corpus counts.
 *
 * What it checks, and why each check exists:
 *
 * 1. **Every listed file exists and is well formed** — UTF-8 (no BOM), LF line endings,
 *    exactly one trailing newline. A fixture that quietly picked up CRLF or lost its
 *    final newline breaks snapshot tests in ways that are painful to diagnose.
 * 2. **No unlisted fixtures** — `tests/corpus/markdown/*.md` must be exactly the set the
 *    manifest lists, so a test can never silently iterate over a stale document.
 * 3. **`expect` counters match reality** — recomputed from the fixture with the scanner
 *    in `scripts/lib/corpus-scan.mjs` (see the rule table in `tests/corpus/README.md`).
 *    Editing a fixture without updating its expectation fails here.
 * 4. **Metadata is legal** — `language`, `categories`, `diagnostics` (must be real
 *    `DiagnosticCode` values from `src/core/markdown/types.ts`), `notes`.
 * 5. **The math corpus is internally consistent** — `math/formulas.json` equals
 *    `manifest.math`, ids are unique, every case uses a real `MathDelimiter`, every
 *    `expect: "error"` case explains itself in `reason`, and the per-category splits
 *    partition the full set.
 * 6. **The bars are met** — ≥110 markdown documents, ≥200 math cases, ≥25 error cases,
 *    ≥25 pure-Chinese / ≥25 pure-English / ≥20 mixed documents, and every diagnostic
 *    code and category named in the fixtures is actually used somewhere.
 * 7. **Stress fixtures are described, not committed** — `tests/corpus/stress/` is
 *    git-ignored, the manifest names the generator, and when the files happen to be
 *    present (after running the generator) their `contains` counters are re-scanned.
 *
 * Usage:
 *     node scripts/verify-corpus.mjs                 # validate + report
 *     node scripts/verify-corpus.mjs --quiet         # only print on failure
 *     node scripts/verify-corpus.mjs --print-counts <file.md>…   # scanner output for new fixtures
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECT_KEYS, scanMarkdown, inspectFile } from './lib/corpus-scan.mjs';
import { STRESS_CONTAINS } from './gen-corpus-stress.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CORPUS = join(ROOT, 'tests/corpus');
const MANIFEST = join(CORPUS, 'manifest.json');
const MARKDOWN_DIR = join(CORPUS, 'markdown');
const MATH_DIR = join(CORPUS, 'math');
const STRESS_DIR = join(CORPUS, 'stress');

/**
 * The set of diagnostic codes, read from the type that defines them.
 *
 * Deriving this from `src/core/markdown/types.ts` rather than repeating the union here means
 * the two cannot drift: adding a code to the type immediately makes it valid in the manifest,
 * and removing one makes an existing manifest entry fail loudly instead of silently passing.
 */
const DIAGNOSTIC_CODES = (() => {
  const typesPath = join(ROOT, 'src', 'core', 'markdown', 'types.ts');
  const source = readFileSync(typesPath, 'utf8');
  const union = /export type DiagnosticCode =([\s\S]*?);/.exec(source);
  if (!union) {
    throw new Error(`Could not locate the DiagnosticCode union in ${typesPath}`);
  }
  const codes = new Set([...union[1].matchAll(/'([a-z0-9-]+)'/g)].map((match) => match[1]));
  if (codes.size === 0) {
    throw new Error(`The DiagnosticCode union in ${typesPath} yielded no members`);
  }
  return codes;
})();

const DELIMITERS = new Set(['dollar', 'dollar-block', 'paren-inline', 'paren-block', 'latex-env', 'math-fence']);
const LANGUAGES = new Set(['zh', 'en', 'mixed']);
const EXPECTATIONS = new Set(['render', 'error']);

/** Minimum corpus bars, asserted every run so the corpus cannot silently shrink. */
const BARS = {
  markdown: 110,
  math: 200,
  mathErrors: 25,
  pureChinese: 25,
  pureEnglish: 25,
  mixed: 20,
};

const problems = [];
const fail = (message) => problems.push(message);
const rel = (p) => relative(ROOT, p).split('\\').join('/');

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readJson(path) {
  const raw = readFileSync(path, 'utf8');
  try {
    return { value: JSON.parse(raw), raw };
  } catch (err) {
    fail(`${rel(path)} is not valid JSON: ${err.message}`);
    return { value: null, raw };
  }
}

// ------------------------------------------------------------------- print-counts ---

function printCounts(files) {
  const out = {};
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const { counts, lines, bytes } = scanMarkdown(source);
    out[rel(file)] = { ...counts, lines, bytes };
  }
  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
}

// ------------------------------------------------------------------- markdown pass ---

function checkMarkdown(manifest) {
  const entries = manifest.markdown;
  if (!Array.isArray(entries)) {
    fail('manifest.markdown must be an array');
    return { docs: [], languages: { zh: 0, en: 0, mixed: 0 }, fileCount: 0 };
  }

  const seen = new Set();
  const docs = [];
  const languages = { zh: 0, en: 0, mixed: 0 };

  for (const [index, entry] of entries.entries()) {
    const where = `manifest.markdown[${index}]`;
    if (!isPlainObject(entry)) {
      fail(`${where} must be an object`);
      continue;
    }
    if (typeof entry.file !== 'string' || !entry.file.startsWith('markdown/')) {
      fail(`${where}.file must be a path beginning with "markdown/" (got ${JSON.stringify(entry.file)})`);
      continue;
    }
    if (seen.has(entry.file)) fail(`${where}.file is listed twice: ${entry.file}`);
    seen.add(entry.file);

    if (typeof entry.title !== 'string' || entry.title.trim() === '') fail(`${entry.file}: title must be a non-empty string`);
    if (!LANGUAGES.has(entry.language)) fail(`${entry.file}: language must be one of zh|en|mixed (got ${JSON.stringify(entry.language)})`);
    else languages[entry.language]++;
    if (!Array.isArray(entry.categories) || entry.categories.length === 0) fail(`${entry.file}: categories must be a non-empty array`);
    if (typeof entry.notes !== 'string' || entry.notes.trim() === '') fail(`${entry.file}: notes must be a non-empty string (explain what the fixture proves)`);
    if (entry.diagnostics !== undefined) {
      if (!Array.isArray(entry.diagnostics)) fail(`${entry.file}: diagnostics must be an array`);
      else {
        for (const code of entry.diagnostics) {
          if (!DIAGNOSTIC_CODES.has(code)) fail(`${entry.file}: unknown diagnostic code ${JSON.stringify(code)}`);
        }
      }
    }

    const abs = join(CORPUS, entry.file);
    if (!existsSync(abs)) {
      fail(`${entry.file}: listed in the manifest but missing on disk`);
      continue;
    }
    const source = readFileSync(abs, 'utf8');
    const meta = inspectFile(source);

    if (meta.hasBom) fail(`${entry.file}: starts with a UTF-8 BOM`);
    if (meta.hasCrlf) fail(`${entry.file}: contains CRLF line endings (must be LF)`);
    if (meta.hasLoneCr) fail(`${entry.file}: contains a lone CR`);
    if (!meta.endsWithNewline) fail(`${entry.file}: must end with a newline`);
    else if (!meta.endsWithExactlyOneNewline) fail(`${entry.file}: must end with exactly one trailing newline`);

    const { counts, lines, bytes } = scanMarkdown(source);
    const expect = entry.expect;
    if (!isPlainObject(expect)) {
      fail(`${entry.file}: expect must be an object`);
    } else {
      for (const key of Object.keys(expect)) {
        if (!EXPECT_KEYS.includes(key)) fail(`${entry.file}: unexpected expect key ${JSON.stringify(key)}`);
      }
      for (const key of EXPECT_KEYS) {
        const declared = expect[key];
        if (typeof declared !== 'number' || !Number.isInteger(declared) || declared < 0) {
          fail(`${entry.file}: expect.${key} must be a non-negative integer (got ${JSON.stringify(declared)})`);
          continue;
        }
        if (declared !== counts[key]) {
          fail(`${entry.file}: expect.${key} is ${declared} but the fixture contains ${counts[key]}`);
        }
      }
    }
    docs.push({ ...entry, counts, lines, bytes });
  }

  // Every .md on disk must be listed.
  if (existsSync(MARKDOWN_DIR)) {
    for (const name of readdirSync(MARKDOWN_DIR)) {
      if (!name.endsWith('.md')) continue;
      const key = `markdown/${name}`;
      if (!seen.has(key)) fail(`markdown/${name} exists on disk but is not listed in the manifest`);
    }
  } else {
    fail('tests/corpus/markdown/ does not exist');
  }

  return { docs, languages, fileCount: seen.size };
}

// ----------------------------------------------------------------------- math pass ---

function checkMath(manifest) {
  const formulasPath = join(MATH_DIR, 'formulas.json');
  const categories = new Map();
  let errorCases = 0;

  if (!existsSync(formulasPath)) {
    fail('tests/corpus/math/formulas.json is missing');
    return { cases: [], errorCases, categories, mhchem: 0 };
  }
  const { value: formulas } = readJson(formulasPath);
  if (!Array.isArray(formulas)) {
    fail('math/formulas.json must be an array of cases');
    return { cases: [], errorCases, categories, mhchem: 0 };
  }

  const ids = new Set();
  for (const [index, c] of formulas.entries()) {
    const where = `formulas.json[${index}]`;
    if (!isPlainObject(c)) {
      fail(`${where} must be an object`);
      continue;
    }
    for (const key of ['id', 'tex', 'display', 'delimiter', 'packages', 'expect', 'reason', 'category']) {
      if (!(key in c)) fail(`${where} is missing "${key}"`);
    }
    if (typeof c.id !== 'string' || !/^m\d{3,}$/.test(c.id)) fail(`${where}.id must look like "m001" (got ${JSON.stringify(c.id)})`);
    else if (ids.has(c.id)) fail(`${where}.id is duplicated: ${c.id}`);
    else ids.add(c.id);
    if (typeof c.tex !== 'string' || c.tex === '') fail(`${c.id ?? where}: tex must be a non-empty string`);
    if (typeof c.display !== 'boolean') fail(`${c.id}: display must be a boolean`);
    if (!DELIMITERS.has(c.delimiter)) fail(`${c.id}: unknown delimiter ${JSON.stringify(c.delimiter)}`);
    if (!Array.isArray(c.packages)) fail(`${c.id}: packages must be an array`);
    if (!EXPECTATIONS.has(c.expect)) fail(`${c.id}: expect must be "render" or "error"`);
    if (typeof c.category !== 'string' || c.category === '') fail(`${c.id}: category must be a non-empty string`);
    if (c.expect === 'error') {
      errorCases++;
      if (typeof c.reason !== 'string' || c.reason.trim() === '') fail(`${c.id}: an error case must explain itself in "reason"`);
    } else if (c.reason !== null) {
      fail(`${c.id}: reason must be null for cases that are expected to render`);
    }
    categories.set(c.category, (categories.get(c.category) ?? 0) + 1);
  }

  // manifest.math must be the same set of cases.
  if (!Array.isArray(manifest.math)) {
    fail('manifest.math must be an array of cases');
  } else if (JSON.stringify(manifest.math) !== JSON.stringify(formulas)) {
    fail('manifest.math does not match math/formulas.json (the manifest must carry the same cases verbatim)');
  }

  // Per-category splits must partition formulas.json exactly.
  const splitFiles = existsSync(MATH_DIR)
    ? readdirSync(MATH_DIR).filter((n) => n.endsWith('.json') && n !== 'formulas.json')
    : [];
  const splitIds = new Map();
  for (const name of splitFiles) {
    const { value } = readJson(join(MATH_DIR, name));
    if (!Array.isArray(value)) {
      fail(`math/${name} must be an array of cases`);
      continue;
    }
    for (const c of value) {
      if (!isPlainObject(c) || typeof c.id !== 'string') {
        fail(`math/${name}: every case needs an id`);
        continue;
      }
      const expected = name.replace(/\.json$/, '');
      if (c.category !== expected) fail(`math/${name}: case ${c.id} has category ${JSON.stringify(c.category)}`);
      const previous = splitIds.get(c.id);
      if (previous) fail(`case ${c.id} appears in both math/${previous} and math/${name}`);
      splitIds.set(c.id, name);
    }
  }
  for (const c of formulas) {
    if (isPlainObject(c) && typeof c.id === 'string' && !splitIds.has(c.id)) {
      fail(`case ${c.id} is missing from the per-category splits in math/`);
    }
  }
  const mhchem = formulas.filter((c) => Array.isArray(c.packages) && c.packages.includes('mhchem')).length;
  return { cases: formulas, errorCases, categories, mhchem, splits: splitFiles.length };
}

// --------------------------------------------------------------------- stress pass ---

function checkStress(manifest) {
  const entries = manifest.stress;
  if (!Array.isArray(entries) || entries.length === 0) {
    fail('manifest.stress must be a non-empty array');
    return [];
  }
  const results = [];
  const listed = new Set();
  for (const entry of entries) {
    if (!isPlainObject(entry) || typeof entry.file !== 'string') {
      fail('every manifest.stress entry needs a file');
      continue;
    }
    listed.add(entry.file.replace(/^stress\//, ''));
    if (typeof entry.generator !== 'string' || !existsSync(join(ROOT, entry.generator))) {
      fail(`${entry.file}: generator ${JSON.stringify(entry.generator)} does not exist`);
    }
    if (typeof entry.approxBytes !== 'number' || entry.approxBytes <= 0) fail(`${entry.file}: approxBytes must be a positive number`);
    if (!isPlainObject(entry.contains)) fail(`${entry.file}: contains must describe the structural counts`);

    const name = entry.file.replace(/^stress\//, '');
    const declared = STRESS_CONTAINS[name];
    if (!declared) {
      fail(`${entry.file}: the generator does not produce a file with that name`);
    } else if (JSON.stringify(entry.contains) !== JSON.stringify(declared)) {
      fail(
        `${entry.file}: contains ${JSON.stringify(entry.contains)} but the generator declares ${JSON.stringify(declared)} ` +
          '(keep manifest.stress[].contains in step with STRESS_CONTAINS in scripts/gen-corpus-stress.mjs)',
      );
    }

    const abs = join(CORPUS, entry.file);
    if (!existsSync(abs)) {
      results.push({ file: entry.file, present: false, approxBytes: entry.approxBytes, contains: entry.contains });
      continue;
    }
    const bytes = statSync(abs).size;
    const source = readFileSync(abs, 'utf8');
    const { counts } = scanMarkdown(source);
    for (const [key, value] of Object.entries(entry.contains ?? {})) {
      if (!(key in counts)) continue; // depths/rows/columns are not scanner counters
      if (counts[key] !== value) fail(`${entry.file}: contains.${key} is ${value} but the generated file has ${counts[key]}`);
    }
    results.push({ file: entry.file, present: true, bytes, counts, approxBytes: entry.approxBytes, contains: entry.contains });
  }
  for (const name of Object.keys(STRESS_CONTAINS)) {
    if (!listed.has(name)) fail(`the generator produces stress/${name} but the manifest does not list it`);
  }

  const gitignore = existsSync(join(ROOT, '.gitignore')) ? readFileSync(join(ROOT, '.gitignore'), 'utf8') : '';
  if (!/^tests\/corpus\/stress\/?\s*$/m.test(gitignore)) {
    fail('.gitignore must ignore tests/corpus/stress/');
  }
  return results;
}

// --------------------------------------------------------------------------- report ---

function report(summary) {
  const lines = [];
  lines.push('OpenMark corpus');
  lines.push(`  markdown documents : ${summary.markdown.fileCount} (bar: ${BARS.markdown})`);
  lines.push(
    `  languages          : zh ${summary.languages.zh} (bar ${BARS.pureChinese}) | en ${summary.languages.en} (bar ${BARS.pureEnglish}) | mixed ${summary.languages.mixed} (bar ${BARS.mixed})`,
  );
  lines.push(`  math cases         : ${summary.math.cases.length} (bar: ${BARS.math})`);
  lines.push(`  math error cases   : ${summary.math.errorCases} (bar: ${BARS.mathErrors})`);
  lines.push(`  math category files: ${summary.math.splits ?? 0}`);
  lines.push(`  mhchem/\\pu cases   : ${summary.math.mhchem}`);
  lines.push('  math cases per category:');
  const cats = [...summary.math.categories.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const width = Math.max(...cats.map(([name]) => name.length));
  for (const [name, count] of cats) lines.push(`    ${name.padEnd(width)}  ${count}`);
  lines.push('  markdown totals:');
  for (const key of EXPECT_KEYS) {
    const total = summary.markdown.docs.reduce((sum, doc) => sum + (doc.counts?.[key] ?? 0), 0);
    lines.push(`    ${key.padEnd(11)} ${total}`);
  }
  const codes = new Set();
  for (const doc of summary.markdown.docs) for (const code of doc.diagnostics ?? []) codes.add(code);
  lines.push(`  diagnostic codes exercised: ${codes.size} (${[...codes].sort().join(', ') || 'none'})`);
  lines.push('  stress fixtures:');
  for (const s of summary.stress) {
    const detail = s.present ? `${s.bytes} bytes on disk` : `not generated yet (declared ~${s.approxBytes} bytes)`;
    lines.push(`    ${s.file.padEnd(22)} ${detail}`);
  }
  lines.push(`  generated at       : ${summary.generatedAt}`);
  return lines.join('\n');
}

// ------------------------------------------------------------------------------ main ---

function main() {
  const argv = process.argv.slice(2);
  const quiet = argv.includes('--quiet');
  const printIdx = argv.indexOf('--print-counts');
  if (printIdx >= 0) {
    const files = argv.slice(printIdx + 1).filter((a) => !a.startsWith('--'));
    if (files.length === 0) {
      process.stderr.write('--print-counts needs at least one file\n');
      process.exit(2);
    }
    printCounts(files.map((f) => resolve(f)));
    return;
  }

  if (!existsSync(MANIFEST)) {
    process.stderr.write('tests/corpus/manifest.json is missing\n');
    process.exit(1);
  }
  const { value: manifest } = readJson(MANIFEST);
  if (!isPlainObject(manifest)) {
    process.stderr.write('manifest.json must contain an object\n');
    process.exit(1);
  }
  if (manifest.version !== 1) fail(`manifest.version must be 1 (got ${JSON.stringify(manifest.version)})`);
  if (typeof manifest.generatedAt !== 'string' || Number.isNaN(Date.parse(manifest.generatedAt))) {
    fail('manifest.generatedAt must be an ISO date string');
  }

  const md = checkMarkdown(manifest);
  const math = checkMath(manifest);
  const stress = checkStress(manifest);

  if (md.fileCount < BARS.markdown) fail(`corpus has ${md.fileCount} markdown documents; the bar is ${BARS.markdown}`);
  if (math.cases.length < BARS.math) fail(`corpus has ${math.cases.length} math cases; the bar is ${BARS.math}`);
  if (math.errorCases < BARS.mathErrors) fail(`corpus has ${math.errorCases} math error cases; the bar is ${BARS.mathErrors}`);
  if (md.languages.zh < BARS.pureChinese) fail(`corpus has ${md.languages.zh} pure-Chinese documents; the bar is ${BARS.pureChinese}`);
  if (md.languages.en < BARS.pureEnglish) fail(`corpus has ${md.languages.en} pure-English documents; the bar is ${BARS.pureEnglish}`);
  if (md.languages.mixed < BARS.mixed) fail(`corpus has ${md.languages.mixed} mixed-language documents; the bar is ${BARS.mixed}`);

  const summary = {
    markdown: { fileCount: md.fileCount, docs: md.docs },
    languages: md.languages,
    math,
    stress,
    generatedAt: manifest.generatedAt,
  };

  if (problems.length > 0) {
    process.stderr.write(`corpus:verify FAILED — ${problems.length} problem(s)\n\n`);
    for (const p of problems) process.stderr.write(`  - ${p}\n`);
    process.stderr.write(`\n${report(summary)}\n`);
    process.exit(1);
  }
  if (!quiet) process.stdout.write(`${report(summary)}\n\ncorpus:verify OK — manifest matches the corpus on disk.\n`);
}

main();
