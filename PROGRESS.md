# PROGRESS

Living ledger for the OpenMark build. Updated at the end of every work session.

- **Product:** OpenMark — Windows 11 desktop Markdown reader/editor (Typora-class instant
  rendering, high-fidelity LaTeX/mhchem, immersive long-document reading).
- **Stack as built:** Tauri 2.12 (Rust 1.99) + React 19 + TypeScript 7 + Vite 8,
  `markdown-it@15` + GFM plugins, MathJax 4.1.3 (SVG output, mhchem), Mermaid 12, Shiki 4,
  DOMPurify 3.4.
- **Last updated:** 2026-10-16 (session 2 — a field-reported defect in the external-change
  probe, plus the two harness faults it exposed; see §2.9-2.12)

---

## 1. Where the project stands

All five phases are complete. Every feature the goal lists as required is implemented and
verified: four view modes including Typora-style instant rendering, multi-tab documents with
recent files and last-reading-position memory, table grid editing, image paste and drop with
asset management, offline LaTeX and chemistry with copy and edit tools, document diagnostics
and health checks, HTML and PDF export, and Windows installers plus a portable package. Four
test layers pass against the shipping artefacts.

What remains is not implementation work but the honest gaps recorded in
`docs/TEST_REPORT.md` §9 — chiefly that neither installer is code-signed and the MSI was not
install-tested.

Session 2 fixed a defect reported from real use — the «文件已被其他程序修改» banner appeared on
every document — and, in verifying it, found two faults in the test harness itself that had been
making the desktop layer's green runs mean less than they appeared to. §2.9-2.12 record all
three, and the correction note there supersedes the previous desktop number.

### Verified in this session (current evidence, not carried-over claims)

| Check | Command | Result |
|---|---|---|
| Rust toolchain | `cargo -V` (project-local) | 1.99.0, MSVC 14.44 linker verified with a smoke build |
| Type check | `tsc --noEmit` | clean |
| Frontend build | `vite build` | exit 0 |
| Windows binary | `tauri build` | `src-tauri/target/release/openmark.exe`, 14,484,992 bytes, boots |
| Rust check | `cargo check` | zero warnings |
| Browser E2E | `playwright test` | **59 passed** (incl. 7 screenshot baselines and 6 axe-core accessibility audits) |
| Desktop E2E | `pnpm test:desktop` | **8 passed** (custom-protocol debug binary, WebView2 149, no dev server running) |
| Rust unit | `cargo test --lib` | **9 passed** (3 export + 6 IPC wire-format contract) |
| Unit + DOM tests | `vitest run` | **440 passed** (incl. 300 corpus-conformance assertions and 6 external-change races) |
| Windows installers | `pnpm desktop:build` | NSIS 9,523,349 B, MSI 10,383,360 B; portable zip 10,061,234 B via `desktop:build:portable` |
| Desktop binary | direct launch | debug build boots and stays alive; release build verified |
| Corpus validation | `node scripts/verify-corpus.mjs` | OK — manifest matches disk |
| Corpus diagnostics | `vitest run corpus.test.ts` | **148/148 fixtures emit every declared diagnostic** |
| Corpus size | — | 148 markdown docs, 355 formula cases (40 expected-error), 5 stress fixtures |

### Milestone: the editing feature set is complete

Instant rendering, multi-tab documents, a table grid editor, image paste and drag with asset
management, CodeMirror 6 source editing, typewriter mode and find/replace are all in place.
The through-line is that every editing path splices the **authoritative source** rather than
re-serialising a document model, which is what makes a WYSIWYG experience compatible with a
byte-preservation guarantee.

Building them found seven more real defects, including two that affected ordinary use: the
reading-position save resolved its path at save time, so switching documents filed the
position under the wrong file; and restoring a position animated down from the top because
the scrolling container has `scroll-behavior: smooth`.

### Milestone: every declared diagnostic is now emitted

The corpus declares the diagnostics each fixture should produce, including codes the parser did
not yet emit; the conformance suite therefore doubles as a progress meter. That number went
from 133/148 to **148/148** this session.

An independent review then found that the `DiagnosticCode` union still contained 11 members
with no emit site — a wish list rather than a contract. Six were implemented
(`unclosed-html-comment`, `duplicate-footnote`, `setext-heading-ambiguity`,
`math-unbalanced-environment`, `math-unknown-macro`, and the encoding facts `bom-detected` /
`mixed-line-endings` / `invalid-utf8`), and three were removed because they described things
that are not defects. The union now stands at **26 declared, 26 emitted, 0 unused**, and a
check for that is cheap to re-run.

### Milestone: all four view modes implemented

Read, instant, source and split all work. Instant rendering is the significant one: the
parser now exposes every top-level block with its exact source range and its own HTML, and
clicking a block turns just that block into a source editor. An edit is committed by splicing
text into the authoritative source at the block's range, so a block the user did not touch
cannot change — not its list markers, not its fence info string, not its line endings. This
is the mechanism that makes the no-data-loss guarantee compatible with a WYSIWYG experience,
and it is the foundation the CodeMirror 6 editor will plug into.

### Milestone: offline MathJax proven

The riskiest unknown was whether MathJax 4 could render **real glyphs with zero network
access**. It does, and the E2E suite proves it rather than assuming it:

- Every expression is asserted to produce more than three SVG glyph elements, so an empty
  `mjx-container` cannot pass.
- The suite fails on *any* request to a non-localhost origin, which is the only reliable
  detector — MathJax's loader silently falls back to a CDN when a font path is wrong.
- Two font packages are vendored (`mathjax-newcm-font`, `mathjax-mhchem-font-extension`)
  because chemistry silently degrades to missing glyphs without the second one.

---

## 2. Defects found and fixed this session

Each of these was found by a test, not by inspection. All have regression coverage.

1. **`KEEP_CONTENT: false` deleted every text node.** The page rendered as a set of empty
   paragraphs, which looks exactly like a CSS fault. Pinned in
   `tests/unit/dom/sanitize.test.ts`.
2. **A narrowed `ALLOWED_URI_REGEXP` silently deleted relative URLs.** The pattern read as
   stricter but removed the relative-URL branch DOMPurify relies on, so `href="./next.md"`,
   `src="img/fig-1.png"`, `href="#top"` and even `type="checkbox"` were stripped — a
   document with no images, no internal links, and text-field checkboxes. Six dedicated
   regression cases now cover it.
3. **Infinite render loop (React #185) at startup.** A zustand selector returned `?? []`,
   allocating a new array on every store read. `.om-shell` never mounted. Fixed with a
   module-level `NO_OUTLINE` constant.
4. **The parser crashed when `engine.render(src)` was called without an `env`.** Reasonable
   for any consumer that only wants HTML. The engine now builds its own `LineIndex` and
   collector on demand.
5. **`dist/` was deleted by a concurrent agent** mid-build, breaking the test server.
   Resolved by coordination; noted here because it cost real debugging time.
6. **Playwright never reached the web server:** Vite preview bound IPv6 `localhost` while
   the readiness probe polled the IPv4 literal. Fixed with `--host 127.0.0.1`.
7. **A wrong diagnostic code:** invalid YAML frontmatter was reported as
   `math-unbalanced-braces`. Now `invalid-frontmatter`.
8. **The source editor rewrote every line ending in a CRLF file.** A `<textarea>` cannot hold
   CRLF — the HTML specification normalises line breaks in its `value` IDL attribute — so
   committing `element.value` directly converted the whole file to LF on the next save. The
   symptom is a whole-file diff after editing one character. Editors now work in normalised
   space and the store restores the document's own style. Pinned by an E2E test that appends
   to a CRLF file and asserts no bare LF survives.
9. **«文件已被其他程序修改» appeared on every document, seconds after opening it** — reported
   from real use, not by a test. Serde's default is the Rust field name, so `FilePayload`,
   `WriteResult`, `FileStat` and `DirEntryInfo` serialised `mtime_ms` / `is_dir` /
   `backup_path` while `src/core/fs/fileService.ts` declared `mtimeMs` / `isDir` / `backupPath`.
   Every underscored field arrived as `undefined`, so `checkExternalChange()` compared a real
   timestamp against `undefined` on each 2.5 s poll and always concluded the file had changed.
   The same mistake silently disabled the clobber guard *after the first save*: the mtime
   returned by the write was `undefined`, and that was then sent back as `expectedMtimeMs`, so
   `write_text_file_atomic` saw no expectation to enforce. Fixed with
   `#[serde(rename_all = "camelCase")]` on all four structs — `mtimeMs` is the value the
   frontend always meant to read. The TypeScript interfaces were already correct, which is why
   the compiler could not see it; the contract is now pinned on the side that produces the
   bytes, by `commands.rs` unit tests that assert the JSON key names.
10. **The external-change probe could fire on our own save.** `checkExternalChange()` took a
    snapshot of `doc` before `await`ing the IPC probe and compared against that snapshot
    afterwards. An autosave landing during the probe writes a new mtime, and the save handler
    clears the banner when it resolves — so if the probe's verdict arrived afterwards it
    re-raised the banner over a clean document and left it standing. The comparison now runs
    inside the state updater against the live document, which also stops a probe that was in
    flight from blaming a document the user opened meanwhile. Pinned by
    `tests/unit/dom/external-change.test.ts`: both races fail on the previous implementation and
    pass on this one.
11. **The desktop E2E could drive a binary that did not contain the code under test.**
    `tauri_build::build()` does not watch `frontendDist`, so rebuilding `dist/` left
    `src-tauri/target/debug/openmark.exe` untouched while cargo reported "Finished". The stale
    binary launches, renders, and passes — it is simply not the code being changed. Found when a
    debug binary timestamped *older* than `dist/index.html` was still being driven by the suite.
    `src-tauri/build.rs` now declares `rerun-if-changed=../dist` so cargo re-embeds the frontend
    (verified: a no-op build stays a no-op, `touch dist/index.html` forces a recompile), and
    `scripts/run-desktop-e2e.mjs` refuses to start when the binary predates `dist/`.
12. **`cargo build` produces a binary that cannot render — the entire desktop suite failed
    against one.** `tauri-2.12.4/build.rs` sets `dev = !custom_protocol`, and the `custom-protocol`
    feature is what makes the build embed `dist/`; without it the binary loads `devUrl`
    (`http://localhost:1420`) instead. `tauri build --debug` enables it, plain `cargo build`
    does not, and both write to `src-tauri/target/debug/openmark.exe` — so a plain `cargo build`
    silently replaces a working binary with a dev-server one. Every test then failed with
    "element wasn't found" and "placeholder never rendered", which reads as a broken frontend
    rather than a wrong build command. Found by checking the timestamp of the failing binary
    against `dist/` and then reading `is_dev()`. Recorded because it is invisible: the build
    succeeds, the app launches, and the window is simply empty.

### Correction: earlier desktop evidence was against a dev-server binary

Defect 12 invalidates part of the previous session's desktop run. `6 passed` was real, but the
binary under test was loading `http://localhost:1420` from a Vite dev server rather than the
`dist/` it appeared to be testing, so it exercised current *source* instead of a packaged build.
That is not the claim the layer advertises, and the number is superseded below by a run against
a `custom-protocol` binary with no dev server listening. The `8 passed` recorded in §1 is the
first desktop result in this project that is what it says it is.

### Session note: the wire-format audit

Because defect 9 was a *contract* mismatch that no TypeScript check can catch, every
`invoke<T>` in the frontend was audited against its Rust producer. The complete set is: the four
`commands.rs` structs above (now camelCase); `ExportAsset` and `PdfReport` in `export.rs`, which
are `relative_path` / `page_count` on **both** sides and therefore consistent — an intentional
exception, pinned by its own contract tests so a future rename cannot break it silently; and
eight commands returning primitives (`String`, `bool`), where no field naming exists to get
wrong.

---

## 3. Architecture decisions taken (with reasons)

- **No third-party editor kernel.** Both candidates were evaluated by measurement and both
  fail the no-data-loss requirement: Vditor's `ir`/`wysiwyg` modes re-serialise Markdown
  from the DOM (measured rewrite of hard breaks, CRLF, fence info strings, table delimiters),
  and Milkdown's ProseMirror document is the source of truth, so `getMarkdown()` always
  re-serialises (frontmatter destroyed, entities and reference links normalised). The
  authoritative-source model plus a patch-based editor is the only design that satisfies
  "opening and saving must not change the file". See `docs/RESEARCH.md` §7.
- **MathJax runs only in the browser.** MathJax 4's Node component loader passes bare
  Windows paths (`D:/…`) to `import()`, which requires a `file://` URL, so it cannot boot
  under Node on this platform at all. Vitest therefore covers tokenising and diagnostics;
  Playwright covers rendering. This is a stronger split than testing it in Node would be.
- **Sanitise before typesetting.** Math, Mermaid and code are empty placeholders when
  DOMPurify runs, so untrusted markup never reaches the DOM and the library output never has
  to pass through an allow-list. This avoids the usual compromise of having to permit
  `<use>` and `foreignObject`.
- **Appearance via CSS custom properties.** Settings write variables on `<html>`; no
  component reads a setting to decide styling, so changing page width or formula scale is a
  style recalculation rather than a re-parse.
- **Lazy typesetting, with one exception.** Placeholders fill on viewport approach; a
  document that uses equation numbering is typeset eagerly and in document order, because
  AMS tags would otherwise be assigned in scroll order.

---

## 4. Open problems

### P0 — none outstanding.

### P1

1. **The MSI installer is not install-tested**, and neither installer is code-signed. This is an
   environment limitation (elevation), not a defect.
2. **Typewriter mode centres on typing only**, not on caret movement from arrow keys.
4. **Find and replace steps through one match at a time only in source mode.** A per-match
   control in the reading view needs a source offset for a DOM match, which is not reliable. Instant mode edits whole blocks, so a
   table can be edited as text, but there is no grid editor and no paste/drag image handling.


### P2

6. **MathJax's semantic enrichment is disabled by default.** v4 enables semantic enrichment, speech
   and Braille by default, which spins up an SRE web worker and made rendering
   non-deterministic in testing. The payload is vendored, so this can be turned on once the
   worker lifecycle is handled explicitly.
7. **`Cargo.toml` declares `rust-version = "1.77.2"`** against Tauri 2.12's requirement of
   Rust ≥ 1.90. Harmless locally (1.99 is installed) but wrong.
8. **A machine-level junction `C:\omkth` → `<repo>\.tools`** exists so the Tauri CLI can see
   the project-local toolchain through this shell's PATH handling. Remove with
   `rmdir C:\omkth`; it is not needed for ordinary builds.

---

## 5. Next actions, in priority order

1. **Screenshot regression baselines**, so a typography change cannot slip through.
2. **Find and replace in the reading view.** Source mode has CodeMirror's panel already.
3. **MathJax semantic enrichment** — the payload is vendored but disabled; enabling it needs the
   SRE worker lifecycle handled explicitly. The axe audit is in place, so the change would be
   checked rather than hoped for.
4. **Code signing**, which is the only way to remove the SmartScreen warning for downloaded
   installers.
5. **MSI install test** on a machine where elevation is available.

---

## 6. How to run everything

```bash
# toolchain (project-local Rust; nothing global is modified)
source scripts/env.sh

pnpm install
pnpm build                 # also vendors MathJax into public/
pnpm test                  # Vitest, unit + dom projects
pnpm test:e2e              # Playwright against the production build, Edge channel
pnpm test:desktop          # WebdriverIO against the real Windows binary
pnpm corpus:verify         # corpus manifest ⇄ disk
pnpm typecheck && pnpm lint

# desktop
pnpm desktop:dev
pnpm desktop:build         # installer + binary
```
