# OpenMark — Test Strategy

Phase 0 baseline, 2026-10-15. Test-driven and **evidence**-driven: a claim counts only if a command produced an
artefact that can be re-run. "The page did not throw" is not evidence of anything.

Current status: `package.json` already wires the entry points (`test:unit`, `test`, `test:e2e`, `test:desktop`,
`test:coverage`, `corpus:verify`, `verify`), and the toolchain is installed (`vitest@5`, `@playwright/test@1.64.1`,
`@wdio/*@9.x`, `fast-check@4.10.2`, `jsdom@30`). **Every directory under `tests/` is empty and the corpus
deliverable is still being produced**, so every layer below is a specification, not a report.

---

## 1. Principles

1. **Evidence or it did not happen.** Each layer states its command and its artefact (`tests/**`,
   `test-results/`, `coverage/`, `playwright-report/`, `.wdio-logs/` — all gitignored where appropriate).
2. **Minimal reproduction first.** A discovered defect gets a failing minimal case committed *before* the fix; the
   fix lands with that case as its regression test.
3. **Assert the mechanism, not the wrapper.** For formulas this means MathJax's own error report (§3), not the
   presence of an element. For files it means byte comparison, not "save succeeded".
4. **No sleeps.** Waiting is on observable conditions (`data-om-state`, text, network idleness).
5. **Determinism.** The corpus is LF-only with a trailing newline; generators are seeded and idempotent; clocks and
   random ids are injected in tests.
6. **A failed check is a finding.** A flaky test is a defect in the test or in the product, never something to
   re-run until green.

---

## 2. The seven layers

Each layer owns a question that no other layer can answer; overlap is intentional only where defence in depth is
wanted (e.g. round-trip fidelity is asserted in both layer 1 and layer 2 at different granularities).

### Layer 1 — Unit (Vitest, Node, no DOM)

- **Owns:** the whole `src/core/markdown/**` pipeline (pure, synchronous, DOM-free), the encoding module, the
  settings model, the store's reducers.
- **Must prove:**
  - `createEngine`/`parseDocument` produce the expected registries and diagnostics for hand-built inputs;
  - **every** math case in the corpus is *tokenized* correctly: delimiter kind, `tex` body, `raw` (delimiters
    included, byte-for-byte) and `range` (line/column/offset) — asserted from `MathExpression`, which needs no
    browser (motor of the whole corpus, given the MathJax-on-Node defect, RESEARCH §3.1);
  - the four delimiter-ambiguity rules and the currency/escape cases (`$20 and $30`, `Prices: $5, $10, $15`,
    `\$100`, `$` inside code spans/fences, `\(` without a closer, mid-paragraph `$$`, lone unclosed `$$`);
  - `MATH_ENVIRONMENTS` acceptance, nested-environment matching (`findEnvironmentEnd`), and rejection of an
    unsupported `\begin{}`;
  - line/column/offset mapping (`LineIndex`, `SourceLocator`) on repeated identical constructs;
  - frontmatter capture (raw text, `---` vs `...` closer, first-line-only rule) and YAML failure handling;
  - outline building: deterministic CJK-aware slugs, collision suffixes, `nestOutline` level jumps;
  - structural diagnostics (fence balance, `$$` parity) and `checkMathSource` brace balance;
  - `decodeText`/`encodeText`: UTF-8 ±BOM, UTF-16 LE/BE, CRLF/CR/LF, mixed EOL, lossy decode, and that
    `encodeText(decodeText(b))` reproduces `b` for every supported encoding;
  - settings load/merge/CSS projection, including rejection of type-corrupted stored values.
- **Entry:** `pnpm test:unit`. **Exit:** 100 % of corpus tokenization + all fixtures pass; coverage of
  `src/core/markdown/**` and `src/core/fs/encoding.ts` ≥ 90 % statements (target, to be ratified).
- **Cannot** prove anything about MathJax, Mermaid, Shiki or the DOM. Layer 1 must never assert rendering.

### Layer 2 — Property and round-trip (Vitest + fast-check)

- **Owns:** the *file* invariant "opening and saving does not change my bytes".
- **Must prove (properties, over generated documents and the corpus):**
  - **P1 identity:** for any document, `decode(encode(text, {bom, eol})) === text` and the byte sequence equals
    the original bytes for every supported `{bom, eol}`;
  - **P2 untouched-region identity:** after `parseDocument`, rendering and typesetting (mocked), the authoritative
    text is unchanged — the pipeline has no write path to the document at all;
  - **P3 no re-serialisation:** no code path produces markdown from `RenderResult`; enforced structurally by a
    test that the exported API surface cannot emit markdown (and by review);
  - **P4 preservation:** fence `info` strings, frontmatter raw text, HTML comments, unknown/unsupported syntax,
    trailing whitespace, blank-line runs, EOF newline presence/absence survive an open→save cycle byte-for-byte;
  - **P5 counter-examples are recorded:** the measured loss tables in RESEARCH §2.2 and §7 are the *expected*
    failures of the rejected kernels; they must never become true of OpenMark.
- **Entry:** `pnpm test`. **Exit:** no counter-example unaccounted for; the property runs on the full corpus with a
  fixed seed in CI.
- **Note:** this layer is the acceptance gate for PRD R-C-11/R-C-12/R-D-4 and must exist before the editor is
  allowed to write anything.

### Layer 3 — Browser rendering (Playwright against the Vite dev server)

- **Owns:** everything that needs a real DOM and a real MathJax/Mermaid/Shiki: **formula rendering verification**,
  diagram rendering, syntax highlighting, interaction and keyboard behaviour, screenshot regression.
- **Must prove:**
  - each corpus math case with `expect:"render"` yields a MathJax result **and MathJax reports no error** (§3);
  - each corpus math case with `expect:"error"` yields MathJax's error report, the diagnostic appears with the
    expected `code`, `mathId` and range, and the node still contains the authored source;
  - the six differentiation features are *operable* (E1 jump-to-problem, E2 panel actions, E3 progress/position,
    E4 read-only lock, E5 health report, E6 settings taking effect without a document re-render);
  - four modes: switch, keep source/caret/scroll, render identically (PRD R-MODE-5, R-MODE-8);
  - keyboard shortcuts and focus behaviour; search navigation;
  - **offline verification:** no non-local request occurs while opening and reading the corpus (assert on captured
    requests — this is the check that currently fails R-MATH-1 and therefore matters);
  - **screenshot regression** for a curated subset: maths with fractions/integrals/matrices/cases/mhchem, code
    with both themes, diagrams, a CJK-heavy table, and the reading page at three content widths.
- **Entry:** `pnpm test:e2e` (optionally `pnpm preview` for the built bundle). Artefacts: `playwright-report/`,
  `tests/e2e/**/__screenshots__/`.
- **Screenshot policy:** tolerance is per-fixture and explicit; a changed image is a reviewable artefact, never
  auto-accepted (`test:e2e:update` is a deliberate developer action).

### Layer 4 — Desktop end-to-end (WebdriverIO + Tauri, real Windows binary)

- **Owns:** the packaged application: startup, file dialogs (via command mocking), file association hand-off,
  IPC, atomic save on a real filesystem, external-change conflict, window state, and the portable build.
- **Must prove:**
  - the built `.exe` launches, restores window state, and renders a document from disk;
  - open → edit → save → reopen on the real FS is byte-identical for CRLF and BOM files (the layer-2 property,
    now through the real Rust path);
  - a second launch with a document argument is handed to the running instance and opens the document;
  - a crash/kill during a save leaves the original intact and a backup present (§ARCHITECTURE S5);
  - the read-only gate survives a real file (oversize fixture, unclosed-fence fixture);
  - `browser.tauri.execute()`, mocking and log capture work — i.e. the debug-only plugin + capability +
    frontend import are all wired.
- **Entry:** `pnpm desktop:build` then `pnpm test:desktop`. Requires msedgedriver version-matched to the machine's
  WebView2 (`autoDownloadEdgeDriver: true` — a mismatch **hangs** rather than erroring, RESEARCH §9.5), and
  `driverProvider: 'embedded'` with a 60 s startup timeout.
- **Cannot** drive native OS dialogs: dialog flows assert through `browser.tauri.mock('…')` on the invoked command.
- **Blocking prerequisite:** `index.html` must import `@wdio/tauri-plugin` and `tests/desktop/wdio.conf.ts` must
  exist before anything in this layer can run.

### Layer 5 — Performance

- **Owns:** the budgets in PRD R-N-3, and the "no size cap" claim (R-PRIO-3).
- **Must measure, on the stress corpus (`tests/corpus/stress/**`, generated — never committed):**
  - cold start to first contentful paint;
  - open → first paint and open → fully typeset for `huge-textbook.md` (~3 MB), `math-dense.md` (~500 KB /
    2000 display formulas), `many-small-blocks.md` (~1 MB / 20000 paragraphs);
  - scroll frame budget through `deep-nesting.md` and `wide-tables.md` (40 columns × 2000 rows);
  - document switch with a large document open (must not regress another document's state — the `AbortSignal`
    contract in `typesetter.ts`);
  - search latency over the corpus;
  - memory ceiling after open/read/close cycles (leak check: the diagram cache is bounded at 200 entries; the
    grammar set is bounded by the languages actually used).
- **Entry:** `pnpm test:perf` (Vitest bench or a Playwright-driven harness; to be finalised in Phase 1).
- **Method:** median of ≥ 5 runs, warm and cold reported separately, machine described in the report; budgets are
  recorded as numbers and then held as regressions, not re-derived each time.

### Layer 6 — Security

- **Owns:** the adversarial corpus and the invariants of `docs/ARCHITECTURE.md` §5.
- **Must prove, per vector, that nothing executes and everything is reported:**
  - `<script>` block and inline; `<img src=x onerror=…>`; `<a href="javascript:…">`; `<iframe>`, `<object>`,
    `<embed>`; SVG containing `<script>`; event handlers on otherwise-allowed tags — all absent from the
    sanitised output, with an `html-sanitized` diagnostic naming what was removed;
  - a path-traversal image reference (`![](../../../../etc/passwd)`) resolves only inside the granted scope and is
    reported (`image-path-escapes-root`);
  - a remote image (`![](https://example.invalid/x.png)`) is **reported, not fetched** (`image-remote`) — asserted
    against captured network requests;
  - `javascript:`/`file:`/`data:text/html` URLs in links are stripped;
  - Mermaid diagram source cannot inject script or HTML labels (`securityLevel:'strict'`, `htmlLabels:false`);
  - the CSP blocks remote script even if a sanitiser rule were bypassed (assert a console CSP violation);
  - the test-only `wdio:default` surface does not exist in a release build.
- **Entry:** `pnpm test` (sanitizer unit tests) + `pnpm test:e2e` (execution/network assertions). The adversarial
  documents live in the corpus so both layers read the same fixtures.

### Layer 7 — Build

- **Owns:** "the release package runs standalone on a clean Windows 11 machine".
- **Must prove:**
  - NSIS installer builds and installs per-user without admin; the app launches from the Start menu;
  - the portable build (`--no-bundle` + `appDirectoriesOverride`) launches from a copied folder and keeps its
    data beside the executable;
  - `.md` association is offered, and a double-clicked document opens (with the one-time "always use this app"
    confirmation expected, RESEARCH §9.3);
  - **offline:** open, render (math + diagrams + code), search, export and save with the network unavailable;
  - the asset protocol serves a local image next to the document;
  - no `wdio`/devtools/test capability is reachable in the release binary;
  - the artefact hash and build inputs are recorded for the test report.
- **Blocking prerequisites:** Rust ≥ 1.90 (the manifest currently declares `1.77.2` — RESEARCH §9.2), the
  VBSCRIPT Windows feature for MSI (NSIS is the primary target), and a decision on signing given Smart App
  Control (RESEARCH §9.7).

---

## 3. The formula-assertion rule (non-negotiable)

> **A formula test MUST assert on MathJax's own error report, not on the presence of a DOM element.**

Rationale, grounded in this codebase:

- The product's contract is *"a failed formula keeps its source and reports why"* (PRD R-B-7, R-B-8).
  A `<span class="om-math">` node exists **even when rendering failed** — `mathPlaceholder()` emits it before
  MathJax ever runs, and `fillMath` marks failures with `data-om-state="error"`. Therefore "the element is
  present" carries no information about success.
- MathJax's authority is the `<merror data-mjx-error="…">` node it emits for a failed expression; that is exactly
  what `src/core/math/mathjax.ts` inspects (`MERROR_REGEX`, entity-decoded via `decodeAttr`). Tests must read the
  same signal the product reads.

**Required assertion shape (layer 3):**

1. locate the placeholder by `[data-om-math="math-<n>"]`;
2. read `data-om-state` and require `ok` for `expect:"render"` cases, `error` for `expect:"error"` cases;
3. for `expect:"render"`: assert that **no** `[data-mjx-error]` element exists anywhere inside the node, and that
   the node contains an `mjx-container`;
4. for `expect:"error"`: assert the reported message is non-empty (and, where the case names one, that the reason
   matches — e.g. "Missing close brace", unknown macro, unclosed environment), and assert that the authored
   source is still readable in the node **or** in `MathExpression.raw`;
5. assert the emitted diagnostic (`math-render-error`) carries the right `mathId` and a range that points at the
   right line;
6. additionally assert the *positive* corpus cases first (a suite where everything is an error case proves
   nothing about rendering), and run a **visual regression** for the curated set of representative formulas.

**Layer 1 counterpart:** the same corpus cases are asserted for *tokenization* (delimiter, `tex`, `raw`, `range`),
which needs no browser. That is the only way to test 200+ cases in CI while MathJax 4 cannot boot under Node on
Windows (RESEARCH §3.1) — a *browser-less* formula-rendering test is not an option, and pretending otherwise is
how a suite ends up asserting nothing.

**Corpus expectations.** Each case declares `expect: "render" | "error"` and, for errors, a `reason` describing
what should be reported. A case whose `expect` is contradicted by MathJax is a **product defect**, not a test to
be updated — unless the research note that justified the expectation is itself corrected.

---

## 4. Corpus contract

### 4.1 Layout

```
tests/corpus/
  manifest.json      machine-readable index: version, generatedAt, markdown[], math[], stress[]
  README.md          what the corpus is, how to extend it, how to regenerate the stress files
  markdown/          >= 100 hand-written documents (target >= 110)
  math/              formula cases; formulas.json plus human-readable per-category files
  stress/            GENERATED, never committed (gitignored) — see 4.4
scripts/gen-corpus-stress.mjs   deterministic generator, --out defaults to tests/corpus/stress/
scripts/verify-corpus.mjs       validator: manifest vs. files on disk; non-zero exit on any mismatch
```

### 4.2 Markdown documents

Spread across, and with each category in its own file: structure; lists (nested ≥3, task lists, loose vs tight,
`3.`-started, CJK punctuation); tables (simple, aligned, inline markup in cells, escaped pipes, in list items,
10-column, CJK-heavy, long-content wrapping); code (with/without info string, tilde, nested, `$`/`$$` inside code
that must stay literal, ` ```mermaid `, ` ```math `, js/ts/python/rust/go/java/sql/yaml/json/bash/diff/html/css);
math (all delimiter forms, environments, matrices, cases, Greek, limits/integrals/sums, `\ce{}`, `\pu{}`);
**math ambiguity** (deliberate: `$20 and $30`, `Prices: $5, $10, $15`, `\$100`, `$` in code, unclosed `\(`,
mid-paragraph `$$`, a lone unclosed `$$`); extras (footnotes incl. multi-paragraph, definition lists, `~sub~`,
`^sup^`, `==mark==`, hard breaks, autolinks, reference links, relative and intentionally missing images, external
links, HTML comments, valid and invalid YAML frontmatter, inline HTML, CJK+Latin typography); adversarial/security
(§2 layer 6 vectors); health-check fixtures (missing images, broken paths, unclosed fence, unclosed `$$`, duplicate
headings, inconsistent list markers, tab indentation, dangling `[a][missing]`); long-form chapters (5–10 realistic
300–800 line documents with a real outline, cross-references and mixed content).

**Language mix minimums:** ≥ 25 documents purely Chinese, ≥ 25 purely English, ≥ 20 mixed CJK/Latin within the
same paragraph. Chinese prose must be genuine technical/educational writing — no filler, no repetition.

**Manifest entry (per document):** `file`, `title`, `categories[]`, `language` (`zh|en|mixed`),
`expect { headings, tables, codeBlocks, math, images, footnotes, taskLists }`, `diagnostics[]` (expected
diagnostic codes) and `notes`. The `expect` counts and the diagnostic list are **assertions** — layer 1/3 compare
the pipeline's output against them, which is what turns the corpus from a fixture set into a test.

**Format rules:** UTF-8, LF, trailing newline, original content only (no copied copyrighted text).

### 4.3 Math cases

≥ 200 cases, each: `id`, `tex`, `display`, `delimiter`, `packages[]`, `expect ("render"|"error")`, `reason`
(`null` unless the case is an error), `category`. Coverage: fractions/roots/exponents/subscripts/primes/abs/norms;
sums/products/integrals (single, multiple, contour)/limits/derivatives/partials; matrices (`pmatrix`, `bmatrix`,
`vmatrix`, `Vmatrix`, `smallmatrix`, `array` with column specs); `cases`/`dcases`/`rcases`, `aligned`, `align`,
`align*`, `gather`, `split`, `multline`; Greek/operators/relations/arrows and the `\mathbb`/`\mathcal`/
`\mathfrak`/`\mathbf`/`\boldsymbol` families; `\left…\right`, `\bigl`, `\overbrace`, `\underbrace`,
`\xrightarrow`, `\overset`; spacing `\,` `\;` `\quad`, `\text{}`, `\operatorname{}`, `\mathrm{}`; colour
(`\textcolor`, `\color`), `\cancel`, `\boxed`; numbering (`\tag`, `\label`+`\ref`/`\eqref`, numbered `align`);
**≥ 40 mhchem cases** (reactions, states, arrows, charges, isotopes, hydrates, `\ce{}` inside `$$`, `\pu{}` with
units and scientific notation); every delimiter form represented; **≥ 25 error cases** (unknown macro
`\thisIsNotAMacro{}`, unclosed brace, unclosed environment, `\left(` without `\right)`, `\frac` missing an
argument, stray `&`, `\begin{matrix}` outside math, invalid mhchem) each with a `reason` describing what must be
reported.

### 4.4 Stress files (generated, not committed)

Deterministic generator `scripts/gen-corpus-stress.mjs` (`--out` defaults to `tests/corpus/stress/`), producing:
`huge-textbook.md` (~3 MB, 400 headings, 300 formulas, 100 tables), `math-dense.md` (~500 KB, 2000 display
formulas), `deep-nesting.md` (~200 KB, 30-level nested lists and blockquotes), `many-small-blocks.md` (~1 MB,
20000 short paragraphs), `wide-tables.md` (40 columns × 2000 rows). The generator must be **idempotent** and the
output must be byte-stable across runs (fixed seeds, LF, trailing newline). `tests/corpus/stress/` is gitignored;
`manifest.json` records the intended approximate size and content counts under `stress[]`.

### 4.5 Validation

`pnpm corpus:verify` (`node scripts/verify-corpus.mjs`) validates the manifest against the filesystem and
**exits non-zero** on any mismatch: missing/unlisted document, duplicate `file` or `id`, illegal `expect` value,
an error case without a `reason`, a document whose declared `categories` are empty, a language mix below the
minimums, invalid UTF-8, a missing trailing newline, CRLF, and every generated stress file that the manifest
promises but does not find (or vice versa). The validator is the single gate that keeps the corpus honest, and it
runs in the `verify` script chain.

---

## 5. Layer-to-requirement map (what proves which PRD requirement)

| PRD | Proving layer(s) |
|---|---|
| R-MODE-1…8 (four modes) | 3, 4 |
| R-A-2…R-A-14 (reading constructs) | 1 (structure/known counts), 3 (rendering + screenshots) |
| R-A-18, R-PRIO-3, R-PRIO-5 (large documents, no cap, no shift) | 5 (stress corpus), 3 (layout-shift assertion) |
| R-B-1…R-B-8 (math) | 1 (tokenization/ranges), 3 (MathJax report + screenshots), 4 (offline) |
| R-B-9…R-B-11 | 3 |
| R-C-1…R-C-10 (editing) | 3 (behaviour), 4 (real files), 2 (fidelity) |
| R-C-11, R-C-12, R-D-2, R-D-4 (no data loss) | **2** (property), 4 (real FS) |
| R-D-5, R-D-6 (export) | 3 (visual parity), 7 (offline export) |
| R-D-7, R-D-8 (association, portable, offline) | 7 |
| R-E-1…R-E-6 (differentiation) | 3 + 4 (operability), 1 (diagnostic codes) |
| R-N-1, R-N-2 (offline, security) | 6, 7 |
| R-N-3 (performance) | 5 |
| R-N-7 (distribution) | 7 |

---

## 6. Defect workflow and regression policy

1. **Reproduce minimally** — reduce the input to the smallest document that shows the defect; commit it as a
   corpus fixture or a unit case *before* the fix.
2. **Classify** — P0 (data loss, crash, security, wrong rendering of a supported construct), P1 (feature broken),
   P2 (cosmetic). P0/P1 must be zero before acceptance (PRD §10.6).
3. **Fix with its test** — the regression test asserts the *mechanism* (§1 principle 3), and for rendering defects
   it includes a MathJax-report assertion or a screenshot.
4. **Re-run the affected layers only**, then the full `pnpm verify` chain before a milestone is declared done.
5. **Record** — the defect, its minimal repro, the fix and the layer that now covers it go into the test report;
   fixes that weaken a test to pass are rejected and escalated instead.

---

## 7. Flakiness and hygiene rules

- Drivers, browsers and grammar versions are pinned; the WebDriver/WebView2 pair must match or the suite hangs
  (RESEARCH §9.5) — `autoDownloadEdgeDriver: true` plus a version assertion in the harness.
- The desktop suite runs with `maxInstances: 1`; a second app instance is a product feature (single-instance
  hand-off) and tests must not depend on process ordering.
- The corpus and the stress generator are deterministic; a diff in generated output means a generator change, and
  the manifest must be updated in the same change.
- Time-dependent behaviour (`readingMinutes`, mtime-based conflict detection) is asserted with injected clocks or
  tolerant ranges, never with real sleeps.
- Screenshot comparisons are reviewed, not auto-updated; `test:e2e:update` is a deliberate developer action and
  must appear as such in the change.
- No test may assert on prose (diagnostic `message` text) where a stable `code` exists — exception: the §3 rule,
  where MathJax's *own* message is the subject under test.
