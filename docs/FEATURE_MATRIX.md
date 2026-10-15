# OpenMark vs Typora — Feature Matrix

Baseline 2026-10-15. Typora reference: **1.14.10** (Windows), from `local://research-typora-benchmark.md`
(public docs/site/changelog/issue tracker only — no source, icons, themes or other assets were copied).

**Status vocabulary** (exactly three values):

- **Implemented** — the behaviour exists in code; the Evidence column names the file that proves it. Where the
  core exists but the user-visible surface does not, the status is `Implemented (core only)` and the Evidence
  column says what is missing.
- **Planned** — required by `docs/PRD.md` and not yet built.
- **Out-of-scope** — deliberately not delivered (with the reason).

**Honesty statement.** The rendering/parsing/math/file core is real and was read file-by-file to fill this
table. **No editing surface exists at all**: there is no `.tsx` file in the repository, `src/components/` and
`src/i18n/` are empty, and `index.html` references `/src/main.tsx`, which does not exist. Also empty:
`src/core/editor/`, `src/core/export/`, `src/core/diagnostics/`, and every directory under `tests/`. Therefore
almost every editing, multi-tab, export, packaging and test row below is **Planned**, regardless of how much
design work exists.

**Diagnostics caveat, stated once and applied to every diagnostics row.** `src/core/markdown/types.ts` declares
28 `DiagnosticCode` values; an exhaustive grep for emission sites finds **six** codes actually produced today:
`math-unbalanced-braces`, `unclosed-math`, `unclosed-fence` (engine), `html-sanitized` (engine),
`math-render-error` (typesetter), `mermaid-parse-error` (typesetter). The other 22 are vocabulary only.

---

## 1. Summary

Counted from the rows below (a row with a partial status counts as Implemented, and the qualifier in the Status
column carries the caveat):

| Area | Implemented | Planned | Out-of-scope |
|---|---|---|---|
| Reading & rendering | 20 | 11 | 4 |
| Math & chemistry | 11 | 5 | 1 |
| Editing | 5 | 13 | 1 |
| Files & export | 10 | 5 | 2 |
| Diagnostics & differentiation (E1–E6) | 6 | 4 | 0 |
| Security | 8 | 3 | 0 |
| Platform, packaging & test | 3 | 10 | 1 |
| **Total (123 rows)** | **63** | **51** | **9** |

---

## 2. Reading and rendering

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Markdown parsing engine | closed engine, "GFM with small incompatibilities" | **Implemented** | `src/core/markdown/engine.ts`; markdown-it 15.0.2 at 652/652 CommonMark 0.31.2 (RESEARCH §2.1) |
| Headings `#`…`######`, paragraphs, blockquotes (incl. nested), thematic breaks, hard/soft breaks | yes | **Implemented** | `engine.ts` (markdown-it default preset); fixtures planned in `tests/corpus/markdown/` |
| Setext headings | yes | **Implemented** | default preset; lossy on *serialisation* only (RESEARCH §2.2) — the writer never serialises |
| Lists: ordered/unordered/nested ≥3/mixed/loose-tight/`3.`-started | yes | **Implemented** | default preset |
| Task lists `- [ ]`/`- [x]` | yes (clickable checkbox) | **Implemented (core only)** | `engine.ts` `taskLists {enabled:false,label:true,labelAfter:true}` — non-interactive by design for reading; UI rendering pending |
| GFM tables incl. alignment and escaped pipes | yes (+ GUI resize) | **Implemented (core only)** | default preset; table GUI is Planned |
| Code fences with and without info string, tilde fences, nested fences | yes (fences only, no indented code) | **Implemented** | `engine.ts` `fence` rule → `codePlaceholder`; indented code also supported (`code_block` case in the collect pass) |
| Syntax highlighting | yes, ~100 CodeMirror langs, optional line numbers | **Implemented (core only)** | `src/core/render/highlighter.ts` (Shiki 4.5.0, dual themes, 66 grammars — 2 preloaded, the rest imported on demand); line numbers Planned |
| `` ```mermaid `` diagrams | yes (opt-in; mermaid 11.13.0) | **Implemented (core only)** | `src/core/render/mermaid.ts` (Mermaid 12.2.0, `securityLevel:'strict'`, cache by theme+source) |
| `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, `` ```math `` | yes | **Implemented** | `src/core/markdown/math-plugin.ts`; `MATH_FENCES` in `engine.ts` |
| KaTeX as an alternative engine | no (MathJax only) | **Out-of-scope** | single-engine decision, RESEARCH §10 D4 |
| Images with relative paths | yes (`typora-root-url`, drag&drop, resize) | **Implemented (core only)** | `fileService.resolveAssetUrl` → `resolve_asset_url` + `convertFileSrc`; resize Planned |
| Image alignment control | not supported (CSS `<center>` workaround) | **Planned** | PRD R-E-6 (settings) |
| Footnotes (incl. multi-paragraph) | yes (MultiMarkdown) | **Implemented** | `engine.ts` `md.use(footnote)` |
| Definition lists | not documented as a supported extension | **Implemented** | `engine.ts` `md.use(deflist)` (OpenMark is a superset here) |
| `~sub~` / `^sup^` / `==mark==` | yes (opt-in, per-item preferences) | **Implemented** | `engine.ts` `md.use(sub/sup/mark)` — always on, no restart needed |
| `[TOC]` inline table of contents | yes (non-standard `[toc]`) | **Out-of-scope** | non-standard syntax; OpenMark generates the outline from the document structure instead (`nestOutline`) |
| Outline / sidebar with click-to-jump, highlight, filter | yes (one sidebar panel at a time) | **Implemented (core only)** | `slugifyHeading` + `nestOutline` + `OutlineEntry` in `engine.ts`/`types.ts`; the panel UI is Planned |
| In-document search, next/previous | yes (`Ctrl+F`), plus folder search | **Planned** | `ui.searchQuery` exists in `src/app/store.ts`; no search implementation |
| Reading progress indicator | no | **Planned** | `ui.progress` + `setProgress` exist in `store.ts`; `reading.showReadingProgress` in `settings.ts` |
| Last reading position memory | not documented | **Planned** | PRD R-E-3; no persistence of position in `settings.ts`/`store.ts` |
| Word count + estimated reading time (CJK rules) | yes (status bar; 1 hanzi = 1 word; syntax excluded) | **Implemented (core only)** | `countWords` + `stats.readingMinutes` in `engine.ts`; status-bar UI Planned |
| Light/dark theme, separate light/dark theme choice | yes (6 built-in themes) | **Implemented (core only)** | `src/styles/tokens.css` (light + dark palettes, `prefers-contrast`), `settings.ts` `resolveTheme`, `data-om-theme` |
| Font family / font size / line height / page width | partial (zoom + limited typography) | **Implemented (core only)** | `settings.ts::applySettingsToDocument` writes `--om-font-size`, `--om-line-height`, `--om-content-width`; settings panel Planned |
| Typographic density / rhythm, justification, hyphenation | no | **Implemented (core only)** | `--om-density`, `data-om-justify`, `data-om-hyphenate` — projection done, panel + stylesheet rules Planned |
| Formula scale / image scale | no (only global zoom) | **Implemented (core only)** | `--om-math-scale`, `--om-image-scale` in `tokens.css` + `settings.ts` |
| Focus mode | yes (`F8`, fades other lines — a writing aid) | **Planned** | `reading.focusMode` + `data-om-focus` are set; the stylesheet rules and the chrome-dimming UX are not written |
| Typewriter mode | yes (`F9`) | **Planned** | `reading.typewriterMode` setting exists only |
| Full-screen reading | yes (`F11`) | **Planned** | — |
| Multi-tab documents | **not supported** (each document = a window) | **Planned** | PRD R-A-17 |
| Recent files list | yes (`Ctrl+P` open-quickly, JumpList) | **Planned** | — |
| Zoom (`Ctrl+Shift+0/=/−`, Ctrl+wheel) | yes | **Planned** | font size is configurable; the zoom gesture/shortcut layer is not |
| Automatic heading numbering | no | **Planned** | `reading.autoNumberHeadings` exists; the renderer does not number headings |
| Presentation / slides mode | only via RevealJS pandoc export | **Out-of-scope** | not a reader requirement |
| Emoji shortcodes `:smile:` | yes (with autocomplete) | **Out-of-scope** | `markdown-it-emoji` is not a dependency; Chinese-first v1 prioritises reading |

---

## 3. Math and chemistry

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Engine | MathJax **v4** since 1.13 (v3.2.2 since 1.4) | **Implemented** | `src/core/math/mathjax.ts`; `mathjax@4.1.3` vendored at `public/mathjax/v4` (19 MB, `.vendor-stamp`) |
| SVG output, self-contained | not documented | **Implemented** | `svg: { fontCache:'local', useXlink:false }` in `configure()` |
| mhchem `\ce{}` / `\pu{}` | built in | **Implemented** | `loader.load: ['[tex]/mhchem']` + `tex.packages['[+]']` includes `mhchem`; the TeX extension is present at `public/mathjax/v4/input/tex/extensions/mhchem.js` |
| Package set beyond the defaults | full MathJax macro set documented; `physics` optional | **Implemented** | `EXTRA_PACKAGES` = mhchem, ams, mathtools, boldsymbol, cancel, color, unicode, textmacros, autoload |
| Fully offline math rendering | yes (Electron bundle) | **Planned — defect R-MATH-1** | the `@mathjax/*-font` packages are neither installed nor vendored, and `configure()` sets no `fontPath`; the bundle still contains `cdn.jsdelivr.net` fallbacks (RESEARCH §3.5) |
| Delimiter ambiguity (currency, escapes, code spans) | Pandoc-style rules by default | **Implemented** | `math-plugin.ts` four rules + `indexOfUnescaped`; `\(` with no closer falls back to `escape` |
| Unclosed-delimiter reporting | red inline text only | **Implemented (core only)** | `structuralDiagnostics` → `unclosed-math` (odd `$$` count) |
| Per-expression error reporting from MathJax | inline red output; no error API exposed | **Implemented** | `renderExpression` detects `<merror data-mjx-error>`; `typesetter.fillMath` emits `math-render-error` with range/`mathId`/source |
| A failed formula never loses its source | inline error text shown | **Implemented** | `fillMath` writes `expr.raw` when MathJax returns no HTML; source kept in `MathExpression.raw`/`tex` |
| Pre-typeset brace sanity check | none | **Implemented** | `engine.ts::checkMathSource` (explicitly non-authoritative; MathJax remains the authority) |
| Equation numbering + `\label`/`\ref` | yes (`No / AMS rule / all`); `\label`+`\ref` **lost in docx export** | **Implemented (core only)** | `needsNumbering` + `setEquationNumbering` (mutates the TeX input jax; `tags:'ams'` + `resetMathDocument`) |
| Environments: align/gather/cases/rcases/split/matrix family/array | yes (amsmath) | **Implemented** | `MATH_ENVIRONMENTS` (31 names) + `findEnvironmentEnd` with nesting |
| Math diagnostics **panel** (E2) | no panel; only "Force Refresh" | **Planned** | the data exists (`Diagnostic` with `mathId`, `math-render-error`, `MathExpression.range`) but no UI consumes it |
| Formula editing dialog with live preview | yes (click to edit, ✓ / `Ctrl+Enter`) | **Planned** | PRD R-B-9 |
| Copy formula as LaTeX source | right-click "Copy as Image"; TeX is also in the node | **Planned (partly free)** | `MathJax options.enableMenu: true` gives MathJax's own context menu; a first-class app command is Planned |
| Screenshot / visual regression of key formulas | n/a | **Planned** | PRD R-B-11, TEST_STRATEGY §3 |
| Math autocomplete / macro completion | **not implemented** in Typora (a common false claim) | **Out-of-scope** | `MATH_ENVIRONMENTS` is exported for a future autocomplete set, but no completion feature is required for v1 |

---

## 4. Editing

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Instant rendering (Typora-style) | yes — cursor-local source reveal | **Planned** | `ViewMode = 'instant'` exists in `store.ts`; no editor surface exists |
| Read mode (non-editable rendered view) | **does not exist** (issues #710/#4645/#5352/#6056) | **Implemented (core only)** | `ViewMode = 'read'` is the store default; the render contract is implemented, the view is not |
| Source mode | yes (`Ctrl+/`, CodeMirror) | **Planned** | `ViewMode = 'source'` exists |
| Split mode | not supported | **Planned** | `ViewMode = 'split'` exists |
| Markdown shortcuts (bold/italic/code/link/heading/list/quote/table/math block/…, 40+ keys) | yes (full documented table) | **Planned** | PRD R-C-2 |
| Undo / redo | yes | **Planned** | PRD R-C-3 |
| Smart lists, table editing, code-block editing | yes | **Planned** | PRD R-C-4 |
| Image paste / drag-drop / resource management | yes (+ cloud upload services) | **Planned** | PRD R-C-5; the FS primitives (`write_text_file_atomic`, dialog plugin) exist |
| Find & replace | yes (`Ctrl+H`) | **Planned** | PRD R-C-6 |
| Drag a file onto the window to open it | yes | **Implemented (partial)** | `dragDropEnabled: true` in `tauri.conf.json` + argv/`openmark://open-file` plumbing in `lib.rs`; the frontend handler does not exist |
| Multi-tab editing | no | **Planned** | PRD R-C-7 |
| Autosave (interval configurable) | opt-in, default 5 min, drafts only on Win/Linux | **Planned** | `editor.autoSave` / `autoSaveDelayMs` exist in `settings.ts`; no autosave loop |
| External-change detection + conflict prompt | file tree auto-refresh only | **Implemented (core only)** | `store.checkExternalChange()` (mtime compare) sets `doc.externalChange`; polling loop + prompt UI Planned |
| Clobber protection at the IPC boundary | n/a | **Planned — gap** | `fileService.writeFile` sends `expectedMtimeMs`, but `commands.rs::write_text_file_atomic` reads only `makeBackup` — the guard is **not implemented** (ARCHITECTURE §3 S5) |
| Caret/scroll stability across mode switches and re-render | yes (scroll preserved source↔hybrid since 1.13) | **Planned** | PRD R-C-10 |
| Never silently drop unrecognised extensions / comments / frontmatter / macros | **no** — extension renamed to `.md` on save (#6324); "export" reformats reference links | **Implemented (core only)** | raw-preserving frontmatter rule (`rules.ts`), `PreservedBlock` kind `html-comment`/`raw-html`, verbatim fence `info` in `CodeBlock`; the editor that maintains the invariant is Planned |
| Authoritative source + non-destructive model | text edited in place | **Implemented** | `doc.source` is the only write target (`store.ts`, `fileService`); `normalizeEol` never touches the file (ARCHITECTURE §3 S1/S2) |
| Granular autocomplete settings | no — macOS predictive text cannot be disabled (#6198) | **Planned** | PRD R-E-6 (settings surface) |
| Wiki links / `#tags` as syntax | no | **Out-of-scope** | `[[…]]` is left as literal text (matching Typora) |

---

## 5. Files and export

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Open / create / save / save-as `.md`/`.markdown` | yes | **Implemented** | `src/core/fs/fileService.ts` (`pickOpenPath`, `pickSavePath`, `readFile`, `writeFile`), `store.openPath/save/saveAs/newDocument` |
| UTF-8 with/without BOM | yes | **Implemented** | `encoding.ts::decodeText/encodeText` (BOM restored on write) |
| UTF-16 files | not documented | **Implemented** | `decodeText` handles UTF-16 LE/BE with BOM |
| LF / CRLF / CR detection and exact restoration | "Default Line Ending" preference; behaviour on a CRLF file is undocumented | **Implemented** | `decodeText` (`eol`, `mixedEol`) + `applyEol`/`encodeText`; the JS write path passes the original `bom`/`eol` back |
| Invalid-UTF-8 reporting | not documented | **Implemented (core only)** | `decodeText` sets `lossy`; `non-utf8-encoding`/`invalid-utf8` codes are declared in `types.ts` but **not emitted** yet |
| Missing images / broken relative paths | silently broken | **Planned** | `image-missing` code declared, not emitted; PRD R-E-5 |
| Atomic save | no documented guarantee; autosave drafts only | **Implemented** | `commands.rs::write_text_file_atomic` (same-dir temp → `sync_all` → `rename`) |
| Rotating backups | no version control on Win/Linux | **Implemented** | `create_backup` + `prune_backups` (`.openmark-backups/`, keep 20) |
| Crash recovery | "Recover Unsaved Drafts" (`{date}-{filename}.md`) | **Planned** | backups exist; the recovery UI is Planned (PRD R-C-13) |
| Export HTML (self-contained) | yes (+ "without styles") | **Planned** | `src/core/export/` is empty; PRD R-D-5 |
| Export PDF, offline | yes (native; Windows/Linux light themes only per docs, contradicted by the changelog) | **Planned** | `pdf-export` Cargo feature + `webview2-com`/`windows` declared, no command (RESEARCH §9.4, §9.3) |
| Export Word/Epub/LaTeX/RST/… | via external **pandoc** | **Out-of-scope** | requires a third-party binary; not an offline-first requirement for v1 |
| Export "Markdown (other spec)" / custom shell commands | yes | **Out-of-scope** | Typora-specific |
| Windows file association for `.md` | n/a | **Implemented (not yet verified in a build)** | `tauri.conf.json` `bundle.fileAssociations`; argv handling in `lib.rs` (`is_markdown`, `PendingOpenFiles`, `frontend_ready`) |
| Portable distribution | installer only | **Implemented (config) — script gap** | `tauri.portable.conf.json` (`appDirectoriesOverride: "data"`); `desktop:build:portable` does **not** pass `--config`, so it is unreachable as written |
| Fully offline operation | yes for core read/write/render | **Implemented (one gap)** | CSP `default-src 'self'` with no remote origins + vendored MathJax/Mermaid/Shiki; the MathJax font payload gap is R-MATH-1 |
| Autosave-on-by-default + version history | no (opt-in; no versions on Win/Linux) | **Planned** | PRD R-C-8 |

---

## 6. Diagnostics and the six differentiation features (E1–E6)

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| **E1** Compatibility/capability diagnostics with file position + reason | none ("no built-in markdown convert, reformat or lint function") | **Implemented (6 codes) / Planned (22 codes)** | `Diagnostic` carries `code`/`severity`/`range`/`source`/`excerpt`/`detail` (`types.ts`); emitted today: `unclosed-fence`, `unclosed-math`, `html-sanitized`, `math-unbalanced-braces`, `math-render-error`, `mermaid-parse-error` |
| **E1** Jump-to-problem | n/a | **Planned** | ranges exist; the panel and the `source`-mode jump do not |
| **E2** Math diagnostics panel | no panel; errors are inline red text | **Planned** | data complete (`mathId`, per-expression error, `MathExpression.range`); no consumer |
| **E3** Immersive textbook reading (outline, search, progress, last position) | no reading mode; no tabs; Focus Mode is a writing aid | **Implemented (outline core) / Planned (rest)** | `nestOutline`, `OutlineEntry`, `ui.progress`, `activeHeadingId` in `engine.ts`/`store.ts`; search + position memory Planned |
| **E4** Safe read-only mode with a stated reason | **does not exist** | **Implemented (core only)** | `store.evaluateReadOnly()` + `readOnly`/`readOnlyReason` + guards in `setSource`/`save`; lock UI Planned |
| **E5** Document health check (missing images, broken paths, unclosed fences/math, suspicious syntax) | none | **Implemented (partial) / Planned** | fence + `$$` parity checks exist (`structuralDiagnostics`); asset/path/reference/anchor/tab checks are declared codes only |
| **E5** Health report export / copy | none | **Planned** | PRD R-E-5 |
| **E6** Advanced reading settings (width, density, font, image scale, formula scale) | zoom only; RTL/vertical writing are untested CSS hacks | **Implemented (core only)** | `ReadingSettings` + `applySettingsToDocument` → CSS custom properties in `tokens.css`; the settings panel UI is Planned |
| **E1/E2/E3/E4/E5/E6** delivered as *operable features* (not static UI) | — | **Planned (acceptance criterion)** | PRD §10.8; each needs an E2E test before it counts as delivered |
| No arbitrary render-size cap | **hard ~2 MB cap** (#1961, open since 2018) | **Implemented (architecture) / unproven (at scale)** | lazy placeholders + bounded concurrency + cancellation (`types.ts`, `typesetter.ts`); the stress corpus and perf budget that would prove it are Planned |

---

## 7. Security

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Strict CSP, no remote code | Electron app; past XSS CVEs (CVE-2020-18748; 1.9 "Fix XSS on mermaid and math") | **Implemented** | `src-tauri/tauri.conf.json` + `index.html` CSP: `default-src 'self'`, `object-src 'none'`, `frame-src 'none'` |
| Sanitise-before-inject | sandboxed HTML blocks, scripts not rendered | **Implemented** | `src/core/markdown/sanitize.ts` (DOMPurify 3.4.17, explicit allow-lists, forbid-lists, URI regexp, `SAFE_FOR_XML`) |
| `<script>`, `onerror`, `javascript:`, `<iframe>/<object>/<embed>`, SVG script | blocked at render | **Implemented** | `FORBID_TAGS`/`FORBID_ATTR`/`ALLOWED_URI_REGEXP` in `sanitize.ts`; corpus fixtures Planned |
| Sanitisation reported, not silent | n/a | **Implemented (core only)** | `SanitizeResult.removed[]` → `html-sanitized` diagnostics with detail "preserved in the source file but not rendered"; UI Planned |
| Mermaid hardening | `--mermaid-theme` CSS options; strictness not documented | **Implemented** | `securityLevel:'strict'`, `htmlLabels:false`, `suppressErrorRendering:true`, `maxTextSize`, `maxEdges` in `mermaid.ts` |
| Path traversal via image references | "Delete Image" silently deletes the file from disk | **Implemented (partial)** | `resolve_asset_url` canonicalises before `convertFileSrc`; the `image-path-escapes-root` diagnostic is declared but **not emitted** |
| Remote images reported, not fetched | remote images render/fetch | **Planned** | `image-remote`/`link-remote` codes declared; no emission site |
| External links open in the OS browser | `Ctrl+click` | **Implemented** | `fileService.openExternal` → `tauri-plugin-opener`; `capabilities/default.json` scopes it to `https/http/mailto` |
| Test-only capability kept out of release | n/a | **Implemented** | `tauri-plugin-wdio` registered only under `#[cfg(debug_assertions)]` (`lib.rs`), capability in `capabilities/wdio.json` |
| Destructive actions previewed | "Delete Image" deletes immediately | **Planned** | PRD R-N-2 |
| Security test layer (malicious corpus ×7 layers) | n/a | **Planned** | TEST_STRATEGY §2 layer 6 |

---

## 8. Platform, packaging and test infrastructure

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Desktop shell (window, plugins, IPC) | Electron | **Implemented** | `src-tauri/src/lib.rs`, `commands.rs`, `capabilities/default.json` |
| Single-instance hand-off of a second document | separate window per document | **Implemented** | `tauri-plugin-single-instance` + `markdown_paths` + `openmark://open-file` emitter |
| Settings persistence | `conf.user.json` | **Implemented** | `settings.ts` (localStorage, typed merge, CSS projection) |
| i18n (Chinese-first, English) | 30+ translations | **Planned** | `AppSettings.language` exists; `src/i18n/` is empty |
| React UI shell | n/a | **Planned** | `src/components/` empty; `index.html` references a non-existent `src/main.tsx` |
| Installer build (NSIS) | yes | **Planned** | `bundle.targets: ["nsis","msi","app"]` configured; no build artefact yet (`app` is macOS-only noise) |
| Auto-update | yes | **Out-of-scope for v1** | `tauri-plugin-updater` is not a dependency; signing prerequisites not yet budgeted (RESEARCH §9.7) |
| Unit tests (Vitest) | n/a | **Planned** | `package.json` `test:unit` wired; `tests/unit/` empty |
| Property / round-trip tests | n/a | **Planned** | `fast-check@4.10.2` is a devDependency; no tests |
| Browser tests (Playwright) | n/a | **Planned** | `@playwright/test@1.64.1` + `test:e2e` wired; `tests/e2e/` empty |
| Desktop E2E (WebdriverIO + Tauri) | n/a | **Planned** | deps/plugin/capability present; `index.html` lacks `import '@wdio/tauri-plugin'` and `tests/desktop/` has no `wdio.conf.ts` |
| Performance tests | n/a | **Planned** | `tests/perf/` empty; PRD R-N-3 |
| Corpus + manifest + validator | n/a | **Planned (deliverable in progress)** | `tests/corpus/` is empty; `package.json` already references `corpus:verify` → `scripts/verify-corpus.mjs`; layout defined in TEST_STRATEGY §4 |
| Build test (packaged app runs standalone) | n/a | **Planned** | TEST_STRATEGY §2 layer 7 |

---

## 9. Where OpenMark is already ahead of Typora (implemented, not aspirational)

1. **Reading-only mode exists and locks writes** (`store.evaluateReadOnly`) — Typora has repeatedly refused this.
2. **Math errors carry a location and the original source** (`math-render-error` with `range`/`mathId`; failure
   keeps `expr.raw`) — Typora shows inline red text with no location.
3. **Per-expression MathJax error detection** via `data-mjx-error` — not exposed to Typora users.
4. **BOM/line-ending preservation and atomic writes with rotating backups** — no documented equivalent.
5. **Sanitisation before injection, with the removals reported** — a documented, testable posture.
6. **No arbitrary size cap by construction** (placeholders + lazy, cancellable typesetting) — Typora's cap is
   open since 2018.
7. **Frontmatter and raw HTML comments preserved verbatim** through the parse path — Typora's own YAML parser is
   documented as "flexible/fault-tolerant" with no preservation promise.

Everything else in this document is either **Planned** or **Out-of-scope**; the matrix is intentionally
pessimistic, because a matrix that overstates status is worse than no matrix.
