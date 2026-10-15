# OpenMark — Product Requirements

Version 0.1 (Phase 0). Language policy: **Chinese-first UI**, English fully supported
(`AppSettings.language: 'zh' | 'en'`, default `'zh'` — `src/app/settings.ts`). Terms and code are English
throughout. Requirement IDs are stable and are referenced by `docs/FEATURE_MATRIX.md` and
`docs/TEST_STRATEGY.md`.

**Product statement.** OpenMark is a Windows 11 desktop Markdown **reader** that is also a Markdown editor:
Typora-class instant rendering, high-fidelity LaTeX/mhchem, an immersive long-document reading experience, and a
hard promise that *looking at a file never changes it*. It runs fully offline and ships as an NSIS installer plus
a portable executable.

---

## 1. Target users

| # | Persona | Primary job | What breaks for them today (evidence) |
|---|---|---|---|
| U1 | **Technical student / researcher reading Chinese textbooks and paper notes** | Read 300–800 line chapters with dense LaTeX, tables, code, diagrams; keep their place across sessions | Typora slows/freezes on math-heavy or large documents (#1285, #6542, #6670); no reading mode; IME defects (#6302, #6554, #6659) |
| U2 | **Developer reading repository documentation** (`README.md`, `docs/**`) | Read `.md` from disk without an IDE; verify links/images resolve; never see a whole-file diff after merely opening a file | Typora has no health check and normalises CRLF/fences on save; Vditor/Milkdown rewrite markdown (RESEARCH §7) |
| U3 | **Writer / note-taker authoring notes** | Write and edit markdown with instant rendering, tables, images, shortcuts, autosave | Typora has no read-only mode, no tabs, silent extension rename (#6324), no lint |
| U4 | **Teacher / reviewer producing course material** | Diagnose malformed markdown and broken formulas, export HTML/PDF for distribution | Typora shows math errors as inline red text with no panel, no error location, no "Force Refresh"-free workflow; `\label`/`\ref` lost in docx export |

Non-goals (explicitly out of scope for v1): collaboration/CRDT, mobile, macOS/Linux builds, a plugin
marketplace, WYSIWYG round-trip through a ProseMirror-style document model.
Blocked-by-licence non-goal: copying Typora source, icons, trademarks or theme assets
(`docs/RESEARCH.md` §8 note on provenance).

---

## 2. The four modes (`ViewMode` = `'read' | 'instant' | 'source' | 'split'`)

The type already exists: `src/app/store.ts` (`export type ViewMode = 'read' | 'instant' | 'source' | 'split'`,
default `'read'`), and `ui.mode` is the single switch. Requirements here define behaviour; the renderer/canvas
implementation is Phase 1–2 work.

| Mode | UI name (zh / en) | Definition | Must be true |
|---|---|---|---|
| `read` | 阅读模式 / Read | Fully rendered, non-editable surface. No caret in content, no markdown markers, link clicks navigate in-app or via the OS opener. The *only* mode entered by default. | R-MODE-1 |
| `instant` | 即时渲染 / Instant | Typora-style editing surface: marks are hidden in rendered blocks and revealed **only for the block the caret is in**. Document text remains the authoritative source, not a re-serialised DOM. | R-MODE-2 |
| `source` | 源码模式 / Source | Raw markdown with syntax awareness (CodeMirror 6-class surface), no rendering. Line/column diagnostics jump here. | R-MODE-3 |
| `split` | 分屏模式 / Split | Source pane + rendered pane, scroll-synchronised both ways, identical document, no second parse (same `RenderResult`). | R-MODE-4 |

Cross-mode rules:

- **R-MODE-5** Switching modes MUST NOT change `doc.source`, the dirty flag, the caret offset, or the scroll
  anchor (measured requirement: Typora preserves scroll on source↔hybrid switch since 1.13 — parity target).
- **R-MODE-6** Every mode MUST be reachable by keyboard and MUST survive a document switch (mode is app state,
  not per-document `[INFERENCE]` — decide in Phase 2 and document it).
- **R-MODE-7** A document opened read-only (§5.4) MUST still offer `read` and `source` (viewing), and MUST enter
  `read` by default; entering `instant`/`split` for it is allowed only as an explicit user action that keeps the
  read-only lock.
- **R-MODE-8** All four modes MUST render math, diagrams and code from the same registries, so a formula looks
  identical in `read`, `instant` and `split`.

---

## 3. Reading-first priority (product rule, not a slogan)

**R-PRIO-1 — Ordering rule.** When two requirements compete for the same budget, the reading side wins. This is
a tie-breaker with consequences: math correctness, reading typography, navigation, performance on large files and
diagnostics all outrank editor conveniences.

**R-PRIO-2 — No editing-only surface.** `read` MUST be usable and complete without any editor capability loaded
(no editing library may be required for first paint).

**R-PRIO-3 — No size cap.** OpenMark MUST NOT impose an arbitrary render-size limit; opening a very large file
MUST succeed with a documented degradation strategy (lazy typesetting, virtualised/windowed blocks) or an explicit
user-confirmed fallback, never a refusal. (Anti-goal evidence: Typora's ~2 MB cap, issue #1961 open since 2018.)
Verification: stress corpus (§TEST_STRATEGY layer 5) + a 3 MB `huge-textbook.md`.

**R-PRIO-4 — Immersive, not "HTML in a scroll container".** The reading surface MUST be a typographic page:
measure-controlled column, CJK-aware font stacks, configurable rhythm, dimmed chrome in focus mode, reading
progress, and a stable scroll anchor that survives re-render and relaunch. (Complaint it answers: Typora's Focus
Mode blurs *other lines*, which is a writing aid, not a reader.)

**R-PRIO-5 — Reading must never be interrupted by typesetting.** Placeholders MUST occupy their final geometry
(no layout shift) and content MUST be ready before it scrolls into view (`LAZY_MARGIN = '150% 0px'`).

---

## 4. Requirements — section 3A: Markdown reading

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| R-A-1 | The four modes of §2 exist and switch (R-MODE-1…8). | P0 | E2E keyboard/screenshot |
| R-A-2 | Headings `#`…`######` plus setext headings, paragraphs, blockquotes incl. nesting, thematic breaks, hard/soft breaks, and indented code all render per CommonMark 0.31.2. | P0 | unit + corpus (652-example baseline) |
| R-A-3 | Ordered/unordered lists nested ≥3 deep, mixed markers, loose vs tight, `3.`-started numbering, and Chinese full-width punctuation inside items render correctly. | P0 | corpus + snapshots |
| R-A-4 | GFM task lists render with checkboxes; in `read` mode checkboxes are non-interactive (engine already passes `{enabled:false}` — `engine.ts`). | P0 | unit |
| R-A-5 | GFM tables, including alignment (`:---`, `:---:`, `---:`), inline code/emphasis/links in cells, escaped `\|`, wide (10-column) tables and CJK-heavy cells. | P0 | corpus + snapshots |
| R-A-6 | Fenced code with/without info string, tilde fences, nested fences, indented code; a ` ```math ` block becomes display math and a ` ```mermaid ` block becomes a diagram. | P0 | unit (`engine.ts` `MATH_FENCES`/`MERMAID_FENCES`) |
| R-A-7 | Code blocks are syntax-highlighted for the shipped language set with instant light/dark switching and **no re-tokenisation** (`defaultColor:false`). | P0 | unit + snapshot both themes |
| R-A-8 | Images resolve relative to the opened document; a missing image produces a visible placeholder **and** a diagnostic, never a broken-image icon alone. | P0 | unit + E2E |
| R-A-9 | External links open in the system browser via the opener plugin; no navigation of the app webview. | P0 | E2E |
| R-A-10 | Footnotes (incl. multi-paragraph) with back-references; definition lists; `~sub~`, `^sup^`, `==mark==`. | P0 | corpus |
| R-A-11 | A document outline (sidebar) built from headings, with click-to-jump, current-heading highlight and filter; anchor ids are deterministic and CJK-safe (`slugifyHeading`, collisions get `-1`, `-2`). | P0 | unit (`nestOutline`, anchors) + E2E |
| R-A-12 | Optional automatic heading numbering (off by default — `reading.autoNumberHeadings`), rendered without mutating the source. | P1 | unit + snapshot |
| R-A-13 | In-document search with match count, next/previous, and highlight; search works in `read` and `source`. | P0 | E2E |
| R-A-14 | Mermaid diagrams render (flowchart + common kinds), are cached by `theme+source`, and a syntax error shows the diagram's source plus a diagnostic instead of Mermaid's own red error block. | P0 | unit + corpus |
| R-A-15 | Light/dark themes plus font family, font size, line height and content width are user-configurable and applied as CSS custom properties only (no re-render) — `src/app/settings.ts::applySettingsToDocument`. | P0 | unit + Playwright screenshot |
| R-A-16 | Focus mode and typewriter mode; full-screen reading; all reversible without touching the document. | P1 | E2E |
| R-A-17 | Multi-tab documents, recent-files list, and last-reading-position memory restored on relaunch. | P0/P1 | E2E + store test |
| R-A-18 | Smooth scrolling and incremental rendering on long documents: HTML is produced synchronously, expensive nodes are typeset on approach, with bounded concurrency (`MAX_CONCURRENCY = 6`) and cancellation when the document is swapped. | P0 | perf layer + stress corpus |
| R-A-19 | Word count and estimated reading time are CJK-aware: 1 hanzi = 1 word, Latin runs counted as words, blended estimate (~400 hanzi/min, ~220 English words/min — `countWords`, `stats.readingMinutes`). | P1 | unit |

---

## 5. Requirements — section 3B: LaTeX and chemistry

| ID | Requirement | Priority | Verification |
|---|---|---|---|
| R-B-1 | MathJax 4 is the engine, bundled locally, working fully offline; `[tex]/mhchem` is loaded. | P0 | offline check (0 external requests) after R-MATH-1 is fixed |
| R-B-2 | Delimiters: `$…$`, `$$…$$` (block and mid-paragraph), `\(…\)`, `\[…\]`, ` ```math `, and bare `\begin{env}…\end{env}` blocks. | P0 | corpus math layer |
| R-B-3 | Environment set = `MATH_ENVIRONMENTS` (align/alignat/gather/multline/equation/cases/dcases/rcases/split/array/matrix/pmatrix/bmatrix/Bmatrix/vmatrix/Vmatrix/smallmatrix/…), nested same-name environments supported. | P0 | corpus math layer |
| R-B-4 | Macro coverage: `\frac`, `\int`, `\sum`, `\lim`, `\left…\right`, super/subscripts, primes, absolute values and norms, Greek, operators, relations, arrows, `\mathbb/\mathcal/\mathfrak/\mathbf/\boldsymbol`, `\overbrace/\underbrace/\xrightarrow/\overset`, multi-line derivations, piecewise functions. | P0 | corpus math layer (≥200 cases) |
| R-B-5 | Chemistry: `\ce{}` reactions, ions, charges, isotopes, hydrates, states `(s)(l)(g)(aq)`, arrows `->` `<-` `<=>` `<->`; `\pu{}` quantities, units, scientific notation (≥40 cases). | P0 | corpus math layer |
| R-B-6 | Equation numbering and cross-references when supported: `\tag`, `\label` + `\ref`/`\eqref`, numbered `align`; numbering is assigned **in document order** (numbered documents typeset eagerly). | P0 | corpus + unit (`needsNumbering`, `setEquationNumbering`) |
| R-B-7 | **A render failure MUST NEVER make the formula's source disappear.** On failure the node keeps the authored source (delimiters included) and shows the error message. | P0 | unit + corpus `expect:"error"` cases |
| R-B-8 | Per-expression error reporting from MathJax's own report (`data-mjx-error` on `<merror>`), surfaced as a diagnostic with range + excerpt + source, and reachable in the math diagnostics panel. | P0 | layer 1 + layer 3 assertions (see TEST_STRATEGY §3) |
| R-B-9 | Formula editing dialog with live preview, and "copy as LaTeX source" from the rendered node. | P1 | E2E |
| R-B-10 | Delimiter ambiguity handled deliberately: `$20 and $30` and `Prices: $5, $10, $15` stay literal; `\$100` stays literal; `$` inside code spans and fences never becomes math; `\(` with no closer falls back to a literal `(`; a lone unclosed `$$` is reported (`unclosed-math`). | P0 | corpus "math ambiguity" documents |
| R-B-11 | Escape handling and inline-currency cases MUST be covered by explicit tests, not by "the page did not throw". | P0 | TEST_STRATEGY §3 |

---

## 6. Requirements — section 3C: Markdown editing

| ID | Requirement | Priority |
|---|---|---|
| R-C-1 | Typora-style instant rendering (marker reveal local to the caret's block), with the markdown text — not a DOM serialisation — as the source of truth. | P0 |
| R-C-2 | Common Markdown shortcuts: bold, italic, inline code, strike, link, image, heading 1–6, paragraph, list, quote, table, code fence, math block, indent/outdent, move line up/down. | P0 |
| R-C-3 | Undo/redo (`Ctrl+Z`/`Ctrl+Y`) that also survives document switches and never loses unsaved text. | P0 |
| R-C-4 | Smart lists (continuation, renumbering, Tab/Shift+Tab nesting), table editing (add/remove row+column, alignment, insert at cell), code-block editing with language selection. | P0 |
| R-C-5 | Image paste and drag-drop; an image that arrives from the clipboard or Explorer is written next to the document (or to a configured folder) and inserted as a relative markdown path; no `data:` blob is written into the document by default. | P0 |
| R-C-6 | Find and replace (with case/whole-word/regex options) inside the *source* model so it works in every mode. | P0 |
| R-C-7 | Open a document by dropping a file onto the window; multi-tab editing. | P0 |
| R-C-8 | Autosave (configurable, off by default — `editor.autoSave`, `autoSaveDelayMs = 4000`) plus explicit save; autosave never converts a read-only document into a writable one. | P0 |
| R-C-9 | External-modification detection with an explicit conflict prompt; a save MUST NOT silently clobber a newer version on disk. | P0 |
| R-C-10 | Caret and scroll position stay stable across mode switches, re-renders, theme changes and lazy typesetting (no jump when a formula finishes). | P0 |
| R-C-11 | **No silent loss**: unrecognised Markdown extensions, HTML comments, frontmatter, math macros and any other source text MUST survive a load→save cycle byte-for-byte unless the user explicitly edits them. | P0 |
| R-C-12 | An authoritative markdown source and a non-destructive document model are maintained; any fragment that cannot be edited losslessly is either preserved verbatim or falls back to read-only (never re-serialised). | P0 |
| R-C-13 | Unsaved-work safety: a crash or kill during editing must leave a recoverable artefact (backups/rotating saves — `.openmark-backups/`, `BACKUP_KEEP = 20`), and recovery is offered on next launch. | P0 |

> **R-C-11 / R-C-12 are the load-bearing requirements of the whole product.** They are the reason the editor
> kernel is not the document owner (RESEARCH §7.3) and the reason `writeFile` takes the *original* `bom`/`eol`
> back (`src/core/fs/fileService.ts`, `src/core/fs/encoding.ts`).

---

## 7. Requirements — section 3D: files and export

| ID | Requirement | Priority |
|---|---|---|
| R-D-1 | Open / create / save / save-as for `.md` and `.markdown`. | P0 |
| R-D-2 | UTF-8 with and without BOM; UTF-16 LE/BE read support; LF, CRLF and CR detected and **restored exactly** on save; mixed endings reported; invalid UTF-8 decoded lossily **and reported** (`bom-detected`, `crlf-detected`, `mixed-line-endings`, `invalid-utf8`, `non-utf8-encoding`). | P0 |
| R-D-3 | Relative image paths resolve against the document's own directory through the asset protocol (`resolve_asset_url` → `convertFileSrc`). | P0 |
| R-D-4 | Atomic save (temp file in the same directory + fsync + rename) so a crash mid-save cannot truncate the document; rotating backups; a failed write leaves the original intact. | P0 |
| R-D-5 | Export HTML that is **self-contained** (math as inline SVG with local glyph cache, diagrams as SVG, images embedded or copied). | P0 |
| R-D-6 | Export PDF offline, with formulas, diagrams, code, images and page breaks visually equivalent to the on-screen rendering. | P0 |
| R-D-7 | Windows file association for `.md`/`.markdown`, "Open with" integration, single-instance hand-off of a second file, and a portable distribution that keeps its data beside the executable. | P1 |
| R-D-8 | Opening and rendering a local document MUST require no network access at all (verifiable: zero non-local requests while opening and reading the corpus). | P0 |

---

## 8. Requirements — section 3E: the six differentiation features

These are the goal's mandated improvements over Typora. Each is a real, operable feature — **not** a static panel
or a placeholder button.

| ID | Feature | Requirement | Priority | Anti-goal it answers |
|---|---|---|---|---|
| **R-E-1** | **兼容性诊断 / Compatibility diagnostics** | Detect markdown and LaTeX that OpenMark cannot interpret correctly, and report the **file position and reason** for each. Every diagnostic carries `code`, `severity`, `range` (1-based line/column + offset), `source` subsystem, optional `excerpt` and optional `detail` (`src/core/markdown/types.ts::Diagnostic`). Clicking a diagnostic jumps to the location in the editor. | P0 | Typora has no lint/health check at all |
| **R-E-2** | **公式诊断面板 / Math diagnostics panel** | Jump to a failing formula, view its source, see MathJax's own error text; errors are attributed per expression (`mathId`) and the panel keeps working after the formula is fixed. | P0 | Typora: red inline text, no location, only "Force Refresh"; 1.13 macro regressions |
| **R-E-3** | **沉浸式教材阅读 / Immersive textbook reading** | Sidebar outline, in-document search, reading progress indicator, and last-reading-position memory restored on reopen. | P0 | Typora: no tabs, Files+Outline cannot coexist, Focus Mode is a writing aid |
| **R-E-4** | **安全只读模式 / Safe read-only mode** | Opening a complex or untrusted file MUST NOT put the source at risk: the document opens read-only with a stated reason, editing is disabled, and writes are refused until the user explicitly unlocks it. Entry criteria are conservative and configurable (`safety.safeReadOnlyForComplexFiles`, `largeFileThresholdBytes = 512 KB`; triggers: oversize, structural errors such as `unclosed-fence`/`unclosed-math`, or a heavily raw-HTML document). | P0 | Typora has no read-only mode (#710/#4645/#5352/#6056) |
| **R-E-5** | **文档健康检查 / Document health check** | One report per document covering: missing images, broken relative paths, unclosed code fences, unclosed `$$`, duplicate heading anchors, dangling reference links, tabs used for list indentation, inconsistent list markers, unclosed HTML comments, and suspicious math syntax. Each item is actionable (jump + explanation) and is exportable/copyable. | P0 | Typora cannot even tell you an image is missing |
| **R-E-6** | **高级阅读设置 / Advanced reading settings** | Page width, typographic density/rhythm, font family and size, line height, justification/hyphenation, image scale and **formula scale**, plus light/dark/system theme. All applied via CSS custom properties (`--om-content-width`, `--om-density`, `--om-image-scale`, `--om-math-scale`, …) so changes are instantaneous and never re-render the document. | P0 | Typora: zoom only, limited typographic control, RTL/vertical writing are CSS hacks |

---

## 9. Cross-cutting (non-functional) requirements

| ID | Requirement |
|---|---|
| R-N-1 | **Offline-first**: no runtime network access for reading, rendering, editing, exporting or updating; CSP `default-src 'self'` with no remote origins (already configured in `src-tauri/tauri.conf.json` and mirrored in `index.html`). |
| R-N-2 | **Security**: sanitise-before-inject; no document-controlled script execution; `javascript:` URLs and inline event handlers never survive; destructive actions are never silent (RESEARCH §6.2). |
| R-N-3 | **Performance budgets** (measured, per TEST_STRATEGY layer 5): first paint of a 100 KB document, scroll smoothness on a 3 MB document, document switch, search, and memory ceiling. Numbers to be fixed at the end of Phase 1 and then held as regressions. |
| R-N-4 | **Data safety**: no known data-loss path in round-trip tests; every discovered loss becomes a regression test. |
| R-N-5 | **Accessibility / keyboard**: every feature reachable by keyboard; visible focus rings; `prefers-reduced-motion` respected (`tokens.css`). |
| R-N-6 | **i18n**: Chinese-first UI with an English translation; no hard-coded user-visible strings in components. |
| R-N-7 | **Self-contained distribution**: an NSIS installer and a portable build, both runnable on a clean Windows 11 x64 machine (with Smart App Control caveats documented — RESEARCH §9.7). |
| R-N-8 | **Documentation**: README, USER_GUIDE, ARCHITECTURE, TEST_REPORT, KNOWN_ISSUES, LICENSE_NOTICES. |

---

## 10. Acceptance criteria for "v1 complete"

Derived from the goal's completion conditions; each is verifiable by an artefact, not by assertion.

1. The packaged Windows application starts on a clean machine (installer **and** portable).
2. Reading, editing, math rendering and file saving are complete and usable; all four modes switch correctly
   (R-MODE-1…8).
3. Common markdown and all **supported** formulas in the corpus render correctly — asserted against MathJax's
   error report and screenshot regression, not against DOM presence (TEST_STRATEGY §3).
4. Round-trip save tests show **no known data loss** (byte-exact for untouched regions).
5. The main end-to-end suites pass.
6. No open P0/P1 defects.
7. Startup/open/large-file/scroll/search/memory budgets are measured and within budget.
8. The six differentiation features (R-E-1…6) are demonstrably operable on real documents.
9. Docs listed in R-N-8 exist and match the shipped build.
