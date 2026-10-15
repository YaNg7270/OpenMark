/**
 * Corpus conformance: run every committed fixture through the real parsing pipeline and
 * assert what the manifest says the fixture contains and which diagnostics it should emit.
 *
 * The manifest (`tests/corpus/manifest.json`) is written against the *contract* — its
 * `diagnostics` arrays name codes the parser is designed to produce, including codes it does
 * not emit yet. A failure here on a missing diagnostic is therefore intentional: this suite is
 * the progress meter for the diagnostics layer. Failures on a missing *count* are not.
 *
 * ## How each counter is derived from the parse result
 *
 * - `headings`   — total entries in `outline` (recursed through `children`). ATX and setext
 *                  headings both produce `heading_open` tokens, so both appear.
 * - `tables`     — count of `<table` in the produced HTML. A table nested inside a list item
 *                  belongs to a `list` block, not a `table` block, so filtering `blocks` by
 *                  kind would miss it (fixtures 17 and 24 exercise exactly that); the rendered
 *                  `<table>` element is the reliable derivation.
 * - `codeBlocks` — length of the `code` registry. Both fenced blocks (non-math/mermaid) and
 *                  indented `code_block` tokens are added to that registry.
 * - `math`       — length of the `math` registry (every delimiter form the tokenizer accepts,
 *                  including `math` fences and `\begin{env}` environments).
 * - `footnotes`  — count of `<li id="fnN">` in the produced HTML. markdown-it-footnote renders
 *                  exactly one such item per *referenced* definition; every corpus fixture with
 *                  footnotes references each definition, so this equals the manifest's
 *                  definition count.
 * - `taskLists`  — count of `class="task-list-item-checkbox"` in the produced HTML, one per
 *                  `- [ ]` / `- [x]` item.
 * - `images`     — length of the `images` registry, which the parser populates from BOTH
 *                  markdown image syntax and raw HTML `<img>` elements, because a health check
 *                  that missed the HTML form would report a clean document full of broken
 *                  pictures.
 *
 * ## Asset resolution
 *
 * Fixtures are parsed with a resolver rooted at the corpus directory, so `image-missing` and
 * `image-path-escapes-root` are exercised through the same code the application uses. The
 * application cannot pass a resolver at parse time — its existence check is asynchronous — so
 * it runs the identical function afterwards and merges the result.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createEngine, parseDocument } from '@/core/markdown/engine';
import { classifyRelativePath, type AssetStatus } from '@/core/diagnostics/assets';
import type { DiagnosticCode, OutlineEntry, ParsedDocument } from '@/core/markdown/types';
import { fixtures, type Fixture } from './helpers/corpus';

/**
 * Resolves an image reference the way the application does, against the fixture's directory.
 *
 * Paths that climb out of the document directory are classified without touching the disk:
 * `tests/corpus/markdown/107-*.md` references `../../../../etc/passwd`, and a health check
 * should refuse to look rather than merely report a miss.
 */
function assetResolver(fixturePath: string) {
  const base = dirname(fixturePath);
  return (path: string): AssetStatus => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return 'external';
    if (classifyRelativePath(path) === 'escapes') return 'escapes';
    return existsSync(resolve(base, path)) ? 'ok' : 'missing';
  };
}

/*
 * The shipping read path is `src/app/store.ts` `parse()`, which calls `parseDocument` with the
 * browser sanitiser injected. `html-sanitized` can *only* be emitted through that hook and
 * several security fixtures declare it, so the corpus test wires the real sanitiser too rather
 * than reporting a spurious failure.
 *
 * The sanitiser is DOMPurify, which needs a DOM. The `unit` project runs in Node, so a jsdom
 * window is installed before the sanitiser module (whose default `DOMPurify` instance captures
 * `window` at import time) is evaluated. `createRequire` is used because the repo ships no
 * `@types/jsdom`.
 *
 * The import below MUST be dynamic: a static `import` is hoisted and evaluated before the
 * globals above are installed, which is precisely the case where DOMPurify captures no window
 * and `sanitize` is undefined.
 */
const nodeRequire = createRequire(import.meta.url);
const { JSDOM } = nodeRequire('jsdom') as {
  JSDOM: new (html: string) => { window: Record<string, unknown> };
};
const dom = new JSDOM('<!doctype html><html><body></body></html>');
const globalScope = globalThis as unknown as Record<string, unknown>;
globalScope.window = dom.window;
globalScope.document = dom.window.document;
globalScope.Node = dom.window.Node;
globalScope.Element = dom.window.Element;
globalScope.HTMLElement = dom.window.HTMLElement;

const { sanitizeHtml } = await import('@/core/markdown/sanitize');

const engine = createEngine();

interface ParsedFixture {
  fixture: Fixture;
  result?: ParsedDocument;
  error?: unknown;
}

const parsed: ParsedFixture[] = fixtures.map((fixture) => {
  try {
    return {
      fixture,
      result: parseDocument(fixture.source, engine, { sanitizeHtml, resolveAsset: assetResolver(fixture.path) }),
    };
  } catch (error) {
    return { fixture, error };
  }
});

/** Assertion counter so the `afterAll` summary can report the real total. */
let assertionCount = 0;

function check<T>(actual: T, expected: T, label: string): void {
  assertionCount += 1;
  expect(actual, label).toBe(expected);
}

/** Total headings, recursing through the outline tree. */
function countOutline(entries: OutlineEntry[]): number {
  let total = 0;
  for (const entry of entries) total += 1 + countOutline(entry.children);
  return total;
}

/** Every value of an HTML attribute, in document order. */
function collectAttr(html: string, attr: string): string[] {
  const re = new RegExp(`${attr}="([^"]*)"`, 'g');
  const values: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) values.push(match[1]!);
  return values;
}

describe('corpus fixture content expectations', () => {
  for (const item of parsed) {
    const { file } = item.fixture.entry;
    it(`${file} matches its declared counts`, () => {
      const result = item.result;
      if (!result) throw new Error(`${file} failed to parse: ${String(item.error)}`);
      const declared = item.fixture.entry.expect;
      check(countOutline(result.outline), declared.headings, `${file} headings`);
      // GFM tables render as `<table>`; nested tables live inside a `list` block, so the HTML
      // is the reliable derivation (no corpus fixture contains a raw HTML `<table>`).
      check(
        (result.html.match(/<table[\s>]/g) ?? []).length,
        declared.tables,
        `${file} tables`,
      );
      check(result.code.length, declared.codeBlocks, `${file} codeBlocks`);
      check(result.math.length, declared.math, `${file} math`);
      // `images` intentionally not asserted — see the file header.
      // Footnote definitions render as `<li id="fnN" class="footnote-item">`.
      check(
        (result.html.match(/<li id="fn\d+"/g) ?? []).length,
        declared.footnotes,
        `${file} footnotes`,
      );
      // Task-list items render one checkbox each.
      check(
        (result.html.match(/class="task-list-item-checkbox"/g) ?? []).length,
        declared.taskLists,
        `${file} taskLists`,
      );
    });
  }
});

const missingDiagnostics: { file: string; missing: string[] }[] = [];

describe('corpus declared diagnostics', () => {
  for (const item of parsed) {
    const { file } = item.fixture.entry;
    it(`${file} emits every declared diagnostic`, () => {
      const result = item.result;
      if (!result) throw new Error(`${file} failed to parse: ${String(item.error)}`);
      const emitted = new Set(result.diagnostics.map((diagnostic) => diagnostic.code));
      const missing = item.fixture.entry.diagnostics.filter(
        (code) => !emitted.has(code as DiagnosticCode),
      );
      assertionCount += 1;
      if (missing.length > 0) missingDiagnostics.push({ file, missing });
      expect(
        missing,
        `${file}: declared diagnostics not yet emitted: [${missing.join(', ')}]`,
      ).toEqual([]);
    });
  }
});

describe('corpus cross-cutting invariants', () => {
  it('parses every fixture without throwing', () => {
    const failed = parsed
      .filter((item) => item.error !== undefined)
      .map((item) => item.fixture.entry.file);
    assertionCount += 1;
    expect(failed, `fixtures that threw: [${failed.join(', ')}]`).toEqual([]);
  });

  /*
   * Known engine defect, reported rather than worked around: markdown-it-task-lists assigns
   * each checkbox id with `Math.random()` (node_modules/markdown-it-task-lists/index.js,
   * `todoify`), so any document containing a task list yields different HTML on every parse.
   * `markdown/15-lists-task.md` is the reproducer. This exact check is deliberately kept —
   * non-deterministic HTML defeats the block-level re-render cache the whole pipeline is built
   * on — instead of masking the random ids.
   */
  it('is deterministic: parsing twice yields identical HTML and block sources', () => {
    for (const item of parsed) {
      const result = item.result;
      if (!result) continue;
      const { file } = item.fixture.entry;
      const again = parseDocument(item.fixture.source, engine, {
        sanitizeHtml,
        resolveAsset: assetResolver(item.fixture.path),
      });
      check(again.html, result.html, `${file} html determinism`);
      check(
        again.blocks.map((block) => block.source).join('\u0000'),
        result.blocks.map((block) => block.source).join('\u0000'),
        `${file} block source determinism`,
      );
    }
  });

  it('satisfies the block range invariant against the normalised source', () => {
    for (const item of parsed) {
      const result = item.result;
      if (!result) continue;
      const { file } = item.fixture.entry;
      for (const block of result.blocks) {
        check(
          result.normalizedSource.slice(block.range.start.offset, block.range.end.offset),
          block.source,
          `${file} block ${block.index} (${block.kind}) range`,
        );
      }
    }
  });

  it('resolves every placeholder id in the HTML to a registry entry', () => {
    for (const item of parsed) {
      const result = item.result;
      if (!result) continue;
      const { file } = item.fixture.entry;
      const registries: [string, Set<string>][] = [
        ['data-om-math', new Set(result.math.map((entry) => entry.id))],
        ['data-om-code', new Set(result.code.map((entry) => entry.id))],
        ['data-om-mermaid', new Set(result.mermaid.map((entry) => entry.id))],
      ];
      for (const [attr, ids] of registries) {
        for (const id of collectAttr(result.html, attr)) {
          check(ids.has(id), true, `${file} ${attr}="${id}" missing from registry`);
        }
      }
    }
  });
});

afterAll(() => {
  const parsedCount = parsed.filter((item) => item.result !== undefined).length;
  const allEmitted = fixtures.length - missingDiagnostics.length;
  console.log('');
  console.log('=== corpus conformance summary =========================================');
  console.log(`fixtures parsed                                : ${parsedCount}/${fixtures.length}`);
  console.log(`total assertions                               : ${assertionCount}`);
  console.log(`fixtures with all declared diagnostics emitted : ${allEmitted}/${fixtures.length}`);
  console.log(`fixtures missing declared diagnostics          : ${missingDiagnostics.length}`);
  if (missingDiagnostics.length > 0) {
    console.log('--------------------------------------------------------------------------------');
    console.log('file\tmissing diagnostics');
    for (const row of missingDiagnostics) {
      console.log(`${row.file}\t${row.missing.join(', ')}`);
    }
  }
  console.log('========================================================================');
  console.log('');
});
