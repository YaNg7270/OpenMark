# Repository Guidelines

## Project Overview

OpenMark is a Windows 11 desktop Markdown reader/editor: Typora-class instant rendering, offline
LaTeX/mhchem, and immersive long-document reading. UI text is Chinese-first, with English
available. The product runs entirely offline — no CDN, no network call while rendering.

The build targets a real installable product (NSIS + MSI installers, plus a portable zip whose
config and WebView2 profile live in a `data/` folder beside the executable), not a dev-server page.

**Stack:** Tauri 2.12 (Rust 1.99) + React 19 + TypeScript 7 + Vite 8 · `markdown-it@15` + GFM
plugins · MathJax 4.1.3 (SVG, mhchem) · Mermaid 12 · Shiki 4 · DOMPurify 3.4 · zustand.

---

## Architecture & Data Flow

**Layering is strict and one-directional: `core` ← `app` ← `components`.** There are zero imports
from `core/` back into `app/`, `components/` or `i18n` — keep it that way. `src/App.tsx` and
`src/main.tsx` are the only wiring points above `components/`.

| Layer | May import | Owns |
|---|---|---|
| `src/core/**` | only `core/**` | the pipeline. DOM-free except `core/render/*` |
| `src/app/**` | `core/**`, `@/i18n` | zustand store, settings, session. Sole owner of the one `MarkdownIt` engine instance |
| `src/components/**` | `app/**`, `core/**`, `@/i18n`, each other | React views. Never touch markdown-it directly |

**The parse → render pipeline:**

```
bytes ──core/fs──▶ text ──core/markdown/engine.ts──▶ HTML with EMPTY placeholders
                                                      │
                            core/markdown/collector.ts ── holds the payloads (math/mermaid/code/env)
                                                      │
                                       DOMPurify ──▶ sanitised HTML  ◀── sanitise BEFORE typesetting
                                                      │
                        core/render/typesetter.ts ── IntersectionObserver, fills on approach
```

- Placeholders are emitted through the helpers in `core/markdown/placeholders.ts`
  (`mathPlaceholder`, `mermaidPlaceholder`, `codePlaceholder`, `preservedPlaceholder`) — **never
  build one by hand.** They are empty and side-effect free; the payload lives in `RenderCollector`
  under ids `math-<n>`, `mermaid-<n>`, `code-<n>`, `env-<n>`, `block-<index>`.
- The typesetter sets `data-om-filled="1"` and `data-om-state="ok"|"error"`. HTML export keys on
  those attributes, so nothing else may write them.
- Typesetting is lazy, **except** when equation numbering is on (`needsNumbering(...)`) or
  `options.eager` is set: numbering must run in document order, and the IntersectionObserver path
  would number by viewport order. Do not "optimise" that branch away.

**State (`src/app/store.ts`).** The active document lives in `doc`; other tabs are parked in
`parkedTabs` keyed by id with `tabOrder` for order, plus `parkedDiagnostics`. Switching tabs swaps
`doc`, so nothing downstream needs to know tabs exist.

---

## Key Directories

```
src/core/{markdown,render,fs,export,diagnostics,math,util}   the pipeline (no React)
src/app/{store,settings,session}.ts                          state, settings, persisted session
src/components/*.tsx + useTypesetting.ts                     views
src/i18n, src/styles, src/types                              strings, tokens, shared types
src-tauri/src/{commands,export,lib,main}.rs                  the Rust host
tests/unit (node) · tests/unit/dom (jsdom) · tests/e2e (Playwright) · tests/desktop (WebdriverIO)
tests/corpus + manifest.json                                 148 fixtures, 355 formula cases
scripts/                                                     build, test, corpus, perf tooling
docs/                                                        see "Documentation" below
```

There is **no editor-adapter layer.** `SourceEditor.tsx` imports CodeMirror 6 directly; a kernel
swap means rewriting that file.

---

## Development Commands

```bash
pnpm install
pnpm typecheck            # tsc over src + tests + scripts  (does NOT cover tests/desktop)
pnpm typecheck:desktop    # tsconfig.desktop.json only
pnpm test                 # Vitest, both projects (node + jsdom)
pnpm test:unit            # node project only — EXCLUDES tests/unit/dom/**
pnpm build                # vite build -> dist/
pnpm test:e2e             # Playwright; runs against the BUILT bundle, so build first
pnpm test:e2e:update      # regenerate screenshot baselines (do this in the target environment)
pnpm corpus:verify        # manifest.json <-> tests/corpus on disk
pnpm perf                 # parse-only benchmark (run gen-corpus-stress.mjs first)
pnpm perf:check           # the same, failing when a fixture exceeds scripts/perf-budget.json

# Desktop shell / real binary
pnpm desktop:dev                              # tauri dev
pnpm tauri build --debug --no-bundle          # debug binary for the desktop E2E
pnpm test:desktop                             # WebdriverIO against that binary
OPENMARK_BINARY=src-tauri/target/release/openmark.exe pnpm test:desktop   # against the shipped build
pnpm desktop:build                            # NSIS + MSI installers
pnpm desktop:build:portable                   # portable zip
```

Run the desktop suite **only** through `scripts/run-desktop-e2e.mjs` (`pnpm test:desktop`): it
injects the project-local Rust toolchain and the space-free driver path.

---

## Code Conventions & Common Patterns

- **Store actions are verb-first and named for the effect, not the widget:** `openPath`,
  `setSourceFromEditor`, `applyBlockEdit`, `applyMathEdit`, `rememberPosition`,
  `checkExternalChange`, `unlockEditing`. Mutators are pure `set()` one-liners; anything doing IO
  is an `async` thunk.
- **`updateSettings` takes a mutator function**, never a partial:
  `updateSettings((draft) => ({ ...draft, reading: { ...draft.reading, focusMode: true } }))`.
- **Every UI string goes through `t()` from `@/i18n`** with flat dotted keys
  (`'panel.search.placeholder'`). `t()` falls back to `zh`, then to the key itself, and substitutes
  `{name}` params.
- **Appearance is data, not logic.** `applySettingsToDocument` (`app/settings.ts`) projects settings
  onto CSS custom properties and `data-om-*` flags on `<html>`. A component must never read a
  setting to decide styling — only `useStore` selectors, and only for behaviour.
- **Editing happens in LF space.** The parser and CodeMirror are LF-only; `doc.source` carries the
  file's own EOL. Commit editor text with `setSourceFromEditor(normalized)`. Block and math edits
  must splice in LF space and then re-apply EOL (`normalizeEol` → splice at `block.range` /
  `expr.range` → `applyEol(..., doc.encoding.eol)`). Skipping either half rewrites every line ending.
- **IPC wire format — two opposite conventions, both deliberate:**
  - `src-tauri/src/commands.rs`: every response struct carries
    `#[serde(rename_all = "camelCase")]`. The TypeScript interfaces are hand-written, so a
    mismatched name is `undefined` at runtime with no compile error anywhere.
  - `src-tauri/src/export.rs`: `ExportAsset` / `PdfReport` stay **snake_case**
    (`relative_path`, `page_count`) to match `src/core/export/*.ts`. Do not "fix" them.
  - Adding a field means adding it to the `keys()` assertion in that file's `#[cfg(test)]` module.
- **A new `#[tauri::command]` must be added to `tauri::generate_handler![…]` in
  `src-tauri/src/lib.rs`** or the invoke fails at runtime.
- **Selectors and hooks:** test ids are `data-om-testid` (configured via `testIdAttribute` in
  `playwright.config.ts`), class names are prefixed `om-`, and behaviour flags are `data-om-*`.
- **Test ids in selectors** — `getByTestId('x')` resolves `[data-om-testid="x"]`, not
  `data-testid`.

---

## Important Files

**Entry points**

| Path | Role |
|---|---|
| `src/main.tsx` | mounts into `#root`; installs the test seam when `__OPENMARK_TEST_FILES__` is set |
| `src/App.tsx` | the shell: global keydown handler, drag-and-drop open, mode switching |
| `src-tauri/src/main.rs` | thin launcher — calls `openmark_lib::run()` |
| `src-tauri/src/lib.rs` | plugin registration, startup argv handling, `frontend_ready`, the `generate_handler!` list |
| `index.html` | the single HTML entry; loads `/src/main.tsx` |

The **test seam** is how the browser suite (Playwright) opens a document, since it cannot drive an
OS dialog. Setting `window.__OPENMARK_TEST_FILES__` before any app script runs does two things:
the file-service browser backend serves those paths from that in-memory map, and `main.tsx` exposes
`window.__openmark__` (`openPath`, `getSource`, `getEncoding`) to drive the store from the page.
It is installed only when the map is already present, so a shipped build carries no automation
surface. Its shape is declared in `src/types/automation.d.ts`.

**Load-bearing modules**

| Path | Role |
|---|---|
| `src/app/store.ts` | the whole application state and every action; the one `MarkdownIt` instance |
| `src/core/markdown/engine.ts` | markdown-it configuration + the structural diagnostics pass |
| `src/core/markdown/collector.ts` | holds placeholder payloads (`math-<n>`, `mermaid-<n>`, `code-<n>`, `env-<n>`, `block-<index>`) |
| `src/core/render/typesetter.ts` | lazy fill via IntersectionObserver; sets `data-om-filled` / `data-om-state` |
| `src/core/render/images.ts` | rewrites relative `<img src>` to asset URLs; marks `data-om-missing` |
| `src/core/fs/fileService.ts` | every **file** IPC call, via its `tauriInvoke()` wrapper |
| `src/core/export/ipc.ts` | the **export** IPC wrapper, `exportInvoke()`, used only by `export/assets.ts` and `export/pdf.ts`. Two wrappers exist because the export layer must also run in a plain browser — see the header there before consolidating them |
| `src-tauri/src/commands.rs` | file IO, atomic write with the clobber guard, `stat_file`, `resolve_asset_url` |
| `src-tauri/src/export.rs` | asset inlining for HTML export, and PDF via `PrintToPdf` |
| `src/components/SourceEditor.tsx` | the only CodeMirror 6 integration point |

**Configuration**

| Path | Role |
|---|---|
| `package.json` | all scripts; the only place dependency versions are declared for JS |
| `vite.config.ts` | build target, `@` alias, `dist/` output |
| `vitest.config.ts` | the `unit` (node) and `dom` (jsdom) projects, and the coverage scope |
| `playwright.config.ts` | `testIdAttribute`, the `vite preview` web server, screenshot tolerance |
| `tests/desktop/wdio.conf.ts` | target binary (`OPENMARK_BINARY`), driver provider, msedgedriver |
| `src-tauri/tauri.conf.json` | window, `frontendDist`, `devUrl`, asset-protocol scope, bundle targets |
| `src-tauri/capabilities/default.json` | the production permission set; `wdio.json` is test-only |
| `src-tauri/build.rs` | pins the frontend rebuild trigger — see Traps |

---

## Runtime/Tooling Preferences

- **Node 24 + pnpm.** Not npm, not Bun.
- **TypeScript is the native (Go) compiler.** Run it as `node node_modules/typescript/bin/tsc`;
  the `node_modules/.bin/tsc` shim fails with `os error 193` in this shell.
- **Rust is project-local, never global.** The toolchain lives in the gitignored `.tools/cargo`
  and `.tools/rustup`. Because this repository's path contains a space and the Tauri driver spawns
  unquoted with `shell: true`, it is reached through the space-free junction `C:\omkth` →
  `<repo>\.tools`. `scripts/env.sh` and `scripts/run-desktop-e2e.mjs` encode this.
- **`tsconfig.json` `lib` is `ES2024`** (for `Promise.withResolvers`); `target` stays `ES2022`.
- A path alias must be declared in **both** `tsconfig.json` (`paths`) and `vite.config.ts`
  (`resolve.alias`) or it breaks in one pipeline.
- Vendored MathJax is regenerated by `predev`/`prebuild` via `scripts/prepare-mathjax.mjs`. Never
  rename its output directories: MathJax builds font URLs as `<fonts>/<fontName>/svg.js`.
- `@mathjax/mathjax-newcm-font` and `@mathjax/mathjax-mhchem-font-extension` are pinned to the exact
  version `4.1.3`; `prepare-mathjax.mjs` stamps those versions and skips re-vendoring on a match.

---

## Testing & QA

Four layers, split by **what they can honestly assert**, not by speed. Put a new test in the lowest
layer that can make the claim.

| Layer | Location / command | Only layer that can assert |
|---|---|---|
| unit (node) | `tests/unit/*.test.ts` · `pnpm test:unit` | parser/tokenizer, table model, encoding, round-trip, diagnostics |
| dom (jsdom) | `tests/unit/dom/**` · `pnpm test` | the DOMPurify boundary, image resolution, store races |
| e2e (Playwright) | `tests/e2e/` · `pnpm test:e2e` | that a formula produced **real MathJax glyphs**, that no network request was made, Mermaid `<svg>`, screenshot layout, axe-core |
| desktop (WebdriverIO) | `tests/desktop/` · `pnpm test:desktop` | real file IO on disk, the OS `openmark://open-file` event, the WebView2 runtime |

Real typesetting is **only** testable in Playwright — MathJax cannot boot under Node on Windows.
Never assert a formula rendered by checking that a DOM node exists.

**Rules for new tests:**
- Assert on produced output, never on wiring, and never on a mock's echo. The image resolver had a
  caller bug because a stub computed the answer itself (`tests/unit/dom/images.test.ts` header).
- No real timers. Hold an async boundary open with `Promise.withResolvers` and resolve it
  explicitly — `tests/unit/dom/external-change.test.ts` is the reference.
- `globals: false`: import `{ describe, expect, it }` from `vitest`.
- Playwright runs against `vite preview` serving `dist/` — run `pnpm build` first or you are testing
  old code. `--host 127.0.0.1` in that command is load-bearing.
- The screenshot tolerance is per-spec, not per-config: `visual.spec.ts` passes its own
  `TOLERANCE = { maxDiffPixelRatio: 0.01 }`, which overrides the config's `0.002`. Baselines live in
  `tests/e2e/visual.spec.ts-snapshots/*-msedge-win32.png` and are font-sensitive.
- New corpus fixture: add `tests/corpus/markdown/<name>.md`, run
  `node scripts/verify-corpus.mjs --print-counts <file>`, then add the entry to `manifest.markdown`.
- The desktop fixture is **not** passed on the command line — msedgedriver drops `args`. Emit the
  `openmark://open-file` event through `browser.execute` instead.

**Coverage expectation:** there is no numeric threshold — `vitest.config.ts` collects V8 coverage
over `src/core/**` and `src/app/**` (excluding `src/types/**`) into `coverage/` and enforces
nothing. The convention is behavioural: every fixed defect gets a regression test, and that test
must be shown to fail on the previous implementation. Verify by reverting the fix and watching it
go red.

---

## Traps

These cost real debugging time. The symptom never points at the cause.

- **A bare `cargo build` produces a binary that cannot render.** `tauri-2.12.4/build.rs` sets
  `dev = !custom_protocol`, so without the `tauri/custom-protocol` feature (enabled only by
  `tauri build`) the binary loads `devUrl` (`http://localhost:1420`) instead of embedding `dist/`.
  Both commands write `src-tauri/target/debug/openmark.exe`, so the wrong one silently replaces a
  working binary and every desktop test fails with "element wasn't found".
- **`tauri_build::build()` does not watch `frontendDist`.** A `dist/`-only rebuild left the binary
  stale while cargo reported "Finished". `src-tauri/build.rs` pins this with `rerun-if-changed` on
  `../dist` and `../dist/index.html`; do not remove either line.
- **`scripts/run-desktop-e2e.mjs` refuses to run against a binary older than `dist/`.** That refusal
  is the point of it, not an obstacle.
- **`src/core/editor/` is gone; there is no kernel adapter.** CodeMirror is created once per
  `${doc.path ?? ''}` and driven by transactions — a React `value` prop would destroy
  caret/selection/undo.
- **`rememberPosition(path, …)` takes the path as an argument on purpose.** React mutates the DOM
  before running the outgoing view's cleanup, so resolving `doc.path` at save time files the reading
  position under the wrong document.
- **`checkExternalChange` re-checks inside `set((s) => …)` after its `await`,** against the live
  document and its path. A pre-`await` snapshot raises the "modified by another program" banner on
  our own autosave, and blames a document the user just opened.
- **`app.security.capabilities: []` means "all capability files", not "none".** Populating that array
  filters capabilities by identifier.
- **A missing command argument fails the whole invoke.** Tauri deserialises by name and rejects the
  call when a required key is absent. `resolve_asset_url` takes `(document_path, relative_path)`;
  sending a different key set breaks every relative image with nothing but a failed promise.
- **`webview2-com` / `windows` are caret-pinned**, not exact. The type identity that
  `Webview::with_webview` needs is guaranteed by `Cargo.lock`, so treat a `cargo update` touching
  them as a change requiring a PDF export test.

---

## Documentation

`PROGRESS.md` is the living ledger (milestones, defects, open problems). `SESSION_HANDOFF.md` carries
environment setup, invariants and known traps. `docs/TEST_REPORT.md` states what is verified and,
in §9, what is not. `docs/KNOWN_ISSUES.md` is the honest limitations list. `docs/ARCHITECTURE.md`,
`docs/PRD.md`, `docs/RESEARCH.md` and `docs/FEATURE_MATRIX.md` were written in Phase 0 and are
**partly aspirational** — when they disagree with the code or with `PROGRESS.md`, the code and
`PROGRESS.md` win. `docs/FEATURE_MATRIX.md` uses a four-value status vocabulary and names the file
that proves each row; keep it accurate when behaviour changes.
