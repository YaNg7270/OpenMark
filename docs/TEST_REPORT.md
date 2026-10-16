# TEST REPORT

Measured results for the OpenMark build. Every figure below was produced by running the
command next to it on this machine; nothing is carried over from an earlier report or
estimated.

- **Environment:** Windows 11 x64 (10.0.26200), Node 24.16.0, Rust 1.99.0 (project-local),
  WebView2 149.0.4022.62, Edge (system) for Playwright.
- **Date:** 2026-10-16
- **Commit:** the tip of `main` at the time of writing; the tree was clean for every run.

---

## 1. Summary

| Layer | Command | Result |
|---|---|---|
| Unit + DOM (Vitest) | `pnpm test` | **441 passed / 0 failed** (10 files) |
| Browser E2E (Playwright) | `pnpm test:e2e` | **59 passed / 0 failed** (incl. 7 screenshot baselines and 6 accessibility audits) |
| Desktop E2E (WebdriverIO) | `pnpm test:desktop` | **9 passed / 0 failed** (custom-protocol binary, no dev server running) |
| Rust unit | `cargo test --lib` | **12 passed / 0 failed** (3 export + 6 IPC wire-format contract + 3 asset-resolution) |
| Corpus validation | `pnpm corpus:verify` | **OK** — manifest matches disk |
| Corpus conformance | part of `pnpm test` | **300 assertions, 148/148 fixtures emit every declared diagnostic** |
| Type check | `pnpm typecheck` | clean |
| Frontend build | `pnpm build` | exit 0 |
| Installers | `pnpm desktop:build` | NSIS **9,521,072 B**, MSI **10,383,360 B** |
| Portable | `pnpm desktop:build:portable` | **10,061,771 B** zip (`openmark.exe` + `README.txt`), verified to keep app data in `./data` |

Installer byte counts move between builds (the packages embed a build timestamp); these are the
values from the artifacts under test, not invariants. The portable zip produced the same size in
two consecutive builds, which is suggestive but was not checked by hash.

All four test layers are green against the shipping artefacts, not against mocks: Playwright
drives the minified production bundle in the same engine family as the app runtime, and
WebdriverIO drives the compiled `openmark.exe` over WebView2.

---

## 2. Unit and DOM tests — 441

| File | Tests | What it establishes |
|---|---:|---|
| `tests/unit/corpus.test.ts` | 300 | All 148 fixtures parse, match their declared counts, and emit every declared diagnostic; plus four cross-cutting invariants (determinism, block-range integrity, no throw, no orphan placeholders) |
| `tests/unit/table.test.ts` | 36 | Table parsing and serialisation, including a fixed-point round-trip and CJK/emoji column widths |
| `tests/unit/dom/sanitize.test.ts` | 23 | The sanitiser's security boundary and its preservation duty |
| `tests/unit/dom/images.test.ts` | 7 | Relative image sources are rewritten to loadable URLs; traversal is refused without touching the filesystem |
| `tests/unit/dom/external-change.test.ts` | 6 | Every interleaving of the external-change probe: a real change is reported, an autosave landing mid-probe is not, a probe in flight cannot blame a document opened meanwhile, a deleted file is not a change. Hand-driven promise ordering — no test waits on the clock, and both race cases fail on the previous implementation |
| `tests/unit/encoding.test.ts` | 20 | BOM/EOL detection and byte-exact round-trip |
| `tests/unit/assets.test.ts` | 20 | Image asset naming, placement and the browser fallback |
| `tests/unit/markdown-blocks.test.ts` | 13 | Block decomposition and the splice invariant the instant editor depends on |
| `tests/unit/math-source.test.ts` | 11 | Formula source reconstruction for every delimiter form |
| `tests/unit/roundtrip.test.ts` | 4 | Identity, edit, block-edit and property-based (fast-check) preservation |

### What the corpus is

- **148** markdown documents across structure, lists, tables, code, maths, ambiguity,
  extras, security, health checks, **Chinese prose (35), English (82) and mixed (31)**.
- **355** formula cases, of which **40** are expected-error cases.
- **5** generated stress fixtures (3.0 MB textbook, 2000 formulas, 40×2000 table, 30-level
  nesting, 20 000 blocks).
- The manifest is validated against the bytes on disk by `pnpm corpus:verify`, so a fixture
  edited without updating its expectations fails the build.

### Formula testing standard

Formula tests do not assert that a `mjx-container` exists. They assert on **MathJax's own
report** and on real output:

- Every expression must produce more than three SVG glyph elements, so an empty container
  cannot pass.
- Any request to a non-localhost origin fails the suite — the only reliable detector, since
  MathJax's loader falls back to a CDN when a font path is wrong, which would look fine on a
  developer machine and fail in the packaged offline app.
- A failing expression must be reported per-expression and must keep its source.

---

## 3. Browser E2E — 59

Runs against the production build served by `vite preview`, in the system Edge channel
(`channel: 'msedge'`), so no browser download is required and the engine family matches
WebView2.

| Group | Tests | Coverage |
|---|---:|---|
| Critical path | 10 | shell loads with zero external requests; mixed document (headings, GFM table, task list, footnote, code); **LaTeX and mhchem typeset to real glyphs, offline**; broken formula keeps its source and is reported; currency is not mistaken for maths; Mermaid renders to SVG; outline; hostile HTML neutralised; appearance settings; theme |
| Instant rendering | 5 | block decomposition; editing one block leaves the others byte-identical; LF stays LF; **CRLF stays CRLF after an instant edit**; CRLF stays CRLF after a source-mode edit; Escape commits and exits; read-only refuses editing |
| Source editor | 4 | undo/redo; undo history does not cross into another document; markdown syntax highlighting; line numbers |
| Session state | 3 | recent files ordered most-recent-first; reading position restored on reopen; a file can be removed |
| Formula tools | 4 | copy as LaTeX; edit through the dialog splices only that formula; a broken formula is reported without losing the source; a maths fence stays intact |
| Export | 2 | the produced HTML contains typeset maths, inline SVG and inlined styles, and **no script tag**; export is disabled until the document has a path |
| Writing modes & images | 3 | typewriter mode keeps the caret in view while typing; a dropped image becomes an insertion rather than a document; a pasted image is written beside the file |
| Table editor | 3 | the grid opens from a table block; opening and closing it does **not** rewrite the file; cell edits, row and column additions and deletions reach the source and leave the rest of the document alone |
| Tabs | 4 | a second document opens in its own tab and switching restores it; unsaved edits survive a switch and the dirty marker follows the tab; reopening an open file brings its tab forward instead of duplicating it; closing activates the neighbour |
| Find & replace | 3 | replace-all rewrites every occurrence in the source and nothing else; the query is treated as literal text (`$&` is not a backreference); CRLF survives |
| Visual baselines | 7 | reading mode, instant mode, source mode, the diagnostics panel, the formula dialog, the table editor and **two tabs** |
| File commands | 3 | New opens its own tab and leaves the open document intact; save defers to save-as without a path; Ctrl+N and Ctrl+Shift+S are wired |
| Split view | 1 | both panes stay on the same region, asserted in *both* directions — a one-way sync would pass a test that only scrolled one side |
| Accessibility | 6 | axe-core runs against the shell, all four view modes, every side panel and both dialogs; any violation fails |

---

## 4. Desktop E2E — 9

Drives the compiled `openmark.exe` over WebDriver via `tauri-driver` and `msedgedriver`,
attaching to WebView2 149.0.4022.62. The binary under test must be a **`custom-protocol`**
build — `tauri build --debug --no-bundle`, or the release build. The suite was run against both,
and the block below is the release run, so the shipped artefact is exercised directly rather
than only a development build.

```
Running against src-tauri/target/release/openmark.exe:
✓ does not report an external change when nothing has touched the file
✓ reports an external change once the file is actually touched
✓ resolves a relative image reference through the real command
✓ launches the real binary and renders the application shell
✓ renders the toolbar with its document name element
✓ opens the fixture through the shell open-file event
✓ switches to source mode and shows the raw markdown
✓ typesets a display formula into real MathJax glyphs
✓ flags a broken formula as an error without losing its source
9 passing (14.2s)
```

The first two are the regression tests for the false «文件已被其他程序修改» banner (defect 22); the
third is the regression test for relative images never loading (defect 25), and it is the only test
in the repository that can catch a mismatch between the arguments the frontend sends and the ones a
command declares — the unit test stubs the bridge and computes the answer itself.
The first opens a scratch document that nothing touches and asserts no banner appears across
three poll intervals; the second pushes the file's mtime forward from outside the application
and asserts the banner **does** appear — so an attempt to fix the first by disabling the probe
would fail the suite.

The fixture is opened through the same `openmark://open-file` event Windows uses for
"Open with", rather than by a test-only path, so the OS integration is exercised too.

Three blockers were diagnosed and are now encoded in the harness so they cannot recur:

1. `@wdio/tauri-service` finds the toolchain by looking for `cargo` on `PATH`. Rust is
   deliberately project-local here, so the service reported "Rust toolchain not found" before
   starting a driver. The launcher passes `CARGO_HOME`, `RUSTUP_HOME` and a `PATH` including a
   space-free junction, because `cmd.exe` truncates an unquoted executable path containing a
   space and this repository's path contains one.
2. A leftover `openmark.exe` from an earlier attempt made every new launch exit immediately —
   the single-instance plugin forwards to the running copy — which the driver reports as
   "Chrome instance exited", pointing nowhere near the cause.
3. **A stale or dev-server binary passes nothing, and the failure misattributes itself.** The
   frontend is embedded only in a `custom-protocol` build (`tauri-2.12.4/build.rs`:
   `dev = !custom_protocol`), and `tauri_build::build()` does not watch `frontendDist`, so
   neither a plain `cargo build` nor a `dist/` rebuild alone produces a binary that talks to a
   live frontend. Both land at `src-tauri/target/debug/openmark.exe`. `src-tauri/build.rs` now
   declares `rerun-if-changed=../dist`, and `scripts/run-desktop-e2e.mjs` refuses to start
   against a binary older than `dist/`. See defects 24 and the correction note in PROGRESS §2.

---

## 5. Performance

`node --expose-gc scripts/perf-parse.mjs` — median of 5 runs. This measures the **synchronous**
pass (tokenise, resolve positions, build blocks, render HTML), which is what runs on every
keystroke in instant mode. Typesetting, diagrams and highlighting are excluded: they are lazy
and bounded by the viewport.

| Fixture | Size | Lines | Parse | Throughput | Blocks | Formulas | Heap growth |
|---|---:|---:|---:|---:|---:|---:|---:|
| `huge-textbook.md` | 2.96 MB | 9 785 | **176 ms** | 16.8 MB/s | 4 392 | 300 | 69 MB |
| `many-small-blocks.md` | 1.07 MB | 40 002 | 169 ms | 6.3 MB/s | 20 001 | 0 | 66 MB |
| `wide-tables.md` | 0.62 MB | 2 005 | **455 ms** | 1.4 MB/s | 2 | 0 | 123 MB |
| `math-dense.md` | 0.54 MB | 12 002 | 49 ms | 11.0 MB/s | 4 001 | 2 000 | 28 MB |
| `deep-nesting.md` | 0.19 MB | 992 | 47 ms | 4.0 MB/s | 61 | 0 | 6.5 MB |

**Budgets (2026-10-16).** `pnpm perf:check` runs the same benchmark and fails when a fixture's
median exceeds its budget in `scripts/perf-budget.json` (about 2-5x the reference medians, so it
catches an algorithmic regression rather than machine noise), or when a budgeted fixture is
missing. A re-measure after top-level blocks gained `data-om-line` anchors (for keeping the
reading position across view modes) put `many-small-blocks.md` at ~140 ms against ~127 ms
before: about 10% for tagging 20 000 blocks. The other fixtures were unchanged within noise;
`deep-nesting.md` is bimodal (18 or ~50 ms) with either engine, which is garbage collection.

Reading these numbers honestly:

- A 3 MB textbook opens in **176 ms**, and that is also the per-edit budget in instant mode.
  Acceptable; not instant, but not perceptible as a stall either.
- **Wide tables are the outlier at 455 ms.** Profiling the widest fixture attributes
  **143 ms of the 194 ms measured in isolation** to markdown-it's own tokenizer; a 40-column
  2000-row table produces **250 134 tokens**, and the cost is the token stream, not this
  project's passes over it. This fixture is deliberately pathological.
- "Heap growth" is growth across the parse, dominated by that transient token stream. It is
  reclaimed by the next collection; it is not retained by the document. An earlier revision of
  the harness reported large *negative* numbers because it collected the heap before reading —
  that has been fixed.

### Performance work done this session

- **Block HTML is rendered lazily** (first access, not up front). The reading view never reads
  it, and rendering every block eagerly doubled the cost of opening a document. Measured on the
  nesting fixture: 31 ms → 12 ms.
- Task-list ids are namespaced per block, which is what makes that laziness possible without a
  global counter.

---

## 6. Defects found by these tests, and fixed

The value of the suite is best shown by what it caught. Every one of these was found by a test
or a review, not by inspection, and every one has regression coverage.

| # | Defect | Impact if shipped |
|---|---|---|
| 1 | `KEEP_CONTENT: false` on DOMPurify deleted **every text node** | The page rendered as a set of empty elements — looks like a CSS fault, is a total failure |
| 2 | A narrowed `ALLOWED_URI_REGEXP` deleted relative URLs | **Every relative image and internal link silently removed**; also broke `type="checkbox"` |
| 3 | `markdown-it-task-lists` generates ids with `Math.random()` | Two parses of one document produced different HTML; breaks screenshot comparison, reproducible export, content-addressed caching |
| 4 | The source editor rewrote **every line ending** in a CRLF file | A whole-file diff after editing one character; a `<textarea>` cannot hold CRLF, so the editor had been committing normalised text |
| 5 | `for` was missing from the attribute allow-list | Every task-list label lost its association with its checkbox |
| 6 | The formula rebuilder searched for the body from the start of the raw text | `\begin{cases}` ends in `a`, so editing a one-character body would have **destroyed the environment** |
| 7 | A zustand selector returned `?? []` | Infinite render loop; the app never mounted |
| 8 | `engine.render()` crashed when called without an `env` | Any consumer that only wanted HTML got an exception |
| 9 | Invalid YAML frontmatter was reported under a maths diagnostic code | Misleading diagnostics |
| 10 | `dist/` was deleted by a concurrent process during a test run | Cost real debugging time; now documented as a coordination hazard |
| 11 | `rememberPosition` resolved the document path at **save** time | A tab switch mutates the DOM before running the outgoing view's effect cleanup, so the cleanup filed its position under the arriving document — losing the reader's place in the one they left. Affected ordinary use, not only tab switching |
| 12 | Restoring a reading position animated down from the top | The scrolling container has `scroll-behavior: smooth`; smooth is right for a clicked link and wrong for a restore. Saved and restored offsets now match exactly |
| 13 | Binary image bytes were routed through the text writer | The text path preserves BOM and line endings, so it rewrites every `\r\n` byte pair inside a PNG — corrupting the file |
| 14 | The window drop handler tested `defaultPrevented` after calling `preventDefault()` | The guard always fired, so **every** drop silently did nothing |
| 15 | `\\|` in a table cell merged two cells into one | An escaped backslash followed by a real separator was read as an escaped pipe |
| 16 | The formula rebuilder searched for the body from the start of the raw text | `\begin{cases}` ends in `a`, so editing a one-character body would have destroyed the environment |
| 17 | A view signature omitted the active tab | Bringing a parked tab forward left the previous document's typeset output on screen |
| 18 | **Nothing ever called the relative-image resolver** | Every local image in every document rendered as a broken icon. The function was correct; the caller was missing, which is exactly the class of defect a unit test in isolation cannot see |
| 19 | The tab bar was a fourth child of a three-row grid | When it appeared it displaced every other child by one track, putting the sidebar on top of it. None of the existing baselines could catch it: they all ran with a single document, where the bar renders nothing |
| 20 | `newDocument` replaced the active tab's contents | "New" silently discarded the open document, with no way back. It now opens its own tab unless the current one is unused |
| 21 | `write_text_file_atomic` ignored the caller's expected mtime | The documented clobber guard was not enforced where the write happens, so a change made between two polls of the external-change watcher would be overwritten |
| 22 | Four IPC response structs serialised `snake_case` while the TypeScript layer read `camelCase` | **Reported from real use.** `mtimeMs`/`isDir`/`backupPath` arrived as `undefined`, so «文件已被其他程序修改» was raised on every document seconds after opening it — and because the mtime returned by a save was `undefined` too, defect 21's clobber guard silently disarmed itself after the first save. Found by the user, not by the suite: no layer asserted the wire format until the tests added for it |
| 23 | `checkExternalChange()` compared against a pre-`await` snapshot of `doc` | An autosave completing mid-probe re-raised the banner over a document the save handler had just cleared, and left it standing. The comparison now runs inside the state updater against the live document |
| 24 | The desktop E2E could drive a binary that did not contain the code under test | `tauri_build::build()` does not watch `frontendDist`, so rebuilding `dist/` left the binary stale while cargo reported success — a stale binary launches, renders and passes. Separately, `dev = !custom_protocol` means a plain `cargo build` yields a dev-server binary that renders nothing at all. Both made this layer's earlier green runs mean less than they appeared to |
| 25 | `resolve_asset_url` took `path`; both call sites send `{documentPath, relativePath}` | **Every relative image in every document rendered as a broken placeholder**, and the health check reported each one as missing — the required "local relative path" reading feature did not work. Tauri refuses to deserialise a command whose required argument is absent, so the invoke rejected and `resolveLocalImages` marked the image missing. The unit test could not see it: its stub reads `relativePath` and fabricates the resolved path itself, so it agreed with a contract the command did not have |

Corpus corrections: three fixtures or manifest entries were themselves wrong (an "unclosed
fence" fixture that contained a closing fence; a manifest entry pinning a code the parser no
longer emits; an entry declaring a diagnostic the fixture's content cannot produce). These are
recorded rather than quietly adjusted, because a corpus that lies about its expectations is
worse than no corpus.

---

## 7. Accessibility

`tests/e2e/a11y.spec.ts` runs the axe-core ruleset against the shell, all four view modes, every
side panel and both dialogs, and fails on any violation. Only the `region` rule is disabled, and
for a stated reason: the application is a single-window desktop shell, not a web page, so forcing
a landmark structure onto it would produce rules-compliance rather than usability.

It found six real problems, all fixed and now enforced:

| Finding | Why it mattered |
|---|---|
| Focusable content inside `aria-hidden` | The code block toolbar was marked decorative while holding a copy button — reachable but invisible to assistive technology |
| Faint text at 2.92:1 contrast | Below the 4.5:1 minimum for body-size text; de-emphasised still has to be readable |
| Accent text at 3.98:1 on the soft accent background | Same threshold, on the active outline entry |
| Formulas had no accessible name | Disabling MathJax's enrichment removed the label that normally supplies one, so a screen reader announced an unlabelled graphic |
| Diagrams had no accessible name | The same, for Mermaid output |
| The editor was not a tab stop | Its scroll region therefore had no keyboard access at all |
| No level-one heading | A screen reader arriving in the window was not told which document was open |

## 8. Security verification

| Property | Evidence |
|---|---|
| No remote requests while rendering | Browser E2E fails on any non-localhost request; asserted in three suites |
| Scripts never execute | Hostile fixtures assert `window.__pwned` is undefined and no `<script>` survives |
| Sanitisation happens **before** typesetting | Math, Mermaid and code are empty placeholders when DOMPurify runs, so untrusted markup never reaches the DOM and library output never passes an allow-list |
| Path traversal is refused without touching the filesystem | `classifyRelativePath` rejects a net climb of two or more levels (one level up is ordinary: `../assets/logo.png`); percent-encoding is decoded first |
| The export applies the same boundary | `read_export_asset` checks the canonical path against the document's folder plus one level and inlines only `image/*`; three Rust tests in `src-tauri/src/export.rs` |
| Formula output cannot carry links, ids or styles the document chose | MathJax output bypasses DOMPurify, so `ui/safe` filters it (`javascript:`/`data:`/`file:` links dropped, ids and classes limited to `mjx-*`, `\style` reduced to harmless properties); `rendering.spec.ts` › "formulas cannot inject…" |
| Exported HTML carries no behaviour | The export test asserts no `<script>` in the produced file |

Known gaps: dependency licences are documented in `docs/LICENSE_NOTICES.md`, which records two
weak-copyleft obligations (MPL-2.0 code linked into the Rust binary via `tauri-build`'s feature
unification, and EPL-2.0 `elkjs` bundled through Mermaid). Neither affects OpenMark's own
licensing; both require shipping the respective licence texts, which the repository does.

---

## 9. What is **not** verified

Stated plainly, because a test report that only lists successes is not a test report:

1. **The MSI installer was not install-tested.** It is `ALLUSERS=1` (per-machine, needs
   elevation). The per-user NSIS package was installed, smoke-launched and uninstalled cleanly.
3. **Both installers are unsigned.** Installing a locally-built copy produced no SmartScreen
   prompt because the file carries no Mark-of-the-Web; a copy downloaded from the internet will
   show "Windows protects your PC" with an unknown-publisher warning.
4. **File association was verified by configuration and by the Rust argument pipeline, not by
   double-clicking a `.md` after installation.**
5. **Memory over a long session was not profiled.** The figures above are heap growth across a
   single parse, not resident memory during extended use.
6. **MathJax's semantic enrichment, speech and Braille are off by default**, because the SRE web
   worker made rendering non-deterministic. The payload is vendored so they can be re-enabled
   once its lifecycle is handled explicitly. In the meantime each formula carries its LaTeX as
   an accessible name, which is information but not spoken mathematics.
7. **Stress fixtures are generated, not committed** — a fresh clone must run
   `node scripts/gen-corpus-stress.mjs` before the performance harness has anything to measure.
8. **Screenshot baselines are environment-sensitive.** They were generated on the machine
   described at the top of this report; a different font set will produce different pixels.
   Regenerate with `pnpm test:e2e:update` in the environment that will run them.

### On the value of the screenshot baselines

They were verified to have teeth rather than assumed to: setting the table cell border to
`4px solid red` fails the reading, instant and table-editor captures. That check also exposed a
real weakness in the first version — a viewport-sized capture of a long document only sees its
top, so a table regression passed. The captures now target the document element, which is the
full height regardless of the scroll container.

---

## 10. Reproducing this report

```bash
source scripts/env.sh                 # or follow the absolute-path invocations in SESSION_HANDOFF.md
pnpm install
pnpm typecheck && pnpm test && pnpm corpus:verify
pnpm build && pnpm test:e2e
pnpm desktop:dev                      # interactive
pnpm tauri build --debug --no-bundle  # custom-protocol; a plain `cargo build` will NOT do
pnpm test:desktop
OPENMARK_BINARY=src-tauri/target/release/openmark.exe pnpm test:desktop   # against the shipped binary
node scripts/gen-corpus-stress.mjs && node --expose-gc scripts/perf-parse.mjs
```
