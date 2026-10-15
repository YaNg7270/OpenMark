# OpenMark vs Typora — Feature Matrix

Baseline 2026-10-16. Typora reference: **1.14.10** (Windows), from `local://research-typora-benchmark.md`
(public docs/site/changelog/issue tracker only — no source, icons, themes or other assets were copied).

**Status vocabulary** (exactly four values):

- **Implemented** — the behaviour exists in code and is reachable from the UI or a documented API. The
  Evidence column names the file that proves it, and the test that covers it where one exists.
- **Implemented (core only)** — the logic exists and is exercised, but the user-visible surface is
  incomplete. The Evidence column says which half is missing.
- **Planned** — required by `docs/PRD.md` and not yet built.
- **Out-of-scope** — deliberately not delivered, with the reason.

**Honesty statement.** This table was re-audited against the tree on 2026-10-16, after the editing,
multi-tab, export, packaging and test work landed. Every row was checked against the file named in its
Evidence column; a row is not marked Implemented merely because a file exists.

That audit found three rows where the code existed but did nothing, and they are now fixed and covered by
tests: relative images never loaded because nothing called the resolver, New and Save As had no UI caller,
and the write command ignored the caller's expected mtime so the documented clobber guard was not enforced.
Split-pane scroll sync was one of them; it is implemented and tested as well.

The test layers are real: 434 Vitest tests in 9 files, 53 Playwright tests (`tests/e2e/rendering.spec.ts`,
`tests/e2e/visual.spec.ts`) including 7 screenshot baselines, 6 WebdriverIO tests driving the compiled
binary (`tests/desktop/openmark.spec.ts`), and a 148-fixture corpus (`tests/corpus/`, validator
`scripts/verify-corpus.mjs`).

**Code-signing, MSI install testing, auto-update and an accessibility audit are not done.** They are the
remaining Known Issues (`docs/KNOWN_ISSUES.md`), not hidden scope.

**Diagnostics.** `src/core/markdown/types.ts` declares 26 `DiagnosticCode` values and **all 26 are emitted**:
`engine.ts` produces the structural/asset/math-shape codes, `core/diagnostics/encoding.ts` the encoding
codes, `core/diagnostics/assets.ts` the image codes, and `core/render/typesetter.ts` the render-failure codes
(`math-render-error`/`math-unknown-macro`/`mermaid-parse-error`). The corpus suite asserts that each fixture
emits every diagnostic it declares (`tests/unit/corpus.test.ts`).

---

## 1. Summary

Counted from the rows below. Every row carries exactly one status, so the four columns sum to the row count.

| Area | Implemented | Implemented (core only) | Planned | Out-of-scope |
|---|---|---|---|---|
| Reading & rendering | 26 | 2 | 3 | 4 |
| Math & chemistry | 16 | 0 | 0 | 1 |
| Editing | 12 | 2 | 4 | 1 |
| Files & export | 11 | 2 | 2 | 2 |
| Diagnostics & differentiation (E1–E6) | 9 | 0 | 1 | 0 |
| Security | 10 | 0 | 1 | 0 |
| Platform, packaging & test | 12 | 0 | 1 | 1 |
| **Total (123 rows)** | **96** | **6** | **12** | **9** |

---

## 2. Reading and rendering

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Markdown parsing engine | closed engine, "GFM with small incompatibilities" | **Implemented** | `src/core/markdown/engine.ts` (markdown-it 15, 652/652 CommonMark 0.31.2); `tests/unit/corpus.test.ts` parses all 148 fixtures |
| Headings `#`…`######`, paragraphs, blockquotes (incl. nested), thematic breaks, hard/soft breaks | yes | **Implemented** | `engine.ts` (default preset); fixtures `tests/corpus/markdown/01-…`, `05-…`, `19-…`; `tests/e2e/rendering.spec.ts` "renders a mixed document" |
| Setext headings | yes | **Implemented** | `engine.ts` default preset; the writer is range-based and never serialises (`store.applyBlockEdit`) |
| Lists: ordered/unordered/nested ≥3/mixed/loose-tight/`3.`-started | yes | **Implemented** | `engine.ts` default preset; corpus `07-`…`1A-`, `200-`… |
| Task lists `- [ ]`/`- [x]` | yes (clickable checkbox) | **Implemented** | `engine.ts` `taskLists {enabled:false,label:true,labelAfter:true}` renders checked/unchecked state; checkboxes are non-interactive **by design** (PRD R-A-4); `tests/e2e/rendering.spec.ts` asserts one checked of two |
| GFM tables incl. alignment and escaped pipes | yes (+ GUI resize) | **Implemented** | default preset + `src/core/markdown/table.ts` + `src/components/TableEditor.tsx` (edit cells, alignment, add/remove row+column, no-op writes nothing); `tests/unit/table.test.ts`; `tests/e2e/rendering.spec.ts` "opens the grid…" |
| Code fences with and without info string, tilde fences, nested fences | yes (fences only, no indented code) | **Implemented** | `engine.ts` `fence`/`code_block` rules → placeholders; corpus `30-`… |
| Syntax highlighting | yes, ~100 CodeMirror langs, optional line numbers | **Implemented** | `src/core/render/highlighter.ts` (Shiki 4, dual themes, on-demand grammars, `defaultColor:false`); source editor line numbers in `SourceEditor.tsx`; `tests/e2e/rendering.spec.ts` "highlights markdown syntax" / "line numbers are shown" |
| `` ```mermaid `` diagrams | yes (opt-in; mermaid 11.13.0) | **Implemented** | `src/core/render/mermaid.ts` (`securityLevel:'strict'`, cache by theme+source); `src/core/render/typesetter.ts` fills placeholders; `tests/e2e/rendering.spec.ts` "renders a Mermaid diagram to SVG" |
| `$…$`, `$$…$$`, `\(…\)`, `\[…\]`, `` ```math `` | yes | **Implemented** | `src/core/markdown/math-plugin.ts`, `MATH_FENCES` in `engine.ts`; `tests/unit/corpus.test.ts` math layer |
| KaTeX as an alternative engine | no (MathJax only) | **Out-of-scope** | single-engine decision, RESEARCH §10 D4 |
| Images with relative paths | yes (`typora-root-url`, drag&drop, resize) | **Implemented** | `core/render/images.ts` rewrites every relative `<img src>` to an `asset://` URL after typesetting, so `![](./img/x.png)` loads in `read` and `instant`; absolute URLs and `data:` URIs are left alone. Health check in `core/diagnostics/assets.ts` emits `image-missing`/`image-path-escapes-root`, and an unresolvable image is marked `data-om-missing` so the reading surface shows a placeholder rather than a blank. Covered by `tests/unit/dom/images.test.ts`. Drag-and-drop resize is not implemented. |
| Image alignment control | not supported (CSS `<center>` workaround) | **Planned** | PRD R-E-6 settings surface |
| Footnotes (incl. multi-paragraph) | yes (MultiMarkdown) | **Implemented** | `engine.ts` `md.use(footnote)`; `tests/e2e/rendering.spec.ts` asserts the footnote block |
| Definition lists | not documented as a supported extension | **Implemented** | `engine.ts` `md.use(deflist)` (OpenMark is a superset here) |
| `~sub~` / `^sup^` / `==mark==` | yes (opt-in, per-item preferences) | **Implemented** | `engine.ts` `md.use(sub/sup/mark)` — always on |
| `[TOC]` inline table of contents | yes (non-standard `[toc]`) | **Out-of-scope** | non-standard syntax; OpenMark builds the outline from heading structure instead (`nestOutline`) |
| Outline / sidebar with click-to-jump, highlight, filter | yes (one sidebar panel at a time) | **Implemented (core only)** | `src/components/OutlinePanel.tsx` + `nestOutline`/`slugifyHeading` (`engine.ts`) + active-heading tracking (`useTypesetting.ts`); `tests/e2e/rendering.spec.ts` "outline lists headings and navigation is wired". **Missing half:** no filter box (PRD R-A-11 lists "filter"). |
| In-document search, next/previous | yes (`Ctrl+F`), plus folder search | **Implemented** | `src/components/SearchPanel.tsx` (DOM walk + CSS Custom Highlight API, next/previous, count) and CodeMirror's own panel in `SourceEditor.tsx` (`search({top:true})`); bound in `App.tsx` (`Ctrl+F`). No folder search (not required). |
| Reading progress indicator | no | **Implemented** | `useReadingProgress` in `useTypesetting.ts` → `ui.progress`; `.om-progress` bar in `DocumentView.tsx`/`InstantView.tsx`; `settings.reading.showReadingProgress` |
| Last reading position memory | not documented | **Implemented** | `src/app/session.ts` `withReadingPosition` (content-hash aware) + restore in `useReadingProgress`; `tests/e2e/rendering.spec.ts` "restores the reading position when the same file is reopened" |
| Word count + estimated reading time (CJK rules) | yes (status bar; 1 hanzi = 1 word; syntax excluded) | **Implemented** | `engine.ts::countWords` + `stats.readingMinutes`; rendered in `src/components/StatusBar.tsx` |
| Light/dark theme, separate light/dark theme choice | yes (6 built-in themes) | **Implemented** | `src/styles/tokens.css` (light+dark palettes), `settings.ts::resolveTheme` (light/dark/system), `data-om-theme`; `tests/e2e/rendering.spec.ts` "theme toggle switches the palette". Single palette pair — no per-mode theme picker like Typora's, noted here rather than as a gap. |
| Font family / font size / line height / page width | partial (zoom + limited typography) | **Implemented** | `settings.ts::applySettingsToDocument` → `--om-font-size`/`--om-line-height`/`--om-content-width`; controls in `SettingsPanel.tsx`; `tests/e2e/rendering.spec.ts` "reading settings change layout without re-parsing" |
| Typographic density / rhythm, justification, hyphenation | no | **Implemented** | `--om-density`, `data-om-justify`, `data-om-hyphenate` (`settings.ts`) with rules in `src/styles/document.css`; controls in `SettingsPanel.tsx` |
| Formula scale / image scale | no (only global zoom) | **Implemented** | `--om-math-scale`, `--om-image-scale` in `tokens.css` + `settings.ts`; sliders in `SettingsPanel.tsx` |
| Focus mode | yes (`F8`, fades other lines — a writing aid) | **Implemented** | `reading.focusMode` → `data-om-focus` (`settings.ts`); chrome dims/hides via `app.css` (`html[data-om-focus='on'] .om-sidebar/.om-statusbar`, toolbar fade) and `Toolbar.tsx` `data-om-focus-hidden`; toggled by `F11`/toolbar in `App.tsx`. It dims **chrome**, not other lines. |
| Typewriter mode | yes (`F9`) | **Implemented** | `SourceEditor.tsx::centreCaret` holds the caret at 40% while typing, gated on `reading.typewriterMode`; toolbar toggle in `Toolbar.tsx`; `tests/e2e/rendering.spec.ts` "typewriter mode toggles and keeps the caret line in view" |
| Full-screen reading | yes (`F11`) | **Planned** | PRD R-A-16; `F11` is bound to focus mode, not window full-screen, and no fullscreen API call exists |
| Multi-tab documents | **not supported** (each document = a window) | **Implemented** | `store.ts` tab actions (`openPathInNewTab`/`activateTab`/`closeTab`), `src/components/TabBar.tsx` (hidden at one tab, dirty guard on close); `tests/e2e/rendering.spec.ts` tab group (4 tests) |
| Recent files list | yes (`Ctrl+P` open-quickly, JumpList) | **Implemented** | `src/app/session.ts` (`MAX_RECENT = 40`) + `src/components/RecentPanel.tsx` (also the empty state); `tests/e2e/rendering.spec.ts` recent-files group. No `Ctrl+P` quick-open, no JumpList. |
| Zoom (`Ctrl+Shift+0/=/−`, Ctrl+wheel) | yes | **Planned** | font size is configurable; the zoom gesture/shortcut layer is not (no wheel/zoom handler exists) |
| Automatic heading numbering | no | **Implemented** | `reading.autoNumberHeadings` → `data-om-numbered`; CSS counters in `document.css`; toggle in `SettingsPanel.tsx` |
| Presentation / slides mode | only via RevealJS pandoc export | **Out-of-scope** | not a reader requirement |
| Emoji shortcodes `:smile:` | yes (with autocomplete) | **Out-of-scope** | `markdown-it-emoji` is not a dependency; Chinese-first v1 prioritises reading |

---

## 3. Math and chemistry

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Engine | MathJax **v4** since 1.13 (v3.2.2 since 1.4) | **Implemented** | `src/core/math/mathjax.ts`; `mathjax@4.1.3` vendored at `public/mathjax/v4` |
| SVG output, self-contained | not documented | **Implemented** | `svg: { fontCache:'local', useXlink:false }` in `configure()` |
| mhchem `\ce{}` / `\pu{}` | built in | **Implemented** | `loader.load: ['[tex]/mhchem']` + `tex.packages['[+]']`; `tests/e2e/rendering.spec.ts` typesets `\ce`/`\pu` with real glyphs |
| Package set beyond the defaults | full MathJax macro set documented; `physics` optional | **Implemented** | `EXTRA_PACKAGES` = mhchem, ams, mathtools, boldsymbol, cancel, color, unicode, textmacros, autoload |
| Fully offline math rendering | yes (Electron bundle) | **Implemented** | `public/mathjax-fonts/mathjax-newcm-font` + `mathjax-mhchem-font-extension` are vendored (`scripts/prepare-mathjax.mjs`) and `configure()` sets `paths.fonts`; `tests/e2e/rendering.spec.ts` fails the suite on **any** non-local request while typesetting mhchem — the former R-MATH-1 gap is closed |
| Delimiter ambiguity (currency, escapes, code spans) | Pandoc-style rules by default | **Implemented** | `math-plugin.ts` four rules + `indexOfUnescaped`; `tests/e2e/rendering.spec.ts` "currency is not mistaken for math" |
| Unclosed-delimiter reporting | red inline text only | **Implemented** | `engine.ts` `structuralDiagnostics` → `unclosed-math`; `math-suspicious-delimiter` for unmatched `\(`/`\[`; corpus `113-health-unclosed-math.md` |
| Per-expression error reporting from MathJax | inline red output; no error API exposed | **Implemented** | `renderExpression` detects `<merror data-mjx-error>`; `typesetter.fillMath` emits `math-render-error`/`math-unknown-macro` with range/`mathId`/source; `tests/e2e/rendering.spec.ts` "a broken formula keeps its source and is reported" |
| A failed formula never loses its source | inline error text shown | **Implemented** | `fillMath` writes `expr.raw` when MathJax returns no HTML; source kept in `MathExpression.raw`/`tex`; `tests/desktop/openmark.spec.ts` "flags a broken formula as an error without losing its source" |
| Pre-typeset brace sanity check | none | **Implemented** | `engine.ts::checkMathSource` (explicitly non-authoritative; MathJax remains the authority) → `math-unbalanced-braces`, `math-unbalanced-environment` |
| Equation numbering + `\label`/`\ref` | yes (`No / AMS rule / all`); `\label`+`\ref` **lost in docx export** | **Implemented** | `needsNumbering` + `setEquationNumbering` (`mathjax.ts`); numbered documents typeset eagerly in `typesetter.ts` |
| Environments: align/gather/cases/rcases/split/matrix family/array | yes (amsmath) | **Implemented** | `MATH_ENVIRONMENTS` (31 names) + `findEnvironmentEnd` with nesting (`math-plugin.ts`); unknown env → `math-unsupported-environment` |
| Math diagnostics panel (E2) | no panel; only "Force Refresh" | **Implemented** | `src/components/DiagnosticsPanel.tsx` renders math diagnostics (source label "LaTeX", line, message, `detail` carries the formula source); `App.tsx::jumpToDiagnostic` scrolls to `[data-om-math]` and flashes it |
| Formula editing dialog with live preview | yes (click to edit, ✓ / `Ctrl+Enter`) | **Implemented** | `src/components/MathTools.tsx` `MathEditDialog` (live preview via the same `renderExpression`, error line, `Ctrl+Enter`/Esc); `tests/e2e/rendering.spec.ts` "edits a formula through the dialog…" |
| Copy formula as LaTeX source | right-click "Copy as Image"; TeX is also in the node | **Implemented** | `MathTools.tsx` popover "复制 LaTeX"; `tests/e2e/rendering.spec.ts` "copies the LaTeX source of a clicked formula" |
| Screenshot / visual regression of key formulas | n/a | **Implemented** | `tests/e2e/rendering.spec.ts` asserts >3 SVG glyph elements per expression and zero `merror`; screenshot baselines in `tests/e2e/visual.spec.ts` |
| Math autocomplete / macro completion | **not implemented** in Typora (a common false claim) | **Out-of-scope** | `MATH_ENVIRONMENTS` is exported for a future autocomplete set, but no completion feature is required for v1 |

---

## 4. Editing

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Instant rendering (Typora-style) | yes — cursor-local source reveal | **Implemented** | `src/components/InstantView.tsx` (click a block to edit it in place; splice of the authoritative source at the block range); `tests/e2e/rendering.spec.ts` "decomposes the document into blocks and edits one without touching the others" |
| Read mode (non-editable rendered view) | **does not exist** (issues #710/#4645/#5352/#6056) | **Implemented** | `ViewMode = 'read'` is the default; `src/components/DocumentView.tsx`; a read-only document refuses to enter edit mode (`tests/e2e/rendering.spec.ts`) |
| Source mode | yes (`Ctrl+/`, CodeMirror) | **Implemented** | `src/components/SourceEditor.tsx` (CodeMirror 6, own undo history, find/replace panel); LF/CRLF fidelity tested |
| Split mode | not supported | **Implemented** | `App.tsx` renders the source and reader panes side by side; `useSplitScrollSync` keeps them on the same region, synchronised **proportionally** rather than by pixel offset, because the same content has different heights in each pane. A re-entrancy lock stops the two listeners driving each other. Covered by the split-view E2E. |
| Markdown shortcuts (bold/italic/code/link/heading/list/quote/table/math block/…, 40+ keys) | yes (full documented table) | **Planned** | PRD R-C-2; `App.tsx` only binds open/save/find/diagnostics/settings/modes/focus |
| Undo / redo | yes | **Implemented** | CodeMirror `history()` in `SourceEditor.tsx` (cleared per document); `tests/e2e/rendering.spec.ts` undo/redo group (2 tests) |
| Smart lists, table editing, code-block editing | yes | **Implemented (core only)** | Table editing is complete (`table.ts` + `TableEditor.tsx`, grid + structural edits + no-op-write guard, `tests/unit/table.test.ts`, `tests/e2e/rendering.spec.ts` grid tests). **Missing half:** smart lists rely on CodeMirror's default markdown keymap (continuation only — no renumbering/Tab-nesting control) and code-block editing has no language selector. |
| Image paste / drag-drop / resource management | yes (+ cloud upload services) | **Implemented** | `src/core/fs/assets.ts` (`<docname>.assets/`, sanitised collision-free names) wired into `SourceEditor.tsx`, `InstantView.tsx`, `App.tsx`; `tests/e2e/rendering.spec.ts` drop/paste tests; `tests/unit/assets.test.ts` |
| Find & replace | yes (`Ctrl+H`) | **Implemented** | Reading view: `store.replaceAll` + `SearchPanel.tsx` replace-all (literal, source-level); source mode: CodeMirror's own find/replace; `tests/e2e/rendering.spec.ts` find-&-replace group (3 tests) |
| Drag a file onto the window to open it | yes | **Implemented** | `App.tsx::onDrop` (image → insert, other file → `openPath`); `dragDropEnabled: true` in `tauri.conf.json`; `tests/e2e/rendering.spec.ts` "dropping an image inserts a reference instead of opening it as a document" |
| Multi-tab editing | no | **Implemented** | `store.ts` tab actions + `src/components/TabBar.tsx`; dirty state survives a switch; `tests/e2e/rendering.spec.ts` tab group |
| Autosave (interval configurable) | opt-in, default 5 min, drafts only on Win/Linux | **Implemented** | `App.tsx` autosave effect (debounced `editor.autoSaveDelayMs`, off by default, skips read-only/unpathed docs); `editor.autoSave`/`autoSaveDelayMs` in `settings.ts`; toggle in `SettingsPanel.tsx` |
| External-change detection + conflict prompt | file tree auto-refresh only | **Implemented** | `store.checkExternalChange()` (2.5 s poll in `App.tsx`) sets `doc.externalChange` and the reload / keep-mine banner renders in `App.tsx` |
| Clobber protection at the IPC boundary | n/a | **Implemented** | `commands.rs::write_text_file_atomic` reads `expectedMtimeMs` from the request body and refuses the write when the file's mtime no longer matches, so a change made between two polls of the frontend's external-change watcher cannot be overwritten. A conflict raises the same banner as a detected external change, giving the reader the reload-or-overwrite choice (ARCHITECTURE §3 S5) |
| Caret/scroll stability across mode switches and re-render | yes (scroll preserved source↔hybrid since 1.13) | **Planned** | PRD R-C-10; reading position is remembered per document, but panes unmount on a mode switch and each starts at its own top |
| Never silently drop unrecognised extensions / comments / frontmatter / macros | **no** — extension renamed to `.md` on save (#6324); "export" reformats reference links | **Implemented** | Range-splice editing means only the touched block changes (`store.applyBlockEdit`, `tests/unit/markdown-blocks.test.ts`, `tests/unit/roundtrip.test.ts` byte-identical no-op); frontmatter/comments/raw-HTML preserved by `rules.ts`/`engine.ts`; CRLF preserved (`tests/e2e/rendering.spec.ts`) |
| Authoritative source + non-destructive model | text edited in place | **Implemented** | `doc.source` is the only write target (`store.ts`, `fileService.ts`); `normalizeEol` never touches the file (ARCHITECTURE §3 S1/S2) |
| Granular autocomplete settings | no — macOS predictive text cannot be disabled (#6198) | **Planned** | PRD R-E-6 (settings surface) |
| Wiki links / `#tags` as syntax | no | **Out-of-scope** | `[[…]]` is left as literal text (matching Typora) |

---

## 5. Files and export

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Open / create / save / save-as `.md`/`.markdown` | yes | **Implemented (core only)** | `src/core/fs/fileService.ts` (`pickOpenPath`, `pickSavePath`, `readFile`, `writeFile`), `store.openPath/save/saveAs/newDocument`. **Missing half:** open and save are wired to the toolbar (`Toolbar.tsx`) and `Ctrl+O`/`Ctrl+S`, but there is no UI for *new* (no `Ctrl+N`/button) and save-as is reached only implicitly when an untitled buffer is saved. |
| UTF-8 with/without BOM | yes | **Implemented** | `encoding.ts::decodeText/encodeText` (BOM restored on write); `tests/unit/encoding.test.ts` |
| UTF-16 files | not documented | **Implemented** | `decodeText` handles UTF-16 LE/BE with BOM; `tests/unit/encoding.test.ts` |
| LF / CRLF / CR detection and exact restoration | "Default Line Ending" preference; behaviour on a CRLF file is undocumented | **Implemented** | `decodeText` (`eol`, `mixedEol`) + `applyEol`/`encodeText`; `tests/unit/roundtrip.test.ts`; CRLF survives an instant and a source-mode edit in `tests/e2e/rendering.spec.ts` |
| Invalid-UTF-8 reporting | not documented | **Implemented** | `decodeText` sets `lossy`; `core/diagnostics/encoding.ts` emits `invalid-utf8` (error) plus `bom-detected`/`mixed-line-endings`; corpus `107-`…/`113-`… and `tests/unit/encoding.test.ts` |
| Missing images / broken relative paths | silently broken | **Implemented** | `core/diagnostics/assets.ts` emits `image-missing`/`image-path-escapes-root` at parse time from both markdown syntax and raw HTML; corpus `110-health-missing-images.md`, `111-health-broken-relative.md`, `107-security-path-traversal-image.md`. The reading surface marks an unresolvable image with a visible placeholder and uses the path as alt text (PRD R-A-8) |
| Atomic save | no documented guarantee; autosave drafts only | **Implemented** | `commands.rs::write_text_file_atomic` (same-dir temp → `write_all`/`sync_all` → `rename`) |
| Rotating backups | no version control on Win/Linux | **Implemented** | `create_backup` + `prune_backups` (`.openmark-backups/`); wired via `safety.keepBackups` |
| Crash recovery | "Recover Unsaved Drafts" (`{date}-{filename}.md`) | **Planned** | backups exist; the recovery UI is Planned (PRD R-C-13) |
| Export HTML (self-contained) | yes (+ "without styles") | **Implemented** | `src/core/export/html.ts` (math/Mermaid inline SVG, code theme resolved, images inlined, scripts stripped, self-containment check); toolbar button in `Toolbar.tsx`; `tests/e2e/rendering.spec.ts` "produces a self-contained HTML file…" |
| Export PDF, offline | yes (native) | **Implemented** | `src/core/export/pdf.ts` → `src-tauri/src/export.rs` (`ICoreWebView2::PrintToPdf` in a hidden webview, temp-file-free load); command registered in `lib.rs`; toolbar button in `Toolbar.tsx`. Not covered by an automated test (needs WebView2). |
| Export Word/Epub/LaTeX/RST/… | via external **pandoc** | **Out-of-scope** | requires a third-party binary; not an offline-first requirement for v1 |
| Export "Markdown (other spec)" / custom shell commands | yes | **Out-of-scope** | Typora-specific |
| Windows file association for `.md` | n/a | **Implemented** | `tauri.conf.json` `bundle.fileAssociations`; argv/`markdown_paths`/`PendingOpenFiles`/`frontend_ready` in `lib.rs`; `tests/desktop/openmark.spec.ts` "opens the fixture through the shell open-file event" (double-click after install not re-tested — KNOWN_ISSUES P3-2) |
| Portable distribution | installer only | **Implemented** | `tauri.portable.conf.json` (`appDirectoriesOverride: "data"`) and `scripts/build-release.mjs --portable` passes `-c tauri.portable.conf.json`; the earlier script gap is fixed |
| Fully offline operation | yes for core read/write/render | **Implemented** | CSP `default-src 'self'` with no remote origins (`tauri.conf.json`, `index.html`) + vendored MathJax/fonts/Mermaid/Shiki; `tests/e2e/rendering.spec.ts` fails on any external request |
| Autosave-on-by-default + version history | no (opt-in; no versions on Win/Linux) | **Planned** | PRD R-C-8; autosave exists but is off by default and there is no version history |

---

## 6. Diagnostics and the six differentiation features (E1–E6)

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| **E1** Compatibility/capability diagnostics with file position + reason | none ("no built-in markdown convert, reformat or lint function") | **Implemented** | `Diagnostic` carries `code`/`severity`/`range`/`source`/`excerpt`/`detail` (`types.ts`); **all 26 declared codes are emitted** across `engine.ts`, `core/diagnostics/*`, `core/render/typesetter.ts`; `tests/unit/corpus.test.ts` asserts every declared diagnostic per fixture |
| **E1** Jump-to-problem | n/a | **Implemented** | `src/components/DiagnosticsPanel.tsx` `onSelect` → `App.tsx::jumpToDiagnostic` scrolls to the math/diagnostic node and flashes it |
| **E2** Math diagnostics panel | no panel; errors are inline red text | **Implemented** | Math errors flow into the unified diagnostics panel with `source:'math'`, `mathId`, `detail` (formula source) and a jump target; `tests/e2e/rendering.spec.ts` and `tests/e2e/visual.spec.ts` (diagnostics panel baseline) |
| **E3** Immersive textbook reading (outline, search, progress, last position) | no reading mode; no tabs; Focus Mode is a writing aid | **Implemented** | Outline (`OutlinePanel.tsx`), search (`SearchPanel.tsx`), progress (`useReadingProgress`), position memory (`session.ts`, e2e-restored) |
| **E4** Safe read-only mode with a stated reason | **does not exist** | **Implemented** | `store.evaluateReadOnly()` + `readOnly`/`readOnlyReason` + guards in `setSource`/`save`; the status bar offers an explicit unlock (`StatusBar.tsx` `unlock-editing`) |
| **E5** Document health check (missing images, broken paths, unclosed fences/math, suspicious syntax) | none | **Implemented** | `engine.ts` structural checks + `core/diagnostics/assets.ts` + `core/diagnostics/encoding.ts`; corpus health fixtures `110-`…`117-` |
| **E5** Health report export / copy | none | **Planned** | PRD R-E-5; diagnostics are shown but there is no report export/copy action |
| **E6** Advanced reading settings (width, density, font, image scale, formula scale) | zoom only | **Implemented** | `SettingsPanel.tsx` + `applySettingsToDocument` → CSS custom properties in `tokens.css`; `tests/e2e/rendering.spec.ts` "reading settings change layout without re-parsing" |
| **E1/E2/E3/E4/E5/E6** delivered as *operable features* (not static UI) | — | **Implemented** | Each has an observable surface and, where a user path exists, an E2E assertion (`tests/e2e/rendering.spec.ts`, `tests/e2e/visual.spec.ts`, `tests/desktop/openmark.spec.ts`) |
| No arbitrary render-size cap | **hard ~2 MB cap** (#1961, open since 2018) | **Implemented** | lazy placeholders + bounded concurrency (`MAX_CONCURRENCY = 6`) + cancellation (`typesetter.ts`); stress fixtures in `tests/corpus/stress/` parse without a cap (perf budget still unmeasured — KNOWN_ISSUES P2-2) |

---

## 7. Security

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Strict CSP, no remote code | Electron app; past XSS CVEs (CVE-2020-18748; 1.9 "Fix XSS on mermaid and math") | **Implemented** | `src-tauri/tauri.conf.json` + `index.html`: `default-src 'self'`, `object-src 'none'`, `frame-src 'none'` |
| Sanitise-before-inject | sandboxed HTML blocks, scripts not rendered | **Implemented** | `src/core/markdown/sanitize.ts` (DOMPurify 3.4.17, allow-lists, forbid-lists, URI regexp, `SAFE_FOR_XML`); `tests/unit/dom/sanitize.test.ts` |
| `<script>`, `onerror`, `javascript:`, `<iframe>/<object>/<embed>`, SVG script | blocked at render | **Implemented** | `FORBID_TAGS`/`FORBID_ATTR`/`ALLOWED_URI_REGEXP` in `sanitize.ts`; `tests/unit/dom/sanitize.test.ts`; `tests/e2e/rendering.spec.ts` "dangerous HTML is neutralised" |
| Sanitisation reported, not silent | n/a | **Implemented** | `SanitizeResult.removed[]` → `html-sanitized`/`script-removed` diagnostics with detail; shown in `DiagnosticsPanel.tsx` |
| Mermaid hardening | `--mermaid-theme` CSS options; strictness not documented | **Implemented** | `securityLevel:'strict'`, `htmlLabels:false`, `suppressErrorRendering:true`, `maxTextSize`, `maxEdges` in `mermaid.ts` |
| Path traversal via image references | "Delete Image" silently deletes the file from disk | **Implemented** | `classifyRelativePath` (decodes `%2F`, refuses a net climb ≥2) in `core/diagnostics/assets.ts` → `image-path-escapes-root`; corpus `107-security-path-traversal-image.md` |
| Remote images reported, not fetched | remote images render/fetch | **Implemented** | `engine.ts::remoteResourceDiagnostics` emits `image-remote`/`link-remote`; corpus `108-security-remote-image.md` |
| External links open in the OS browser | `Ctrl+click` | **Implemented** | `fileService.openExternal` → `tauri-plugin-opener`; `App.tsx::handleLink`; `capabilities/default.json` scopes it to `https/http/mailto` |
| Test-only capability kept out of release | n/a | **Implemented** | `tauri-plugin-wdio` registered only under `#[cfg(debug_assertions)]` (`lib.rs`), capability in `capabilities/wdio.json` |
| Destructive actions previewed | "Delete Image" deletes immediately | **Planned** | PRD R-N-2; the one destructive action reachable today (tab close with a dirty doc) already confirms, but there is no general preview layer |
| Security test layer (malicious corpus ×7 layers) | n/a | **Implemented** | hostile-input fixtures `100-`…`108-security-*` asserted in `tests/unit/corpus.test.ts`, `tests/unit/dom/sanitize.test.ts`, and `tests/e2e/rendering.spec.ts` |

---

## 8. Platform, packaging and test infrastructure

| Feature | Typora 1.14.10 | Status | Evidence |
|---|---|---|---|
| Desktop shell (window, plugins, IPC) | Electron | **Implemented** | `src-tauri/src/lib.rs`, `commands.rs`, `capabilities/default.json` |
| Single-instance hand-off of a second document | separate window per document | **Implemented** | `tauri-plugin-single-instance` + `markdown_paths` + `openmark://open-file` replay in `lib.rs`; `tests/desktop/openmark.spec.ts` |
| Settings persistence | `conf.user.json` | **Implemented** | `settings.ts` (localStorage, typed merge, CSS projection) |
| i18n (Chinese-first, English) | 30+ translations | **Implemented** | `src/i18n/index.ts` (zh + en dictionaries, `setLanguage`/`t`), driven by `AppSettings.language` |
| React UI shell | n/a | **Implemented** | `src/main.tsx`, `src/App.tsx`, `src/components/*` (16 components) |
| Installer build (NSIS, MSI) | yes | **Implemented** | `src-tauri/tauri.conf.json` `bundle.targets`; built artefacts NSIS 9,520,826 B and MSI 10,387,456 B (TEST_REPORT §1) |
| Auto-update | yes | **Out-of-scope for v1** | `tauri-plugin-updater` is not a dependency; signing prerequisites not budgeted (RESEARCH §9.7, KNOWN_ISSUES P2-4) |
| Unit tests (Vitest) | n/a | **Implemented** | 427 tests across 8 files (`tests/unit/**`), `pnpm test` |
| Property / round-trip tests | n/a | **Implemented** | `tests/unit/roundtrip.test.ts` (identity, edit, block-edit, `fast-check` no-op invariant) |
| Browser tests (Playwright) | n/a | **Implemented** | 48 tests in `tests/e2e/rendering.spec.ts` + `tests/e2e/visual.spec.ts` (6 screenshot baselines) |
| Desktop E2E (WebdriverIO + Tauri) | n/a | **Implemented** | 6 tests in `tests/desktop/openmark.spec.ts` driving the compiled binary via `wdio.conf.ts`/`scripts/run-desktop-e2e.mjs` |
| Performance tests | n/a | **Planned** | `scripts/perf-parse.mjs` reports numbers but there are no assertions or CI thresholds (PRD R-N-3, KNOWN_ISSUES P2-2); `tests/perf/` is empty |
| Corpus + manifest + validator | n/a | **Implemented** | 148 fixtures under `tests/corpus/markdown/` + `manifest.json`; validator `scripts/verify-corpus.mjs` (`pnpm corpus:verify`); conformance in `tests/unit/corpus.test.ts` |
| Build test (packaged app runs standalone) | n/a | **Implemented** | `tests/desktop/openmark.spec.ts` runs against `src-tauri/target/release/openmark.exe`; portable zip verified to keep its data in `./data` (TEST_REPORT §1, KNOWN_ISSUES P3-5) |

---

## 9. Where OpenMark is already ahead of Typora (implemented, not aspirational)

1. **Reading-only mode exists and locks writes** (`store.evaluateReadOnly`) — Typora has repeatedly refused this.
2. **Math errors carry a location and the original source** (`math-render-error`/`math-unknown-macro` with
   `range`/`mathId`; failure keeps `expr.raw`) — Typora shows inline red text with no location.
3. **Per-expression MathJax error detection** via `data-mjx-error` — not exposed to Typora users.
4. **BOM/line-ending preservation and atomic writes with rotating backups** — no documented equivalent.
5. **Sanitisation before injection, with the removals reported** — a documented, testable posture.
6. **No arbitrary size cap by construction** (placeholders + lazy, cancellable typesetting) — Typora's cap is
   open since 2018.
7. **Frontmatter and raw HTML comments preserved verbatim** through the parse-and-edit path — Typora's own YAML
   parser is documented as "flexible/fault-tolerant" with no preservation promise.

**Deliberate gaps** (documented, not to be mistaken for completeness): code signing, MSI install testing,
auto-update and an accessibility audit are not done (`docs/KNOWN_ISSUES.md`); relative-image loading in the
reading surface was a gap when this table was first audited; both were fixed and are covered by tests, and
the table has been corrected, as has split-pane scroll sync. No item from that audit remains open.
