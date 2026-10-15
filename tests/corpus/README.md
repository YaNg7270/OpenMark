# OpenMark test corpus

A version-controlled corpus of Markdown documents, LaTeX/mhchem formulas and generated
stress files. It exists so the reading pipeline can be tested against *content*, not
against strings invented inside a test file: every fixture declares, in
`manifest.json`, exactly how many headings / tables / code blocks / formulas / images /
footnotes / task-list items it contains, and which diagnostics it is designed to
produce.

    tests/corpus/
      manifest.json          machine-readable index — the only source of truth
      README.md              this file
      markdown/              ≥110 fixture documents (flat, numeric prefixes)
      math/                  formulas.json + one file per category
      assets/                tiny real assets referenced by the image fixtures
      stress/                generated, git-ignored (see scripts/gen-corpus-stress.mjs)

## Running the checks

```bash
pnpm corpus:verify                            # validate manifest ↔ disk, print counts
node scripts/gen-corpus-stress.mjs            # (re)generate tests/corpus/stress/
node scripts/verify-corpus.mjs --quiet        # no report unless something fails
node scripts/verify-corpus.mjs --print-counts tests/corpus/markdown/50-math-inline-dollar.md
```

`pnpm corpus:verify` fails (non-zero exit) when:

* a listed file is missing, or a `.md` file on disk is not listed;
* a file is not UTF-8 / has a BOM / uses CRLF / lacks exactly one trailing newline;
* any `expect` counter disagrees with the file's actual contents (see the rule table
  below — the counters are recomputed by `scripts/lib/corpus-scan.mjs`);
* a `language`, `categories`, `diagnostics` or `notes` value is missing or illegal
  (`diagnostics` values must be real `DiagnosticCode`s from `src/core/markdown/types.ts`);
* `manifest.math` differs from `math/formulas.json`, ids are duplicated, a case uses an
  unknown delimiter, or an `expect: "error"` case has no `reason`;
* the per-category splits in `math/` do not exactly partition `formulas.json`;
* a corpus bar is missed (≥110 markdown docs, ≥200 math cases, ≥25 error cases,
  ≥25 pure-Chinese, ≥25 pure-English, ≥20 mixed documents);
* `tests/corpus/stress/` is no longer git-ignored, the manifest fails to list a file the
  generator produces (or vice versa), a `contains` block disagrees with the generator's
  `STRESS_CONTAINS`, or — when the stress files happen to be generated — their
  `headings`/`math`/`tables` counts disagree with the manifest.

## Manifest schema

```jsonc
{
  "version": 1,
  "generatedAt": "2026-10-15T00:00:00.000Z",
  "markdown": [
    {
      "file": "markdown/01-headings-atx.md",   // path relative to tests/corpus/
      "title": "ATX headings at every level",  // the document's own H1
      "categories": ["structure", "headings"],
      "language": "en",                        // "zh" | "en" | "mixed"
      "expect": {                              // counts, assertable without parsing
        "headings": 8, "tables": 0, "codeBlocks": 0, "math": 0,
        "images": 0, "footnotes": 0, "taskLists": 0
      },
      "diagnostics": [],                       // DiagnosticCode[] this fixture must produce
      "notes": "One sentence: what the fixture proves."
    }
  ],
  "math": [ /* every case, verbatim as in math/formulas.json */ ],
  "stress": [
    {
      "file": "stress/huge-textbook.md",
      "generator": "scripts/gen-corpus-stress.mjs",
      "approxBytes": 3101067,
      "contains": { "headings": 400, "math": 300, "tables": 100 }
    }
  ]
}
```

`expect` keys are exactly the seven listed; `expect` deliberately carries no `lines` or
`bytes` field — those change with every wording tweak and would make the manifest churn.

### How `expect` counters are defined

These definitions are implemented once, in `scripts/lib/corpus-scan.mjs`, and are the
contract tests may rely on. Anything spanning lines is counted once, at its closer.

| Counter      | Counts                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------- |
| `headings`   | ATX headings (`#{1,6}` in columns 0–3) **plus** setext headings (a line of `=`/`-` directly under a non-blank, non-table line). Headings inside fences, HTML comments or YAML frontmatter do not count. |
| `tables`     | GFM tables, counted by their delimiter row (a line of only `|`, `-`, `:`, spaces containing a `|`, preceded by a line containing a `|`). |
| `codeBlocks` | Fenced blocks whose info string is not `math`/`mathjax`/`mermaid`/`mmd`, **plus** top-level 4-space indented code blocks (not list/footnote continuations). |
| `math`       | Every expression the tokenizer in `src/core/markdown/math-plugin.ts` recognises: `$$…$$` (inline or block), inline `$…$` obeying the whitespace/digit rules, `\(…\)`, `\[…\]`, `\begin{env}…\end{env}` for every `MATH_ENVIRONMENTS` name, and ` ```math ` fences. An unterminated construct is **not** counted — the tokenizer declines it and the diagnostics layer reports it. |
| `images`     | Markdown image syntax (`![]()`, `![][ref]`) outside code. Raw HTML `<img>` is not markdown image syntax. |
| `footnotes`  | Footnote *definitions* (`[^id]: …`), not references.                                            |
| `taskLists`  | Task-list items (`- [ ]`, `- [x]`, …) outside code.                                             |

### `diagnostics` semantics — read this before writing assertions

`diagnostics` lists the codes a fixture **is designed to trigger**, using the
`DiagnosticCode` union. Today only a subset is emitted by the parser in
`src/core/markdown/engine.ts`:

| Emitted today by `engine.ts` |                 |
| ---------------------------- | --------------- |
| `unclosed-fence`             | `unclosed-math` |
| `math-unbalanced-braces`     | `html-sanitized` |

The remaining codes in the union (`image-missing`, `image-remote`,
`image-path-escapes-root`, `link-remote`, `dangling-reference-link`, `duplicate-footnote`,
`duplicate-heading-anchor`, `tab-indent-in-list`, `inconsistent-list-marker`,
`unicode`-related encoding codes, the `math-*` family, `script-removed`, …) are declared
in the contract but not yet produced by the parser. Fixtures for them are authored now so
that the diagnostics layer has a fixed target; a test that asserts on them will fail
until that layer lands. This is intentional and is why the manifest records expectations
rather than the current behaviour.

## Math corpus

`math/formulas.json` is the single array of cases; `manifest.math` carries the same array
verbatim (the validator asserts they are identical, so a case can never drift). Each
`math/<category>.json` file holds the cases of one category and the splits must partition
`formulas.json` exactly.

Case schema:

| Field       | Meaning                                                                                     |
| ----------- | ------------------------------------------------------------------------------------------- |
| `id`        | `m001`…, unique across the corpus, stable — reference it from tests and bug reports.         |
| `tex`       | The LaTeX body **without** delimiters (for `latex-env` cases the body keeps its `\begin`/`\end`). |
| `display`   | Whether the expression is display math.                                                     |
| `delimiter` | One of `dollar`, `dollar-block`, `paren-inline`, `paren-block`, `latex-env`, `math-fence` — mirrors the `MathDelimiter` union. |
| `packages`  | Non-default MathJax packages the case exercises. `[]` means "base MathJax TeX only".          |
| `expect`    | `"render"` or `"error"`.                                                                    |
| `reason`    | `null` for `"render"`; for `"error"`, what must be reported (and as which `math-*` code).    |
| `category`  | The file the case is split into, e.g. `fraction`, `mhchem`, `error`.                        |

**Package vocabulary** — mirrors `EXTRA_PACKAGES` in `src/core/math/mathjax.ts`:
`ams` (align/gather/cases, `\mathbb`, `\mathcal`, `\mathfrak`, `\tag`, `\ref`),
`mathtools` (`dcases`, `rcases`), `boldsymbol` (`\boldsymbol`, `\bm`), `cancel`
(`\cancel`, `\bcancel`, `\xcancel`), `color` (`\textcolor`, `\color`, `\colorbox`),
`mhchem` (`\ce`, `\pu`), `textmacros` (`\text` with nested macros), `unicode`
(non-Latin text inside formulas).

**Categories** — the exact set of filenames in `math/` is the category vocabulary:
`absolute`, `aligned`, `arrow`, `boxed`, `cancel`, `cases`, `color`, `decoration`,
`delimiter`, `delimiters`, `derivative`, `environment`, `error`, `exponent`, `font`,
`fraction`, `greek`, `integral`, `limit`, `matrix`, `mhchem`, `norm`, `numbering`,
`operator`, `partial`, `prime`, `product`, `relation`, `root`, `spacing`, `subscript`,
`sum`, `text`, `units`.

Error cases cover unknown macros, missing arguments, unbalanced braces and environments,
unsupported environments, mismatched `\left`/`\right`, stray alignment tabs outside an
alignment environment, invalid `\ce{}`/`\pu{}` input, and unclosed `\begin`.

## Language mix

`language` is `zh` (Chinese prose throughout; Latin appears only inside code, identifiers,
units, proper names and formulas), `en`, or `mixed` (Chinese and Latin technical terms
interleaved **within the same running sentence** — a `zh` document that merely quotes an
English code block or writes `$\mathbf{v}$` is still `zh`). The corpus guarantees at least
25 `zh`, 25 `en` and 20 `mixed` documents; `corpus:verify` reports the current split.

## Stress corpus

`tests/corpus/stress/` is **generated, never committed** (it is listed in `.gitignore`;
`corpus:verify` re-checks that). Generate it with:

```bash
node scripts/gen-corpus-stress.mjs                 # -> tests/corpus/stress/
node scripts/gen-corpus-stress.mjs --out /tmp/om   # somewhere else
```

| File                   | ~Size   | Shape                                                        |
| ---------------------- | ------- | ------------------------------------------------------------ |
| `huge-textbook.md`     | 3.1 MB  | 400 headings, 300 display formulas, 100 tables                |
| `math-dense.md`        | 550 KB  | 2 000 display formulas                                        |
| `deep-nesting.md`      | 200 KB  | 30-level nested lists and 30-level nested blockquotes         |
| `many-small-blocks.md` | 1.1 MB  | 20 000 short paragraphs                                       |
| `wide-tables.md`       | 650 KB  | one 40-column × 2 000-row table                               |

Generation is fully deterministic (seeded PRNG, index-derived content — no
`Math.random()`, no clock), so two runs are byte-identical and the `contains` counters in
the manifest stay valid. `corpus:verify` checks those entries two ways: the declared
`contains` must equal the generator's own `STRESS_CONTAINS` export (so the generator and
the manifest can never drift), and when the files exist they are re-scanned and the
counters the scanner understands (`headings`, `math`, `tables`) are re-checked against the
generated bytes. When the files are absent it reports the declared sizes only.

## Extending the corpus

**A new Markdown fixture**

1. Add `tests/corpus/markdown/<name>.md` (UTF-8, LF, one trailing newline).
2. Get its counters: `node scripts/verify-corpus.mjs --print-counts tests/corpus/markdown/<name>.md`.
3. Add an entry to `manifest.markdown` with those counters, plus `title`, `categories`
   (2–4 kebab-case tags), `language`, `diagnostics` and a one-sentence `notes`.
4. Run `pnpm corpus:verify`.

Keep fixtures single-purpose: a stray `$`, footnote definition or table in an unrelated
fixture silently changes its expected counts and makes other tests' assertions fragile.

**A new math case**

1. Append to `math/formulas.json` (next free `mNNN`).
2. Copy the case verbatim into `manifest.math` — or re-run the small join used to build
   the manifest — and add it to the matching `math/<category>.json`.
3. `expect: "error"` cases **must** explain themselves in `reason`.

**A new stress file**

Add a generator to `scripts/gen-corpus-stress.mjs`, export its `contains` counters, add
the entry to `manifest.stress`, and keep `approxBytes` in step with the generated size.

**A new diagnostic fixture** — add the code to the fixture's `diagnostics` array; if the
code is new, add it to `DIAGNOSTIC_CODES` in `scripts/verify-corpus.mjs` (which mirrors
`DiagnosticCode`).
