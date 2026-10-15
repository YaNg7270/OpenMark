# PROGRESS

Living ledger for the OpenMark build. Updated at the end of every work session.

- **Product:** OpenMark — Windows 11 desktop Markdown reader/editor (Typora-class instant
  rendering, high-fidelity LaTeX/mhchem, immersive long-document reading).
- **Stack as built:** Tauri 2.12 (Rust 1.99) + React 19 + TypeScript 7 + Vite 8,
  `markdown-it@15` + GFM plugins, MathJax 4.1.3 (SVG output, mhchem), Mermaid 12, Shiki 4,
  DOMPurify 3.4.
- **Last updated:** 2026-10-16 (session 1)

---

## 1. Where the project stands

Phase 0 is complete and Phase 1 is largely complete. The application builds, runs as a real
Windows desktop binary, reads Markdown correctly, renders LaTeX and chemistry offline, and
is covered by a passing browser E2E suite and a 500-fixture regression corpus.

### Verified in this session (current evidence, not carried-over claims)

| Check | Command | Result |
|---|---|---|
| Rust toolchain | `cargo -V` (project-local) | 1.99.0, MSVC 14.44 linker verified with a smoke build |
| Type check | `tsc --noEmit` | clean |
| Frontend build | `vite build` | exit 0 |
| Windows binary | `tauri build --no-bundle` | `src-tauri/target/release/openmark.exe`, 13,833,728 bytes, boots |
| Rust check | `cargo check` | zero warnings |
| Browser E2E | `playwright test` | **10 passed** |
| DOM/security unit | `vitest run --project dom` | **22 passed** |
| Corpus validation | `node scripts/verify-corpus.mjs` | OK — manifest matches disk |
| Corpus size | — | 148 markdown docs, 355 formula cases (40 expected-error), 5 stress fixtures |

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

1. **Instant-rendering mode is not implemented.** Three of the four view modes work (read,
   source, split); `instant` is deliberately absent from the toolbar rather than shipped
   broken, because `AVAILABLE_MODES` gates it. This is the largest remaining feature.
2. **Editing is minimal.** Source mode is a byte-exact textarea. CodeMirror 6, find/replace,
   table editing, image paste and smart lists are all still to build.
3. **Export is not started.** HTML and PDF export are unimplemented.
4. **Packaging is half done.** A release binary and a validated portable configuration exist;
   the NSIS installer has not yet been produced in this session, and unsigned installers will
   trigger SmartScreen.
5. **Only 13 of the 28 declared diagnostic codes are emitted.** The corpus authors fixtures
   for the rest as targets; `tests/corpus/README.md` states this explicitly so nobody writes
   a passing assertion against behaviour that does not exist.

### P2

6. **Accessibility features in MathJax are disabled.** v4 enables semantic enrichment, speech
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

1. Build the **instant-rendering mode**: expose top-level block source ranges from the
   parser, then implement block-wise inline editing that patches the authoritative source by
   offset. This is also the foundation CodeMirror 6 will plug into.
2. Add the **CodeMirror 6 source editor** with Markdown syntax highlighting, replacing the
   textarea behind the existing value-in/`onChange`-out contract.
3. **Find and replace** across both source and reading views.
4. **HTML and PDF export** (self-contained HTML; PDF via WebView2 `PrintToPdf`), with
   preflight checks for missing and remote assets.
5. **Round-trip property tests** using `fast-check` over the corpus, asserting that
   open → save → reopen is byte-identical.
6. **Corpus-driven parse tests**: run all 148 documents through the parser and assert each
   manifest expectation (`expect.headings`, `expect.math`, declared diagnostics).
7. Produce the **NSIS installer** and record the SmartScreen experience honestly.
8. **WebdriverIO desktop E2E** against the real binary, using `@wdio/tauri-service` with the
   `tauri-plugin-wdio` hook already registered under `debug_assertions`.

---

## 6. How to run everything

```bash
# toolchain (project-local Rust; nothing global is modified)
source scripts/env.sh

pnpm install
pnpm build                 # also vendors MathJax into public/
pnpm test                  # Vitest, unit + dom projects
pnpm test:e2e              # Playwright against the production build, Edge channel
pnpm corpus:verify         # corpus manifest ⇄ disk
pnpm typecheck && pnpm lint

# desktop
pnpm desktop:dev
pnpm desktop:build         # installer + binary
```
