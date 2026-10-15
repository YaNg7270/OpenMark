# OpenMark — Architecture

Phase 0 baseline, 2026-10-15. This document describes the architecture **as built** and the boundaries that are
still empty by design. File inventory is verified by directory listing; when a module is named but not yet
present it is marked `(planned)`.

---

## 0. Verified inventory (what exists right now)

```
src/
  app/
    store.ts            300 lines  Zustand store: document state, four modes, save/open, read-only gate
    settings.ts         186 lines  settings model, localStorage persistence, CSS-variable projection
  core/
    fs/
      encoding.ts       141 lines  BOM/EOL detection + exact restoration, lossy-decode reporting, content hash
      fileService.ts    251 lines  Tauri-backed (and browser-fallback) file access, dialogs, asset URLs
    markdown/
      types.ts          214 lines  shared contracts (Diagnostic, MathExpression, RenderResult, …)
      engine.ts         596 lines  markdown-it construction, collect pass, outline, structural diagnostics, parseDocument
      rules.ts           69 lines  frontmatter rule (raw-preserving)
      math-plugin.ts    373 lines  hand-written math tokenizer (block + inline) and its ambiguity rules
      collector.ts       83 lines  RenderCollector: id assignment in document order, diagnostics helper
      placeholders.ts    54 lines  emit empty placeholder HTML for deferred constructs
      line-index.ts     183 lines  offset⇄line/column index + forward-only SourceLocator
      sanitize.ts        88 lines  DOMPurify configuration (sanitise-before-inject)
    render/
      typesetter.ts     243 lines  fills placeholders: lazy scheduling, ordering, cancellation, WorkQueue
      highlighter.ts    212 lines  Shiki, dual themes, per-language dynamic import, alias resolution
      mermaid.ts        139 lines  Mermaid initialisation, theme variables, render cache, validate()
    math/
      mathjax.ts        265 lines  MathJax 4 load/config, per-expression convert, merror detection, numbering
    diagnostics/         —  (planned) health-check aggregation & report formatting
    editor/              —  (planned) editor-kernel adapter
    export/              —  (planned) self-contained HTML and PDF
  styles/tokens.css     177 lines  design tokens + light/dark palettes; the only place appearance lives
  types/markdown-it-plugins.d.ts   ambient typings for the JavaScript-only markdown-it plugins
  components/ , i18n/     —  (planned) React surface and translations (no .tsx file exists yet)
scripts/
  prepare-mathjax.mjs          vendors mathjax@4.1.3 into public/mathjax/v4 (symlink-safe)
  generate-icon.mjs            icon pipeline
  env.sh                       project-local Rust toolchain + MSVC/SDK environment
src-tauri/
  src/lib.rs             170 lines  window, plugin set, single-instance hand-off, `openmark://open-file` event
  src/commands.rs        351 lines  read / atomic write (+rotating backups) / stat / list_dir / asset URL / …
  tauri.conf.json                   window, CSP, asset protocol, bundle targets + file associations
  tauri.portable.conf.json          `app.appDirectoriesOverride: "data"` for the portable flavour
  capabilities/default.json         fs/dialog/opener/store/window-state/os/process permissions
  capabilities/wdio.json            test-only `wdio:default`, referenced by a debug-only plugin
```

`index.html` loads `/src/main.tsx`; **that entry point does not exist yet** (`src/components/` and `src/i18n/`
are empty). Consequence: the frontend shell is Phase 1 work, while the rendering pipeline below is implemented
and testable headlessly.

---

## 1. Layering

```
      Rust (src-tauri)
        │  IPC: read_text_file / write_text_file_atomic / stat_file / list_dir /
        │        resolve_asset_url / path_exists / default_documents_dir / app_version /
        │        frontend_ready / show_main_window    + event openmark://open-file
        ▼
  core/fs        bytes ⇄ text; BOM/EOL authority; atomic write contract
        ▼
  core/markdown  text → HTML + registries + diagnostics   (pure, synchronous, no DOM, no network)
        ▼
  core/math + core/render   registries → real content     (async, DOM, lazy, cancellable)
        ▼
  app/store      single source of truth for document + UI state
        ▼
  components/ (planned)   React view; owns no document logic
```

Rules that keep the layering honest:

- `core/markdown/**` MUST NOT import `core/math/**`, `core/render/**`, or anything DOM-specific. This is what
  makes `parseDocument` testable in Node and what keeps the MathJax-on-Windows defect (RESEARCH §3.1) from
  reaching the parser.
- `core/**` MUST NOT import `app/**` or `components/**`.
- Only `core/fs/fileService.ts` talks to `@tauri-apps/*`; everything above it is transport-agnostic.

---

## 2. Data flow: parse → placeholders → lazy typeset

### 2.1 Stage 0 — bytes to text (`core/fs`)

`read_text_file` returns **raw bytes** (`FilePayload.bytes`), not a string: the JS layer owns encoding
(`commands.rs` header). `decodeText(bytes)` (`core/fs/encoding.ts`) detects a UTF-8 BOM, decodes UTF-16 LE/BE,
falls back to a lossy UTF-8 decode for anything else, and reports the dominant line-ending style plus a
`mixedEol` flag and a `lossy` flag. `OpenedFile` (`fileService.ts`) carries `text`, `hash`, `size`, `mtimeMs`,
`bom`, `eol`, `lossy`, `mixedEol` — i.e. everything the write path needs to restore the file *identically*.

### 2.2 Stage 1 — parse (`core/markdown/engine.ts`)

`parseDocument(source, engine, hooks)` is pure, synchronous and DOM-free:

1. `normalizeEol(source)` → LF-only working copy (line **count and ordering** preserved, so diagnostics stay valid
   for the on-disk file; the original bytes are never touched — `line-index.ts` header).
2. `new LineIndex(normalized)` — sorted line-start array + binary search; `spanForLines`, `range`,
   `positionAt`, `lineAt`, `columnAt`.
3. `new RenderCollector(index)` — id sequences for math/mermaid/code/preserved, plus the diagnostics list.
4. `structuralDiagnostics()` — fence balance and `$$` parity, run **before** rendering so a file that would
   swallow the rest of the document is reported even if the parse is degenerate.
5. `engine.render(normalized, env)` — markdown-it with `html:true`, `linkify:true`, `breaks:false`,
   `typographer:false`, plus the custom block/inline rules.
6. `hooks.sanitizeHtml(html)` — the sanitiser lives in the browser layer and is injected, keeping the core
   Node-testable (§4).
7. `countWords(stripHtml(html))` → `stats` (bytes, lines, `parseMs`, counts, words, `readingMinutes`).
8. Diagnostics are sorted by line, then severity.

### 2.3 Stage 2 — the collect pass (the heart of the design)

markdown-it's core rule `openmark_collect` runs after `inline` and walks the flat token stream **in document
order**. For each construct it (a) assigns a stable id, (b) resolves an exact source range, and (c) records what
it found in the collector:

| token | collected as | range source |
|---|---|---|
| `om_frontmatter` | `env.frontmatter` + `frontmatterValue` (YAML) + `preserved` entry | `token.map` |
| `math_block` | `MathExpression` (`display:true`, delimiter from the tokenizer) | `token.map` |
| `fence` (lang ∈ `math`,`mathjax`) | `MathExpression` with `delimiter:'math-fence'` | `token.map` |
| `fence` (lang ∈ `mermaid`,`mmd`) | `MermaidDiagram` + `detectMermaidKind` | `token.map` |
| other `fence` | `CodeBlock` (keeps the **verbatim** `info` string, separate from `lang`) | `token.map` |
| `code_block` (indented) | `CodeBlock` with `lang:''`, `plain:true` | `token.map` |
| `heading_open` | heading draft → slug (`slugifyHeading`) → `id` set on the token → nested `outline` | `token.map` |
| `html_block` / `html_inline` that is a comment | `preserved` entry, kind `html-comment` | `token.map` / `SourceLocator` |
| `math_inline` child | `MathExpression` | **`SourceLocator`** (markdown-it exposes no inline offsets) |

Two mechanisms make this cheap and correct:

- **`SourceLocator`** is a *forward-only cursor* with `indexOf`: because constructs are emitted in document
  order, a search that never rewinds finds the right occurrence even when the same formula repeats. It is
  clamped to the owning token's line span (`bounds`) so an identical string inside a code block or link target
  cannot satisfy a later search, and it falls back to an unbounded search when a block map is approximate (lazy
  continuation lines). `skip()`/`advanceTo()` let literal regions be stepped over.
- **Placeholders are separated from payloads.** `renderPlaceholderToken` emits empty markup
  (`mathPlaceholder`, `mermaidPlaceholder`, `codePlaceholder`, `preservedPlaceholder`) carrying only a stable
  `data-om-*` id and a CSS hook (`placeholders.ts`). The classification lives on `token.meta` so the renderer
  stays a pure function of the token, and an unresolved id degrades to a visible `om-math--orphan` marker rather
  than an empty box the user cannot act on (`math-plugin.ts` renderers).

Ids are `math-<n>`, `mermaid-<n>`, `code-<n>`, `env-<n>` assigned in document order — stable for a given
document, which is what lets the editor key a decoration cache on them.

### 2.4 Stage 3 — lazy typesetting (`core/render/typesetter.ts`)

`typesetPlaceholders({root, math, mermaid, code, dark, signal, eager})`:

1. Index the three registries by id; `querySelectorAll` the three `data-om-*` attribute sets in one pass each.
2. **Code** and **Mermaid** are queued into a `WorkQueue(MAX_CONCURRENCY = 6)` — a bounded semaphore, "enough
   here: tasks are independent, idempotent and small, and the only goal is to stop a document with hundreds of
   formulas from monopolising the main thread in one burst".
3. Math is split by one question: does the document need equation numbering
   (`needsNumbering(math.map(m => m.tex))`, or `eager`)? If yes → drain the queue, enable AMS numbering, clear
   the MathJax document, then convert **sequentially in document order** (a lazy subset would receive numbers in
   viewport order). If no → numbering is switched **off** and math joins the queue.
4. `fillMath` / `fillMermaid` / `fillCode` are idempotent (`data-om-filled="1"`), and each failure path
   preserves the source (`expr.raw` / `diagram.code`) and emits a diagnostic via `onDiagnostic`.
5. `signal: AbortSignal` aborts every pending task, so opening another file cannot let a stale render write into
   the new document.

`LAZY_MARGIN = '150% 0px'` is the intended observer root margin: content is ready one viewport before it arrives,
so there is no visible pop-in during ordinary reading. **(planned detail)** the current file documents this
deferral contract and the scheduling above; the `IntersectionObserver` wiring itself
(`data-om-filled` guards, `rootMargin`) is a thin `components/`-layer responsibility and is not yet written.

### 2.5 Stage 4 — state (`app/store.ts`)

`doc.source` is the authoritative text; `doc.savedSource` is the last successful load/save (dirty detection),
`doc.hash` is an FNV-1a content hash used for change detection. `openPath()` runs the whole pipeline and then the
read-only gate; `setSource()` re-parses on every edit and is refused outright when `doc.readOnly`;
`checkExternalChange()` compares `stat().mtimeMs` against the loaded value and sets `doc.externalChange`.
`ui` holds mode/sidebar/searchQuery/activeHeadingId/progress/notice. Settings changes go through
`updateSettings()` → `applySettingsToDocument()` (CSS variables) + `saveSettings()` (localStorage) — appearance
changes never re-render a document.

---

## 3. Authoritative-source model (round-trip fidelity)

**Invariant S1 — the file text is the only write target.** `writeFile(path, text, {bom, eol, …})` is called with
`doc.source`, never with anything derived from the rendered HTML or a parse tree. markdown-it has no serializer
(RESEARCH §2.2), and both candidate editor kernels *do* reconstruct markdown from a DOM/doc model and are
measurably lossy (RESEARCH §7), so no kernel may sit between the text and the file.

**Invariant S2 — byte identity for untouched regions.** The read path records BOM and EOL and the write path
restores them (`encoding.ts::applyEol`/`encodeText`); `normalizeEol` is applied to the *working copy* only, and
"the file service owns round-trip fidelity, not the reader". A Windows file with CRLF therefore does not become a
whole-file diff in git merely because it was opened.

**Invariant S3 — nothing is silently dropped.** Constructs the pipeline refuses to interpret are re-emitted
inside `<div class="om-preserved">` so the author can always see and recover exactly what they wrote
(`placeholders.ts` comment: "the concrete implementation of 'never silently drop source'"). Frontmatter keeps its
raw text verbatim, including the closing fence (`rules.ts::FrontmatterInfo.raw`); a malformed frontmatter block
still round-trips because the writer works from the original source.

**Invariant S4 — edits are surgical or refused.** The editor may only patch ranges of the authoritative text.
Any fragment that cannot be edited losslessly is preserved verbatim or made read-only (PRD R-C-12). This is also
why diagnostics are *ranges* (line/column/offset) rather than DOM nodes.

**Invariant S5 — writes are guarded.** `writeFile` takes `makeBackup` and `expectedMtimeMs`; the Rust side
refuses to write into a non-existent directory, writes a temp file in the same directory, `write_all` + `flush` +
`sync_all`, then `rename` — and removes the temp file on any early return. Backups are
`<parent>/.openmark-backups/<name>.<utc>.bak`, pruned to the newest 20.
**Verified gap:** `expectedMtimeMs` is sent by the JS layer (`fileService.ts` documents that "the Rust side
rejects the write"), but `commands.rs::write_text_file_atomic` currently reads only `makeBackup` from the invoke
payload — the mtime guard is **not implemented**. The UI-level check (`checkExternalChange`) exists; the
IPC-level guard does not. Tracked as a Phase-1 defect.

**Invariant S6 — a document can be locked.** `evaluateReadOnly()` (store) forces read-only when the file exceeds
`safety.largeFileThresholdBytes` (512 KB default), when structural error diagnostics
(`unclosed-fence`/`unclosed-math`/`html-sanitized`) are present, or when the file is predominantly raw HTML
(>40 block-level tags and >20% of lines). `setSource` and `save` both refuse while locked, with a Chinese
explanation surfaced via `ui.notice`, and `readOnlyReason` explains why.

---

## 4. Editor-kernel adapter boundary

**Position.** The document model belongs to OpenMark, not to an editor library. Vditor (`ir`/`wysiwyg`) and
Milkdown (`Crepe`) were both evaluated and both rewrite markdown on save (RESEARCH §7.1, §7.2). The adapter
therefore exists to let a *view* be swapped — for editing ergonomics, IME behaviour or table UX — without
touching the file system, the parse pipeline, the diagnostics, or the typesetting.

**Boundary definition (`core/editor/`, planned).**

```ts
export interface EditorKernel {
  mount(host: HTMLElement, opts: KernelOptions): Promise<void>;
  destroy(): void;

  /** Replace the buffer. Must not normalise: the caller passes the file's exact text. */
  setText(text: string): void;
  /** Current buffer, byte-identical to setText() when the user made no edit. */
  getText(): string;

  /** The only channel through which edits are reported. */
  onDidChange(cb: (change: TextChange) => void): void;

  /** Caret/selection as offsets into the authoritative text (not DOM positions). */
  getSelection(): { anchor: number; head: number } | null;
  setSelection(anchor: number, head: number): void;
  /** Scroll anchor that must survive a re-render. */
  getScrollAnchor(): ScrollAnchor;
  restoreScrollAnchor(anchor: ScrollAnchor): void;

  /** Diagnostics/annotations are projected onto ranges of the text. */
  setDiagnostics(items: readonly Diagnostic[]): void;
  /** Scroll target for "jump to this problem". */
  revealRange(range: DocRange): void;

  /** Hosts for deferred rendering: the kernel returns a node for a placeholder id. */
  resolvePlaceholder(id: string): HTMLElement | null;

  /** Undo/redo ownership stays with the kernel, but must be queryable. */
  canUndo(): boolean;
  canRedo(): boolean;
  undo(): void;
  redo(): void;
  /** Suspend change events while the host performs a programmatic mutation. */
  transact(fn: () => void): void;
}
```

What is kernel-**agnostic** and must stay outside any kernel:

| Concern | Owner | Why |
|---|---|---|
| File bytes, BOM, EOL, atomic write, backups | `core/fs` + `src-tauri` | fidelity invariants S1/S2/S5 |
| Markdown → HTML, registries, ranges | `core/markdown` | shared by all four modes, Node-testable |
| Math/Mermaid/Shiki rendering | `core/render`, `core/math` | must be identical in `read` and `split` (PRD R-MODE-8) |
| Diagnostics and health check | `core/markdown` + `core/diagnostics` | must work with no editor mounted at all (PRD R-PRIO-2) |
| Settings and CSS projection | `app/settings` | appearance never triggers a document re-render |
| Modes | `app/store` (`ViewMode`) | mode is app state, not a kernel concept |

**Kernel requirements** if one is adopted for `instant`/`split` only: (1) a text model with offsets — a DOM-only
model is disqualified because Range↔offset mapping is what diagnostics and `revealRange` need (Vditor issue
#1901 documents that this is impossible on top of a DOM model); (2) programmatic `setText` that does not
normalise; (3) composition/IME handling for CJK; (4) an extension point for replacing the math renderer with
MathJax 4 (Vditor's `customRenders` cannot intercept `language:'math'` — branch order in `processCode.ts`;
Milkdown's swap is localised but requires bundling MathJax 4 + fonts); (5) an offline-clean distribution
(Vditor's default is a CDN, and `addScriptSync` needs inline-script CSP).
**The intended default is a CodeMirror 6 source/instant surface built in-house**, precisely because it satisfies
(1) and (2); the adapter exists so this decision can be revisited without a rewrite.

---

## 5. Security model (sanitise-before-inject)

**Ordering is the model.** Author HTML is sanitised *while every deferred construct is still an empty
placeholder*, then trusted libraries inject content into already-sanitised containers (`sanitize.ts` header).
Sanitising *after* typesetting would force `ALLOWED_TAGS` to include SVG `<use>`/`foreignObject`, which is
exactly what DOMPurify's SVG rules exist to block.

| Layer | Control |
|---|---|
| Window | CSP `default-src 'self'; script-src 'self'; object-src 'none'; frame-src 'none'; base-uri 'self'` (`tauri.conf.json`, mirrored in `index.html`). `style-src 'unsafe-inline'` is the single documented weakening, required because MathJax and Mermaid emit inline styles; `worker-src 'self' blob:` for the Mermaid worker. |
| Markdown HTML | `DOMPurify 3.4.17`: explicit `ALLOWED_TAGS`/`ALLOWED_ATTR` allow-lists; `FORBID_TAGS` = script/style/iframe/object/embed/form/base/link/meta; `FORBID_ATTR` = inline `on*` handlers, `formaction`, `srcdoc`; `ALLOWED_URI_REGEXP` limited to `http(s)`, `mailto`, `tel`, `data:image/*`; `SAFE_FOR_XML:true`; `KEEP_CONTENT:false`; `ALLOW_DATA_ATTR`/`ALLOW_ARIA_ATTR` on. |
| Removed content | Named back to the user (`removed[]` → `html-sanitized` diagnostics: "Removed unsafe HTML: `<script>`", detail: "The element is preserved in the source file but is not rendered") so sanitisation is never silent. |
| Math | MathJax output is generated by a trusted library from untrusted input; a failed expression surfaces MathJax's own message and the original LaTeX, never executable content. |
| Mermaid | `securityLevel:'strict'`, `htmlLabels:false`, `suppressErrorRendering:true`, `maxTextSize:200_000`, `maxEdges:1_000` — untrusted diagram source cannot execute script or inject HTML labels. |
| Code | Escaped by markdown-it / Shiki; placeholders carry no content at all until highlighting runs. |
| Links | External URLs are opened through the OS opener plugin (`openExternal` → `tauri-plugin-opener` with `https/http/mailto` scope) rather than navigating the webview. |
| Filesystem | Commands are app-local; `capabilities/default.json` grants only dialog/fs/opener/store/window-state/os/process surfaces plus an explicit `fs:scope` of `**`; the asset protocol is enabled with scope `**` but every URL passes `resolve_asset_url`, which canonicalises the path on the Rust side before `convertFileSrc`. |
| Test surface | `wdio:default` exists only under `#[cfg(debug_assertions)]` (`lib.rs`), so release binaries do not register the plugin. |
| Remote resources | Remote images/links are *reported*, never fetched implicitly by the app (`image-remote`, `link-remote` diagnostic codes in `types.ts`; emission is planned — see `docs/FEATURE_MATRIX.md`). |

**Residual risks (honest list).** (a) `assetProtocol.scope: ["**"]` is broad; the real control is
`resolve_asset_url` + the reported-not-fetched policy, and a path-escape check (`image-path-escapes-root`) is
declared but **not yet implemented**. (b) `style-src 'unsafe-inline'` is required. (c) MathJax's dynamic font
fetch (RESEARCH §3.5) is blocked by CSP — a correctness risk, not a security one.

---

## 6. Performance architecture

| Mechanism | Where | Effect |
|---|---|---|
| Synchronous parse, deferred rendering | `engine.ts` + `placeholders.ts` | HTML for a multi-MB document is produced without MathJax/Mermaid/Shiki |
| Placeholders own final geometry | `placeholders.ts` / `tokens.css` | no layout shift when content arrives (PRD R-PRIO-5) |
| Bounded concurrency | `typesetter.ts::WorkQueue(6)` | hundreds of formulas cannot monopolise the main thread |
| Cancellation | `AbortSignal` through `typesetPlaceholders` | stale work cannot write into a new document |
| Diagram cache by `theme+source`, 200 entries | `mermaid.ts` | re-opening a chapter re-renders nothing |
| Per-language grammar chunks | `highlighter.ts` (literal `import()` specifiers, `manualChunks: {mermaid}` in `vite.config.ts`) | initial payload stays small; Vite can see every specifier |
| Dual-theme highlighting in one pass | `highlighter.ts` `defaultColor:false` | theme switch is CSS-only |
| Appearance via CSS variables | `settings.ts` + `tokens.css` | settings changes are O(1), no re-render |
| `LineIndex` binary search | `line-index.ts` | O(log n) offsets for a 50k-line file |
| Mermaid lazy import (~6 MB of chunks) | `mermaid.ts` | never in the first bundle |

**Planned for large documents (Phase 3):** block-level windowing/virtualisation above a size threshold,
`IntersectionObserver` wiring with `rootMargin`, and a measured budget for open → first paint.

---

## 7. Tauri layer

**Commands (`src-tauri/src/commands.rs`).** All return `Result<T, String>` (typed `AppError` flattened at the
boundary so JS has one shape):

| Command | Contract |
|---|---|
| `read_text_file(path)` | raw bytes + `path`, `size`, `mtime_ms` |
| `write_text_file_atomic(path, bytes)` | temp file in the *same* directory → `write_all` → `flush` → `sync_all` → `rename`; optional rotating backup; `WriteResult{path,size,mtime_ms,backup_path}`. Reads `makeBackup`/`make_backup` from the raw payload without deserialising `bytes` twice. |
| `stat_file(path)` | `None` when the file does not exist (a normal answer, used for polling) |
| `list_dir(path)` | directories first, then case-insensitive by name; entries that vanish mid-listing are skipped |
| `resolve_asset_url(path)` | canonicalise (symlinks resolved) so the result matches the asset-protocol scope check |
| `path_exists`, `default_documents_dir`, `app_version` | small helpers |

**`lib.rs`.** Single-instance plugin registered first (so a second launch cannot race a second window), then
dialog/fs/opener/store/window-state/process/os/persisted-scope; `tauri-plugin-wdio` only under
`#[cfg(debug_assertions)]`. Startup argv is parsed for markdown paths (`is_markdown`, `absolutize`) and parked in
`PendingOpenFiles`, because the JS bridge does not exist yet at process start; `frontend_ready` (invoked by the
frontend once its listener is attached) replays them as `openmark://open-file` events and returns how many were
replayed. The window is created with `visible:false` and a themed `backgroundColor` so WebView2's blank surface
is never seen; `reveal_main_window` shows it from `setup`, from the second-instance handler, or on demand via
`show_main_window`.

**Capabilities.** `default.json` (window `main`, platform windows) grants `core:default`, `dialog:allow-open`,
`dialog:allow-save`, `fs:default` + explicit read/write/stat/exists/mkdir, an `fs:scope` of `**`, scoped
`opener:allow-open-url` for `https/http/mailto`, and store/window-state/os/process defaults. `wdio.json` is the
test-only capability. `tauri.conf.json` keeps `app.security.capabilities: []`, which means the directory is
auto-discovered (listing entries there would restrict the set to exactly those listed).

**Distribution.** `targets: ["nsis","msi","app"]` — NSIS is primary (per-user, no admin, not affected by the
VBSCRIPT deprecation); `app` is macOS-only and should be dropped for a Windows-only product. Portable = raw
`.exe` via `--no-bundle` plus `appDirectoriesOverride: "data"`. File association for `md`/`markdown` is
registered by the installer (cannot silently become the default handler on Windows 11). PDF export targets
`ICoreWebView2_7::PrintToPdf` through `Webview::with_webview`, behind the optional `pdf-export` Cargo feature —
**no PDF command exists yet** (RESEARCH §9.4).

**Planned Rust additions:** `expectedMtimeMs` enforcement in `write_text_file_atomic` (§3 Invariant S5), the
`pdf-export` command, and a watcher event for external change (currently polled from the frontend).
