# SESSION_HANDOFF

State needed to resume work without re-deriving it. Read alongside `PROGRESS.md`.

---

## 1. Environment: read this first

The shell in this environment has two behaviours that will waste your time if you do not
know them.

**Executables on a PATH entry containing a space cannot be resolved as bare commands.**
The workspace path itself contains a space (`D:/OMP WorkSpace/REA typora`), so `cargo`,
`rustc` and `tsc` all fail as bare commands even when correctly installed. Use absolute
paths:

```bash
export RUSTUP_HOME="D:/OMP WorkSpace/REA typora/.tools/rustup"
export CARGO_HOME="D:/OMP WorkSpace/REA typora/.tools/cargo"
export CARGO_TARGET_DIR="D:/OMP WorkSpace/REA typora/.tools/target"

"D:/OMP WorkSpace/REA typora/.tools/cargo/bin/cargo.exe" check --manifest-path "D:/OMP WorkSpace/REA typora/src-tauri/Cargo.toml"

# TypeScript 7 ships a native binary; the .bin shim does not run here.
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json

# Vite / Vitest / Playwright / Tauri CLIs
node node_modules/vite/bin/vite.js build
node node_modules/vitest/vitest.mjs run
node node_modules/@playwright/test/cli.js test
node_modules/.bin/tauri.CMD build
```

`source scripts/env.sh` exists but its PATH export does not survive this shell; prefer
absolute paths. A junction `C:\omkth` → `<repo>\.tools` was created so the Tauri CLI can find
the toolchain; `rmdir C:\omkth` removes it.

**Registry:** the user-level `~/.npmrc` points at `registry.npmmirror.com`, which lags
upstream and breaks installs (`create-wdio@10.0.2` is missing there). The project-local
`.npmrc` overrides it to the canonical registry. Do not "simplify" that file away.

**Rust crates** resolve through a mirror configured in `.tools/cargo/config.toml`
(`sparse+https://rsproxy.cn/index/`). Upstream crates.io measured ~5 KB/s here against
~7.9 MB/s for the mirror. Keep it.

---

## 2. Toolchain inventory

| Thing | Version | Where |
|---|---|---|
| Node / pnpm | 24.16.0 / 11.5.0 | system |
| Rust / cargo | 1.99.0 | `.tools/rustup`, `.tools/cargo` (gitignored, project-local) |
| MSVC / Windows SDK | BuildTools 14.44.35207 / SDK 10.0.26100 | system |
| WebView2 runtime | 149.0.4022.62 | system |
| Tauri | CLI 2.12.3, crate 2.12.4 | `src-tauri/` |
| MathJax | 4.1.3 (+ `mathjax-newcm-font`, `mathjax-mhchem-font-extension`) | vendored to `public/` |

Bootstrap from scratch: download `rustup-init.exe` from `https://rsproxy.cn/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe`,
then run it with `RUSTUP_HOME`/`CARGO_HOME` pointing into `.tools/` and
`--profile minimal --no-modify-path`. Installing from `static.rust-lang.org` directly is not
viable at this network speed.

---

## 3. Repo map

```
src/core/markdown/   engine.ts, math-plugin.ts, rules.ts, line-index.ts, collector.ts,
                     placeholders.ts, sanitize.ts, types.ts
src/core/math/       mathjax.ts          (browser-only MathJax 4 driver)
src/core/render/     typesetter.ts, mermaid.ts, highlighter.ts
src/core/fs/         encoding.ts, fileService.ts
src/app/             store.ts (zustand), settings.ts
src/components/      DocumentView, SourceEditor, Sidebar, OutlinePanel, SearchPanel,
                     DiagnosticsPanel, SettingsPanel, Toolbar, StatusBar
src/styles/          tokens.css, app.css, document.css
src-tauri/           lib.rs, commands.rs, tauri.conf.json, capabilities/, icons/
tests/corpus/        148 markdown docs, 355 math cases, manifest.json
tests/unit/          Vitest (node project: encoding; dom project: sanitize)
tests/e2e/           Playwright specs
docs/                RESEARCH, PRD, ARCHITECTURE, FEATURE_MATRIX, TEST_STRATEGY
scripts/             prepare-mathjax.mjs, env.sh, verify-corpus.mjs, gen-corpus-stress.mjs
```

---

## 4. Architecture invariants — do not break these

1. **`doc.source` is the only thing ever written to disk.** Nothing serialises the parse
   tree. This is what makes round-trip fidelity possible and is why no third-party editor
   kernel was adopted.
2. **Sanitise before typesetting.** Math, Mermaid and code are empty placeholders when
   `sanitizeHtml` runs. Library-generated SVG must never be passed through DOMPurify.
3. **`ALLOWED_URI_REGEXP` must keep its relative-URL alternative.** Narrowing it deletes
   every relative image and link. Six tests pin this; do not "harden" it.
4. **`KEEP_CONTENT: false` must never be set** on the DOMPurify config; it removes all text.
5. **Store selectors must return stable references.** `?? []` inside a selector causes an
   infinite render loop.
6. **`scripts/prepare-mathjax.mjs` must keep the vendored directory names.** MathJax builds
   font URLs as `<fonts>/<fontName>/svg.js`, so renaming either font directory silently
   breaks chemistry with a CDN fallback that only shows as missing glyphs.
7. **Test ids use `data-om-testid`**, configured in `playwright.config.ts`.

---

## 5. Known traps

- **`vite preview` must be given `--host 127.0.0.1`** or Playwright's readiness probe times
  out while the server is happily running on IPv6.
- **`dist/` is build output.** Do not delete it to make a `tauri build` config check pass;
  run the real `vite build` instead.
- **Concurrent agents must not share writable paths.** A subagent deleting `dist/` mid-suite
  cost a long debugging detour.
- **MathJax cannot run under Node on Windows** (path vs `file://`). Do not try to add it to
  Vitest; assert rendering in Playwright.
- **`noundefined` is intentionally removed** from MathJax's package list so unknown macros
  become real errors instead of silent red text. Re-adding it blinds the diagnostics panel.

---

## 6. Verification commands, and what each proves

| Command | Proves |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | types are sound across app, tests and scripts |
| `node node_modules/vite/bin/vite.js build` | the shipping bundle builds |
| `node node_modules/vitest/vitest.mjs run` | parser, encoding, and the sanitiser boundary |
| `node node_modules/@playwright/test/cli.js test` | real rendering, **offline MathJax with glyphs**, XSS neutralised |
| `node scripts/verify-corpus.mjs` | corpus manifest matches the files on disk |
| `node_modules/.bin/tauri.CMD build --no-bundle` | a real Windows binary that boots |

The Playwright suite is the only place that can honestly claim a formula *rendered*: it
asserts on glyph elements and on a network-request log, not on DOM presence.

---

## 7. Immediate next step

Implement **instant-rendering mode**. The parser already computes exact source ranges for
math, diagrams, code and headings; what is missing is a range for every top-level block.
Add that to the collect pass in `src/core/markdown/engine.ts`, expose it on `RenderResult`,
then build block-wise editing that patches `doc.source` by offset and re-parses only the
affected region. CodeMirror 6 slots in behind the same contract as the current
`SourceEditor` (`value` in, `onChange` out).
