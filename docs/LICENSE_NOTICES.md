# Third-Party Licence Notices

Project: **OpenMark 0.1.0** — `D:/OMP WorkSpace/REA typora`  
Generated: **2026-10-16** from the installed dependency trees.

Every licence string below was read from the installed artefact itself — the `license` field in a
package's own `package.json`, the licence file the package actually ships, the local Cargo registry
(`.tools/cargo/registry/src/rsproxy.cn-e3de039b2554c837/`), or the crates.io API for the handful of crates
whose sources are not on disk. The **Redistributed** column was derived from the real build outputs
(`dist/`, `public/`, `src-tauri/target/release/`), not from the manifests — see section 7 for the method.

---

# 0. Project licence

OpenMark itself is **MIT**: `"license": "MIT"` in `package.json`, `license = "MIT"` in `src-tauri/Cargo.toml`.

> A root `LICENSE` file carrying this text was added after the audit; the gap it reported is closed.

---

# 1. Audit findings — read this first

## 1.1 Findings requiring action

| # | Severity | Finding | Exact package(s) | Required action |
|---|---|---|---|---|
| B1 | **BLOCKER — weak copyleft redistributed** | Four **MPL-2.0** crates are linked into the shipped `openmark.exe` | `cssparser@0.37.0`, `selectors@0.38.0`, `dtoa-short@0.3.5`, `option-ext@0.2.0` | Ship `THIRD_PARTY_LICENSES/MPL-2.0.txt`, state that the files are unmodified, and point recipients at the crates.io sources (offer in section 6.3). MPL-2.0 is *file-level* copyleft: it does **not** require OpenMark itself to be relicensed. |
| B2 | **BLOCKER — weak copyleft redistributed** | **EPL-2.0** code is bundled into the frontend | `elkjs@0.9.3` (reachable only through `mermaid@12.2.0`) | It ships as `dist/assets/elk-QONTBCTQ-CKFwLDFw.js`. Ship `THIRD_PARTY_LICENSES/EPL-2.0.txt` plus the source-availability notice in section 6.4. EPL-2.0 is file-level copyleft; OpenMark is unaffected. |
| B3 | **UNKNOWN licence (declared)** | `khroma@2.1.0` has **no `license` field** in its `package.json` | `khroma@2.1.0` (transitive of `mermaid@12.2.0`; bundled) | The package does ship a licence **file** whose text is MIT, so the licence is MIT in substance. Record it as MIT; consider asking upstream to add the field. Not a redistribution blocker. |
| B4 | **Missing licence text in a redistributed asset** | Two vendored font packages declare Apache-2.0 but ship **no licence file at all** | `@mathjax/mathjax-newcm-font@4.1.3`, `@mathjax/mathjax-mhchem-font-extension@4.1.3` | Apache-2.0 section 4(a) requires handing recipients a copy of the licence. We ship our own copy (`THIRD_PARTY_LICENSES/Apache-2.0.txt`) and this document with the build. |

**No strong-copyleft dependency exists anywhere.** There is no GPL, no AGPL, no LGPL taken as the elected
option, no CDDL, no SSPL and no Elastic-licensed code in the shipped application. The only GPL-adjacent
string in the whole graph is `jszip@3.10.2 -> "(MIT OR GPL-3.0-or-later)"`, which is **dev-only** (never
redistributed) and which we take under **MIT**.

Two further "copyleft-looking" strings are false alarms and are resolved by election:

- `dompurify@3.4.17` is `"(MPL-2.0 OR Apache-2.0)"` — we elect **Apache-2.0**. It ships `LICENSE` and
  `LICENSE-MPL`; the MPL text is never relied on.
- `r-efi@5.3.0` / `r-efi@6.0.0` are `"MIT OR Apache-2.0 OR LGPL-2.1-or-later"` — we elect MIT/Apache-2.0.
  Neither version is linked into the Windows binary (they are `getrandom` UEFI-target dependencies).

## 1.2 Licences that require source disclosure for network use

None. No AGPL / SSPL / Elastic / Commons-Clause dependency is present in either graph, so no network-use
source-disclosure obligation exists. The application also performs no network use at all (CSP
`default-src 'self'`, no remote origins), which makes the question moot in practice.

## 1.3 Apache-2.0 NOTICE file for MathJax — present?

**No NOTICE file exists to redistribute.** `mathjax@4.1.3` ships exactly one legal file, `LICENSE`
(the unmodified Apache-2.0 template, appendix still `Copyright [yyyy] [name of copyright owner]`). A
recursive scan of the installed package for `NOTICE` / `COPYING` / `THIRD-PARTY` returns only `LICENSE`.
Because the upstream work carries no NOTICE, Apache-2.0 section 4(d) imposes nothing further; 4(a)-(c) still
apply — ship the licence, keep attribution notices, and state whether files were modified (they are not:
`scripts/prepare-mathjax.mjs` prunes files but never edits their contents).

The vendored copy **does** carry the licence: `dist/mathjax/v4/LICENSE` is present in the built output,
because `EXCLUDE_FILES` in `scripts/prepare-mathjax.mjs` excludes `README.md`, `CONTRIBUTING.md` and the Node
entry points but not `LICENSE`.

## 1.4 Typora contamination check — clean

No Typora asset, icon, theme or code is present. Evidence:

- `find . -iname "*typora*"` (excluding `.git`) returns **zero files**. The only hit is the repository
  directory itself, which is named `REA typora`.
- A case-insensitive full-text search for `typora` outside `node_modules/`, `dist/` and `.git/` returns
  **text only** — product comparisons, requirement wording and citations. Representative hits:
  `docs/FEATURE_MATRIX.md` ("OpenMark vs Typora — Feature Matrix ... no source, icons, themes or other
  assets were copied"), `docs/PRD.md` ("Blocked-by-licence non-goal: copying Typora source, icons,
  trademarks or theme assets"), `docs/RESEARCH.md` section 8, `PROGRESS.md`, `README.md`, and code comments
  such as `src/components/InstantView.tsx:8`.
- The 2 200+ raw hits a naive search reports are build artefacts under `.tools/target/**` that embed the
  workspace path string `D:/OMP WorkSpace/REA typora` — a false positive caused by the repository name.
- The application mark is original: `public/favicon.svg` carries the header "OpenMark application mark —
  original artwork ... without reproducing any other product icon or logotype", and `src-tauri/icons/**`
  (18 files) was generated by `tauri icon` from `src-tauri/icons/source-icon.png` in the same minute as the
  project scaffold (2026-10-15 23:37).

---
# 2. Direct (declared) runtime dependencies — JavaScript

Source: `package.json` `dependencies` (35 entries), resolved to exact versions by `pnpm-lock.yaml`,
licences read from `node_modules/.pnpm/<pkg>@<version>/node_modules/<pkg>/package.json` and the licence file
that package ships.

| Package | Version | Licence (as shipped) | Redistributed in the app? | Where it ships | Licence text |
|---|---|---|---|---|---|
| `@codemirror/autocomplete` | 6.20.3 | MIT | No — declared but not imported | absent from `dist/` | `LICENSE` |
| `@codemirror/commands` | 6.11.1 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `@codemirror/lang-markdown` | 6.5.2 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `@codemirror/language` | 6.13.1 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `@codemirror/language-data` | 6.5.2 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `@codemirror/search` | 6.7.2 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `@codemirror/state` | 6.7.6 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `@codemirror/view` | 6.43.14 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `@lezer/highlight` | 1.2.5 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `@mathjax/mathjax-mhchem-font-extension` | 4.1.3 | Apache-2.0 | **Yes** (vendored asset) | `dist/mathjax-fonts/mathjax-mhchem-font-extension/**` | _none shipped_ |
| `@mathjax/mathjax-newcm-font` | 4.1.3 | Apache-2.0 | **Yes** (vendored asset) | `dist/mathjax-fonts/mathjax-newcm-font/**` | _none shipped_ |
| `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE.spdx` |
| `@tauri-apps/plugin-dialog` | 2.8.3 | MIT OR Apache-2.0 | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE.spdx` |
| `@tauri-apps/plugin-fs` | 2.7.1 | MIT OR Apache-2.0 | No — declared but not imported | absent from `dist/` | `LICENSE.spdx` |
| `@tauri-apps/plugin-opener` | 2.7.2 | MIT OR Apache-2.0 | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE.spdx` |
| `@tauri-apps/plugin-os` | 2.4.0 | MIT OR Apache-2.0 | No — declared but not imported | absent from `dist/` | `LICENSE.spdx` |
| `@tauri-apps/plugin-process` | 2.4.0 | MIT OR Apache-2.0 | No — declared but not imported | absent from `dist/` | `LICENSE.spdx` |
| `@tauri-apps/plugin-store` | 2.5.0 | MIT OR Apache-2.0 | No — declared but not imported | absent from `dist/` | `LICENSE.spdx` |
| `@tauri-apps/plugin-window-state` | 2.5.0 | MIT OR Apache-2.0 | No — declared but not imported | absent from `dist/` | `LICENSE.spdx` |
| `dompurify` | 3.4.17 | (MPL-2.0 OR Apache-2.0) | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `markdown-it` | 15.0.2 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `markdown-it-anchor` | 10.0.0 | Unlicense | No — declared but not imported | absent from `dist/` | `UNLICENSE` |
| `markdown-it-deflist` | 4.0.0 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `markdown-it-footnote` | 4.0.0 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `markdown-it-mark` | 4.0.0 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `markdown-it-sub` | 2.0.0 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `markdown-it-sup` | 2.0.0 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `markdown-it-task-lists` | 2.1.1 | ISC | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `mathjax` | 4.1.3 | Apache-2.0 | **Yes** (vendored asset) | `dist/mathjax/v4/**` | `LICENSE` |
| `mermaid` | 12.2.0 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `react` | 19.3.1 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `react-dom` | 19.3.1 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `shiki` | 4.5.0 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `yaml` | 2.9.1 | ISC | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |
| `zustand` | 5.0.15 | MIT | **Yes** (bundled by Vite) | `dist/assets/*.js` | `LICENSE` |

Notes.

- The five Tauri *plugin JavaScript wrappers* marked "not imported" (`plugin-fs`, `plugin-os`,
  `plugin-process`, `plugin-store`, `plugin-window-state`) are genuinely absent from the shipped bundle:
  the built output contains `plugin:dialog|`, `plugin:opener|`, `plugin:event|` and `plugin:resources|`
  invoke prefixes and none of the others. Their **Rust** counterparts are nevertheless linked into
  `openmark.exe` (section 4.1).
- `@codemirror/autocomplete` and `markdown-it-anchor` are declared but reference nothing in `src/`.
- `mathjax` (the npm package) is never imported as a module (`src/core/math/mathjax.ts` loads the *vendored*
  `public/mathjax/v4` build at runtime). It is redistributed only in the "pruned copy" sense:
  `scripts/prepare-mathjax.mjs` copies it into `public/mathjax/v4`.

---

# 3. Bundled runtime assets

Everything under `public/` is copied verbatim into `dist/` by Vite and embedded in the binary; everything
under `dist/` is what the WebView actually loads.

| Asset in `dist/` | Upstream package | Version | Licence | Licence text, as shipped |
|---|---|---|---|---|
| `mathjax/v4/**` (90 files, 9.8 MB) | `mathjax` | 4.1.3 | Apache-2.0 | **Present** — `dist/mathjax/v4/LICENSE` (copied by `scripts/prepare-mathjax.mjs`); canonical copy in `THIRD_PARTY_LICENSES/Apache-2.0.txt` |
| `mathjax-fonts/mathjax-newcm-font/**` (46 files, 11 MB total with the next row) | `@mathjax/mathjax-newcm-font` | 4.1.3 | Apache-2.0 (declared) | **Missing upstream** — the package ships no licence file, so neither does the copy. See finding B4; covered by `THIRD_PARTY_LICENSES/Apache-2.0.txt` |
| `mathjax-fonts/mathjax-mhchem-font-extension/**` | `@mathjax/mathjax-mhchem-font-extension` | 4.1.3 | Apache-2.0 (declared) | **Missing upstream** — as above |
| `assets/elk-QONTBCTQ-CKFwLDFw.js` | `elkjs` | 0.9.3 | **EPL-2.0** | `THIRD_PARTY_LICENSES/EPL-2.0.txt` (package ships `LICENSE.md`; not copied into `dist/`) |
| `assets/katex-NhIUETkH.js` | `katex` | 0.18.10 | MIT | `THIRD_PARTY_LICENSES/MIT.txt` |
| `assets/cytoscape.esm-Bf8Vg9Iv.js` | `cytoscape` | 3.34.3 | MIT | `THIRD_PARTY_LICENSES/MIT.txt` |
| `assets/mermaid.core-*.js`, `assets/mermaid-parser.core-*.js` | `mermaid` | 12.2.0 | MIT | `THIRD_PARTY_LICENSES/MIT.txt` |
| `assets/*.js` (298 chunk files, incl. Shiki grammars/themes) | `shiki` and its `@shikijs/*` packages | 4.5.0 | MIT | `THIRD_PARTY_LICENSES/MIT.txt` |
| `favicon.svg` | — project original artwork | — | MIT (project) | — |

Pruning note for the audit trail: `scripts/prepare-mathjax.mjs` deliberately excludes `README.md`,
`CONTRIBUTING.md`, `node-main.*`, `require.mjs`, `tsconfig.json`, the CHTML/`nofont` bundles, and (for the
font packages) everything except `svg.js`, `svg/`, `def/`, `package.json` and `LICENSE`. No file content is
modified — files are copied byte-for-byte — so the Apache-2.0 "state changes" obligation is satisfied by
stating "unmodified upstream files, pruned by deletion".

---

# 4. Rust dependencies

Source: `src-tauri/Cargo.toml` (direct) and `src-tauri/Cargo.lock` (478 packages: 477 from crates.io and
`openmark` itself). Licences were read from the crates.io API per exact version, cross-checked against the
local registry sources at `.tools/cargo/registry/src/rsproxy.cn-e3de039b2554c837/`.

"Linked into `openmark.exe`" is derived from the release PDB (`openmark.pdb`), which lists the LTO codegen
units of every rlib that took part in the final link — see section 7.

## 4.1 Direct Rust dependencies

| Crate | Version | Licence | Redistributed? | Notes |
|---|---|---|---|---|
| `tauri` | 2.12.4 | Apache-2.0 OR MIT | **Yes** | Core desktop shell; statically linked |
| `tauri-build` | 2.7.3 | Apache-2.0 OR MIT | No — build script | Build-time only. Pulls `tauri-utils/build-2` -> `html-manipulation-2` -> `dom_query`, which is why `cssparser`/`selectors` are compiled at all; feature unification then carries them into the release binary (finding B1). |
| `tauri-plugin-dialog` | 2.8.3 | Apache-2.0 OR MIT | **Yes** | Native file dialogs |
| `tauri-plugin-fs` | 2.7.1 | Apache-2.0 OR MIT | **Yes** | FS commands (JS wrapper not bundled) |
| `tauri-plugin-opener` | 2.7.2 | Apache-2.0 OR MIT | **Yes** | Opens links in the OS browser |
| `tauri-plugin-store` | 2.5.0 | Apache-2.0 OR MIT | **Yes** | Settings persistence (JS wrapper not bundled) |
| `tauri-plugin-window-state` | 2.5.0 | Apache-2.0 OR MIT | **Yes** | Window geometry persistence |
| `tauri-plugin-single-instance` | 2.5.4 | Apache-2.0 OR MIT | **Yes** | Single-instance hand-off |
| `tauri-plugin-process` | 2.4.0 | Apache-2.0 OR MIT | **Yes** | Restart/exit support |
| `tauri-plugin-os` | 2.4.0 | Apache-2.0 OR MIT | **Yes** | Platform information |
| `tauri-plugin-persisted-scope` | 2.4.2 | Apache-2.0 OR MIT | **Yes** | Remembers granted folders |
| `tauri-plugin-wdio` | 1.5.0 | MIT OR Apache-2.0 | **Yes** (inert) | Always present so the ACL stays valid; the plugin is registered only in debug builds |
| `serde` | 1.0.229 | MIT OR Apache-2.0 | **Yes** | Serialisation |
| `serde_json` | 1.0.154 | MIT OR Apache-2.0 | **Yes** | JSON |
| `thiserror` | 2.0.21 | MIT OR Apache-2.0 | **Yes** | Error types |
| `chrono` | 0.4.45 | MIT OR Apache-2.0 | **Yes** | Timestamps |
| `webview2-com` | 0.39.1 | MIT | **Yes** (Windows only) | WebView2 COM interop behind PDF export |
| `windows` | 0.62.2 | MIT OR Apache-2.0 | **Yes** (Windows only) | Win32 bindings |

## 4.2 Rust licence summary — all 478 locked packages

| Licence expression | Packages |
|---|---|
| `MIT OR Apache-2.0` | 211 |
| `MIT` | 118 |
| `Apache-2.0 OR MIT` | 53 |
| `Unicode-3.0` | 18 |
| `Zlib OR Apache-2.0 OR MIT` | 17 |
| `MIT/Apache-2.0` | 12 |
| `Unlicense OR MIT` | 9 |
| `Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT` | 5 |
| `MPL-2.0` | 5 |
| `Apache-2.0` | 3 |
| `Apache-2.0/MIT` | 3 |
| `BSD-3-Clause` | 2 |
| `BSD-3-Clause OR MIT OR Apache-2.0` | 2 |
| `MIT OR Apache-2.0 OR LGPL-2.1-or-later` | 2 |
| `MIT OR Apache-2.0 OR Zlib` | 2 |
| `MIT OR Zlib OR Apache-2.0` | 2 |
| `Unlicense/MIT` | 2 |
| `Zlib` | 2 |
| `(MIT OR Apache-2.0) AND Unicode-3.0` | 1 |
| `0BSD OR MIT OR Apache-2.0` | 1 |
| `Apache-2.0 / MIT` | 1 |
| `Apache-2.0 AND MIT` | 1 |
| `Apache-2.0 WITH LLVM-exception` | 1 |
| `BSD-3-Clause AND MIT` | 1 |
| `BSD-3-Clause/MIT` | 1 |
| `CC0-1.0 OR MIT-0 OR Apache-2.0` | 1 |
| `ISC` | 1 |
| `openmark` (this project — MIT), not a registry package | 1 |

## 4.3 Rust licence summary — the packages linked into `openmark.exe`

| Licence expression | Linked crates |
|---|---|
| `MIT OR Apache-2.0` | 91 |
| `MIT` | 29 |
| `Apache-2.0 OR MIT` | 27 |
| `Unicode-3.0` | 15 |
| `MPL-2.0` | 4 |
| `Unlicense OR MIT` | 3 |
| `Apache-2.0` | 2 |
| `BSD-3-Clause` | 2 |
| `MIT/Apache-2.0` | 2 |
| `Unlicense/MIT` | 2 |
| `(MIT OR Apache-2.0) AND Unicode-3.0` | 1 |
| `Apache-2.0 / MIT` | 1 |
| `Apache-2.0 AND MIT` | 1 |
| `BSD-3-Clause AND MIT` | 1 |
| `BSD-3-Clause/MIT` | 1 |
| `CC0-1.0 OR MIT-0 OR Apache-2.0` | 1 |
| `MIT OR Apache-2.0 OR Zlib` | 1 |
| `Zlib` | 1 |
| Rust standard library / compiler internals, not in `Cargo.lock` (`std`, `core`, `alloc`, `proc_macro`, `rustc_demangle`, …) | 12 lib names |

Copyleft actually present in the shipped binary: **`cssparser`, `selectors`, `dtoa-short`, `option-ext` —
all MPL-2.0** (finding B1). `cssparser-macros@0.7.1` is also MPL-2.0 but is a proc-macro: it runs at compile
time and is not part of the distributed artefact. No other copyleft expression in the linked set.

# 5. Transitive dependencies

## 5.1 JavaScript — production graph (240 packages)

The production closure is computed from `pnpm-lock.yaml` `snapshots`, walking from the 35 direct `dependencies`
(dev dependencies excluded). These are the packages Vite may bundle; the ones actually imported end up in
`dist/assets/`.

| Licence | Packages |
|---|---|
| `MIT` | 173 |
| `ISC` | 36 |
| `Apache-2.0` | 9 |
| `MIT OR Apache-2.0` | 7 |
| `BSD-3-Clause` | 6 |
| `Apache-2.0 OR MIT` | 2 |
| `Unlicense` | 2 |
| `(MPL-2.0 OR Apache-2.0)` | 1 |
| `BSD-2-Clause` | 1 |
| `EPL-2.0` | 1 |
| `PSF-2.0` | 1 |
| `UNKNOWN (no license field in package.json)` | 1 |

The only copyleft entries are `elkjs@0.9.3` (EPL-2.0, finding B2), `dompurify@3.4.17`
(`(MPL-2.0 OR Apache-2.0)`, Apache elected) and `khroma@2.1.0` (undeclared — finding B3).

## 5.2 JavaScript — development tooling only (378 packages, NOT redistributed)

Direct dev dependencies: `@playwright/test`, `@tauri-apps/cli`, `@types/markdown-it`, `@types/node`,
`@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `@vitest/coverage-v8`, `@wdio/cli`,
`@wdio/globals`, `@wdio/local-runner`, `@wdio/mocha-framework`, `@wdio/spec-reporter`, `@wdio/tauri-service`,
`eslint`, `fast-check`, `jsdom`, `prettier`, `typescript`, `vite`, `vitest`, `webdriverio`.

None of this reaches `dist/` and none of it is embedded in the binary, so no attribution obligation attaches.
It is summarised here so that the copyleft entries are on the record:

| Licence | Packages |
|---|---|
| `MIT` | 269 |
| `Apache-2.0` | 43 |
| `ISC` | 19 |
| `BSD-2-Clause` | 13 |
| `Apache-2.0 OR MIT` | 12 |
| `MPL-2.0` | 12 |
| `BSD-3-Clause` | 4 |
| `BlueOak-1.0.0` | 3 |
| `(MIT OR GPL-3.0-or-later)` | 1 |
| `CC-BY-4.0` | 1 |
| `MIT-0` | 1 |

Copyleft in the dev-only graph (informational, not a compliance obligation): 12 `MPL-2.0` packages
(ESLint/WebdriverIO/Playwright build tooling) and `jszip@3.10.2` offering `(MIT OR GPL-3.0-or-later)`, taken
under MIT. `@promptbook/utils@0.69.5` is `CC-BY-4.0` — documentation/asset-oriented, dev-only.

The Rust build-only subtree (`tauri-build` and everything reachable only from it) is likewise not
redistributed; the notable member is `dom_query@0.28.0` and its `cssparser`/`selectors`/`dtoa-short`
dependants, which — see finding B1 — are nevertheless pulled into the release build through feature
unification with the normal graph, and therefore *do* ship.

---

# 6. Obligations — what OpenMark must do to comply

## 6.1 General

1. **Ship the notices.** `docs/LICENSE_NOTICES.md` and the whole `THIRD_PARTY_LICENSES/` directory must
   accompany every distribution channel: the NSIS setup `OpenMark_0.1.0_x64-setup.exe`, the MSI
   `OpenMark_0.1.0_x64_en-US.msi`, the portable zip `OpenMark-0.1.0-portable.zip`, and any source release.
   Neither file is currently referenced by `src-tauri/tauri.conf.json` or the NSIS/WiX templates, so this
   must be wired up before shipping.
2. **Expose them in the UI.** An "Open source licences" entry (About dialog / settings) should render the
   content of this file, which is the mechanism that actually reaches WebView users.
3. **State modifications.** No third-party file is modified. `scripts/prepare-mathjax.mjs` performs a
   byte-for-byte copy with deletion only; Vite minifies and bundles by concatenation. Both facts are stated
   here and must stay true; if a patch is ever applied to vendored code, this document must record it.
4. **Do not remove the licence files** from `dist/mathjax/v4/LICENSE` or from the installed packages.

## 6.2 MIT / ISC / BSD-2 / BSD-3 / Unlicense / PSF-2.0 / Unicode-3.0 / Zlib / 0BSD

Permission-notice retention only. The texts are reproduced in `THIRD_PARTY_LICENSES/`; the relevant
copyright holders are the packages named in the tables and appendices of this document.

## 6.3 Apache-2.0 — `mathjax@4.1.3`, `@mathjax/mathjax-newcm-font@4.1.3`, `@mathjax/mathjax-mhchem-font-extension@4.1.3`

- Ship a copy of the licence: `THIRD_PARTY_LICENSES/Apache-2.0.txt` (and `dist/mathjax/v4/LICENSE` for the
  core package).
- Retain copyright/attribution notices — the vendored trees keep their upstream headers untouched.
- State modifications: **none** (pruning only).
- Pass on any NOTICE file: **none exists upstream** (verified).
- Because the font packages ship no licence file of their own, our copy is the only licence text the
  recipient gets for those two — hence finding B4.

## 6.4 MPL-2.0 — `cssparser@0.37.0`, `selectors@0.38.0`, `dtoa-short@0.3.5`, `option-ext@0.2.0`

MPL-2.0 is a *file-level* copyleft: it covers the MPL-licensed files, not OpenMark. To comply:

- Ship `THIRD_PARTY_LICENSES/MPL-2.0.txt` (exhibit A included).
- Make the source of the covered files available. These files are **unmodified**, and their exact sources
  are:
  - https://crates.io/crates/cssparser/0.37.0/download
  - https://crates.io/crates/selectors/0.38.0/download
  - https://crates.io/crates/dtoa-short/0.3.5/download
  - https://crates.io/crates/option-ext/0.2.0/download
  This URL list is the "notice of how to obtain the Source Code Form" that MPL-2.0 section 3.2 requires,
  and it is the reason this section must ship with the product.
- State that no MPL-covered file was modified (true).
- `mpi`/`cssparser-macros` note: `cssparser-macros@0.7.1` is MPL-2.0 too, but proc-macro crates are
  compile-time only and are not distributed, so it carries no obligation beyond this record.

## 6.5 EPL-2.0 — `elkjs@0.9.3`

- Ship `THIRD_PARTY_LICENSES/EPL-2.0.txt`.
- EPL-2.0 section 3.1 requires that a distributor of object code make the Source Code available, and
  section 3.2 requires informing recipients how to obtain it. `elkjs` is distributed here unmodified,
  minified and bundled inside `dist/assets/elk-QONTBCTQ-CKFwLDFw.js`. The source is available at
  https://github.com/kieler/elkjs (tag `v0.9.3`, EPL-2.0).
- This is the notice required by section 3.2; it must ship with the product.
- No ELK file was modified, so no section 3.3 source-disclosure for "Changed Files" is triggered. The
  minified bundle must nevertheless not strip the ELK copyright/licence headers where they survive.

## 6.6 Rust crates

Rust dependencies are statically linked, so the same licence texts apply to the binary. The dominant
expressions `MIT OR Apache-2.0` / `Apache-2.0 OR MIT` are satisfied by shipping both `MIT.txt` and
`Apache-2.0.txt`. `Unicode-3.0` (18 crates, 15 of them linked — `unicode-ident`, `icu_*`, `idna`, `url`, …)
requires only that the Unicode licence text and copyright notice travel with the distribution:
`THIRD_PARTY_LICENSES/Unicode-3.0.txt`.

---
# 7. How the "redistributed" column was verified

Nothing in this document was inferred from `package.json` alone. The following were run and inspected.

### 7.1 Frontend

```
ls dist                       -> assets  favicon.svg  index.html  mathjax  mathjax-fonts
find dist/mathjax -type f     -> 90 files   (9.8 MB)
find dist/mathjax-fonts -type f -> 46 files (11 MB)
ls dist/assets                -> 299 files  (298 .js chunks + 1 .css)
find public -iname "LICENSE*" -> public/mathjax/v4/LICENSE   (only one; the font packages ship none)
```

Package identity of the bundled chunks was confirmed by content, not by name:

| Chunk | Signature found in the file | Upstream package |
|---|---|---|
| `assets/elk-QONTBCTQ-CKFwLDFw.js` | `org.eclipse.elk` | `elkjs@0.9.3` (EPL-2.0) |
| `assets/katex-NhIUETkH.js` | `KaTeX` | `katex@0.18.10` |
| `assets/cytoscape.esm-Bf8Vg9Iv.js` | file name + size class | `cytoscape@3.34.3` |
| `assets/index-*.js` | `DOMPurify` | `dompurify@3.4.17` |

Tauri plugin usage was confirmed from the shipped invoke prefixes: the bundle contains `plugin:dialog|`,
`plugin:opener|`, `plugin:event|` and `plugin:resources|` — and none of `plugin:fs|`, `plugin:os|`,
`plugin:process|`, `plugin:store|`, `plugin:window-state|`.

### 7.2 Backend / packaged application

```
src-tauri/target/release/openmark.exe                                    14 473 216 bytes
src-tauri/target/release/openmark.pdb                                     9 719 808 bytes
src-tauri/target/release/bundle/nsis/OpenMark_0.1.0_x64-setup.exe
src-tauri/target/release/bundle/msi/OpenMark_0.1.0_x64_en-US.msi
src-tauri/target/release/portable/OpenMark-0.1.0-portable.zip
src-tauri/target/release/portable/OpenMark-0.1.0-portable/openmark.exe
```

The shipped Rust dependency set was read out of `openmark.pdb`: with `lto = "thin"` + `strip = "symbols"`,
the PDB records one LTO codegen unit per upstream rlib that took part in the final link, named
`openmark.<crate>-<metadata-hash>-…rcgu.o`. Extracting that name list yields **181 distinct crate lib names**
(12 of them are Rust standard-library/compiler internals with no `Cargo.lock` entry: `std`, `core`, `alloc`,
`proc_macro`, `rustc_demangle`, …). **169 of the 181 lib names correspond to Cargo.lock packages** —
185 Cargo.lock rows in total, because a few crates appear at more than one version — and all of them are
listed, with licences, in Appendix B. The header of the exe contains no crate names because symbols are stripped,
while embedded frontend asset paths survive (`mathjax` appears 134 times in `openmark.exe`, `mathjax-fonts`
46 times) — confirming that the vendored MathJax payload really is inside the shipped binary.

Cross-check that matches the analysis in section 4: the link list contains exactly one metadata hash per
crate, e.g. `option_ext-644be3cb78c8f1d3`, matching the fingerprint directory
`target/release/.fingerprint/option-ext-644be3cb78c8f1d3`, whose unit declares
`html-manipulation-2` among its enabled features — which is why `cssparser`, `selectors`, `dom_query` and
`dtoa_short` appear in the binary even though the project never enables that feature itself.

### 7.3 Reproducing the enumeration

```bash
cp ../pnpm-lock.yaml  |  parse snapshots:  -> 516 snapshot keys, 618 unique name@version
node_modules/.pnpm/<name>@<ver>/node_modules/<name>/package.json   # licence field + licence files
supabase-less fallback: https://registry.npmjs.org/<name>/<ver>   # 126 packages not installed
src-tauri/Cargo.lock      -> 478 packages
https://crates.io/api/v1/crates/<name>/<version>                  # 477 licence lookups, 1 req/s
.tools/cargo/registry/src/rsproxy.cn-e3de039b2554c837/<crate>-<ver>/  # local licence texts
```

---

# 8. Licence text files shipped with the project

`THIRD_PARTY_LICENSES/` contains the canonical texts. Provenance of each file, verbatim:

| File | Copied from | Covers |
|---|---|---|
| `Apache-2.0.txt` | `serde-1.0.229/LICENSE-APACHE` (local registry) — byte-identical to the MathJax template | MathJax + both font packages, and every `Apache-2.0` / `MIT OR Apache-2.0` dependency |
| `MIT.txt` | `serde-1.0.229/LICENSE-MIT` (local registry; holder-neutral text) | 173 production JS packages and 118 crates |
| `ISC.txt` | `yaml@2.9.1/LICENSE` | 36 production JS packages (incl. `yaml`, `markdown-it-task-lists`) |
| `BSD-2-Clause.txt` | `entities@8.1.0/LICENSE` | `entities@8.1.0` and other BSD-2 packages |
| `BSD-3-Clause.txt` | `d3-ease@3.0.1/LICENSE` | `d3-*` packages, `rw` |
| `Unlicense.txt` | `markdown-it-anchor@10.0.0/UNLICENSE` | `markdown-it-anchor`, plus the 9 Rust `Unlicense OR MIT` crates |
| `PSF-2.0.txt` | `argparse@3.0.2/LICENSE` | `argparse@3.0.2` |
| `MPL-2.0.txt` | `option-ext-0.2.0/LICENSE.txt` (local registry) | findings B1 packages |
| `EPL-2.0.txt` | `elkjs@0.9.3/LICENSE.md` | `elkjs@0.9.3` (finding B2) |
| `Unicode-3.0.txt` | `unicode-ident-1.0.27/LICENSE-UNICODE` (local registry) | 18 Rust packages incl. `unicode-ident`, `icu_*`, `idna`, `url` |
| `Zlib.txt` | `bytemuck-1.25.2/LICENSE-ZLIB` (local registry) | `Zlib` / `Zlib OR …` Rust alternatives we rely on |
| `0BSD.txt` | `adler2-2.0.1/LICENSE-0BSD` (local registry) | the `0BSD OR MIT OR Apache-2.0` alternative |

Note that `MIT.txt`, `ISC.txt`, `BSD-*.txt`, `Zlib.txt` and `0BSD.txt` are *template* texts; some upstream
packages fill in a specific copyright holder line, and those holders ship their own licence file inside
their package. The canonical references for a given holder are listed in the appendices.

---
---

# Appendix A — JavaScript production dependency closure (240 packages)

Every package reachable from the 35 direct `dependencies`. "Direct" marks the declared ones. Not every
transitive package necessarily survives Vite tree-shaking; the direct-dep table in section 2 records what
verifiably ships.

<details>
<summary>240 packages — click to expand</summary>

| Package | Version | Licence | Direct? |
|---|---|---|---|
| `@antfu/install-pkg` | 2.1.0 | MIT |  |
| `@braintree/sanitize-url` | 7.1.2 | MIT |  |
| `@chevrotain/cst-dts-gen` | 13.2.0 | Apache-2.0 |  |
| `@chevrotain/gast` | 13.2.0 | Apache-2.0 |  |
| `@chevrotain/regexp-to-ast` | 13.2.0 | Apache-2.0 |  |
| `@chevrotain/types` | 13.2.0 | Apache-2.0 |  |
| `@chevrotain/utils` | 13.2.0 | Apache-2.0 |  |
| `@codemirror/autocomplete` | 6.20.3 | MIT | yes |
| `@codemirror/commands` | 6.11.1 | MIT | yes |
| `@codemirror/lang-angular` | 0.1.4 | MIT |  |
| `@codemirror/lang-cpp` | 6.0.3 | MIT |  |
| `@codemirror/lang-css` | 6.3.1 | MIT |  |
| `@codemirror/lang-go` | 6.0.1 | MIT |  |
| `@codemirror/lang-html` | 6.4.12 | MIT |  |
| `@codemirror/lang-java` | 6.0.2 | MIT |  |
| `@codemirror/lang-javascript` | 6.2.5 | MIT |  |
| `@codemirror/lang-jinja` | 6.0.1 | MIT |  |
| `@codemirror/lang-json` | 6.0.2 | MIT |  |
| `@codemirror/lang-less` | 6.0.2 | MIT |  |
| `@codemirror/lang-liquid` | 6.3.3 | MIT |  |
| `@codemirror/lang-markdown` | 6.5.2 | MIT | yes |
| `@codemirror/lang-php` | 6.0.2 | MIT |  |
| `@codemirror/lang-python` | 6.2.1 | MIT |  |
| `@codemirror/lang-rust` | 6.0.2 | MIT |  |
| `@codemirror/lang-sass` | 6.0.2 | MIT |  |
| `@codemirror/lang-sql` | 6.10.0 | MIT |  |
| `@codemirror/lang-vue` | 0.1.3 | MIT |  |
| `@codemirror/lang-wast` | 6.0.2 | MIT |  |
| `@codemirror/lang-xml` | 6.1.0 | MIT |  |
| `@codemirror/lang-yaml` | 6.1.3 | MIT |  |
| `@codemirror/language-data` | 6.5.2 | MIT | yes |
| `@codemirror/language` | 6.13.1 | MIT | yes |
| `@codemirror/legacy-modes` | 6.5.5 | MIT |  |
| `@codemirror/lint` | 6.9.7 | MIT |  |
| `@codemirror/search` | 6.7.2 | MIT | yes |
| `@codemirror/state` | 6.7.6 | MIT | yes |
| `@codemirror/streamparser` | 6.0.0 | MIT |  |
| `@codemirror/view` | 6.43.14 | MIT | yes |
| `@iconify/types` | 2.0.0 | MIT |  |
| `@iconify/utils` | 3.1.7 | MIT |  |
| `@lezer/common` | 1.5.3 | MIT |  |
| `@lezer/cpp` | 1.1.6 | MIT |  |
| `@lezer/css` | 1.3.9 | MIT |  |
| `@lezer/go` | 1.0.1 | MIT |  |
| `@lezer/highlight` | 1.2.5 | MIT | yes |
| `@lezer/html` | 1.3.13 | MIT |  |
| `@lezer/java` | 1.1.5 | MIT |  |
| `@lezer/javascript` | 1.5.6 | MIT |  |
| `@lezer/json` | 1.0.3 | MIT |  |
| `@lezer/lr` | 1.4.11 | MIT |  |
| `@lezer/markdown` | 1.8.0 | MIT |  |
| `@lezer/php` | 1.0.6 | MIT |  |
| `@lezer/python` | 1.1.19 | MIT |  |
| `@lezer/rust` | 1.0.3 | MIT |  |
| `@lezer/sass` | 1.1.0 | MIT |  |
| `@lezer/xml` | 1.0.6 | MIT |  |
| `@lezer/yaml` | 1.0.4 | MIT |  |
| `@marijn/find-cluster-break` | 1.0.4 | MIT |  |
| `@mathjax/mathjax-mhchem-font-extension` | 4.1.3 | Apache-2.0 | yes |
| `@mathjax/mathjax-newcm-font` | 4.1.3 | Apache-2.0 | yes |
| `@mermaid-js/parser` | 2.0.1 | MIT |  |
| `@shikijs/core` | 4.5.0 | MIT |  |
| `@shikijs/engine-javascript` | 4.5.0 | MIT |  |
| `@shikijs/engine-oniguruma` | 4.5.0 | MIT |  |
| `@shikijs/langs` | 4.5.0 | MIT |  |
| `@shikijs/primitive` | 4.5.0 | MIT |  |
| `@shikijs/themes` | 4.5.0 | MIT |  |
| `@shikijs/types` | 4.5.0 | MIT |  |
| `@shikijs/vscode-textmate` | 10.0.2 | MIT |  |
| `@tauri-apps/api` | 2.12.3 | Apache-2.0 OR MIT |  |
| `@tauri-apps/api` | 2.12.4 | Apache-2.0 OR MIT | yes |
| `@tauri-apps/plugin-dialog` | 2.8.3 | MIT OR Apache-2.0 | yes |
| `@tauri-apps/plugin-fs` | 2.7.1 | MIT OR Apache-2.0 | yes |
| `@tauri-apps/plugin-opener` | 2.7.2 | MIT OR Apache-2.0 | yes |
| `@tauri-apps/plugin-os` | 2.4.0 | MIT OR Apache-2.0 | yes |
| `@tauri-apps/plugin-process` | 2.4.0 | MIT OR Apache-2.0 | yes |
| `@tauri-apps/plugin-store` | 2.5.0 | MIT OR Apache-2.0 | yes |
| `@tauri-apps/plugin-window-state` | 2.5.0 | MIT OR Apache-2.0 | yes |
| `@types/d3-array` | 3.2.2 | MIT |  |
| `@types/d3-axis` | 3.0.6 | MIT |  |
| `@types/d3-brush` | 3.0.6 | MIT |  |
| `@types/d3-chord` | 3.0.6 | MIT |  |
| `@types/d3-color` | 3.1.3 | MIT |  |
| `@types/d3-contour` | 3.0.6 | MIT |  |
| `@types/d3-delaunay` | 6.0.4 | MIT |  |
| `@types/d3-dispatch` | 3.0.7 | MIT |  |
| `@types/d3-drag` | 3.0.7 | MIT |  |
| `@types/d3-dsv` | 3.0.7 | MIT |  |
| `@types/d3-ease` | 3.0.2 | MIT |  |
| `@types/d3-fetch` | 3.0.7 | MIT |  |
| `@types/d3-force` | 3.0.10 | MIT |  |
| `@types/d3-format` | 3.0.4 | MIT |  |
| `@types/d3-geo` | 3.1.1 | MIT |  |
| `@types/d3-hierarchy` | 3.1.7 | MIT |  |
| `@types/d3-interpolate` | 3.0.4 | MIT |  |
| `@types/d3-path` | 3.1.1 | MIT |  |
| `@types/d3-polygon` | 3.0.2 | MIT |  |
| `@types/d3-quadtree` | 3.0.6 | MIT |  |
| `@types/d3-random` | 3.0.4 | MIT |  |
| `@types/d3-scale-chromatic` | 3.1.0 | MIT |  |
| `@types/d3-scale` | 4.0.9 | MIT |  |
| `@types/d3-selection` | 3.0.12 | MIT |  |
| `@types/d3-shape` | 3.2.0 | MIT |  |
| `@types/d3-time-format` | 4.0.3 | MIT |  |
| `@types/d3-time` | 3.0.4 | MIT |  |
| `@types/d3-timer` | 3.0.2 | MIT |  |
| `@types/d3-transition` | 3.0.9 | MIT |  |
| `@types/d3-zoom` | 3.0.9 | MIT |  |
| `@types/d3` | 7.4.3 | MIT |  |
| `@types/geojson` | 7946.0.16 | MIT |  |
| `@types/hast` | 3.0.5 | MIT |  |
| `@types/mdast` | 4.0.4 | MIT |  |
| `@types/trusted-types` | 2.0.7 | MIT |  |
| `@types/unist` | 3.0.3 | MIT |  |
| `@ungap/structured-clone` | 1.4.0 | ISC |  |
| `@upsetjs/venn.js` | 2.0.0 | MIT |  |
| `argparse` | 3.0.2 | PSF-2.0 |  |
| `ccount` | 2.0.1 | MIT |  |
| `character-entities-html4` | 2.1.0 | MIT |  |
| `character-entities-legacy` | 3.0.0 | MIT |  |
| `chevrotain` | 13.2.0 | Apache-2.0 |  |
| `comma-separated-tokens` | 2.0.3 | MIT |  |
| `commander` | 15.0.0 | MIT |  |
| `commander` | 7.2.0 | MIT |  |
| `crelt` | 1.0.7 | MIT |  |
| `cytoscape-cose-bilkent` | 4.1.0 | MIT |  |
| `cytoscape-fcose` | 2.2.0 | MIT |  |
| `cytoscape` | 3.34.3 | MIT |  |
| `d3-array` | 2.12.1 | BSD-3-Clause |  |
| `d3-array` | 3.2.4 | ISC |  |
| `d3-axis` | 3.0.0 | ISC |  |
| `d3-brush` | 3.0.0 | ISC |  |
| `d3-chord` | 3.0.1 | ISC |  |
| `d3-color` | 3.1.0 | ISC |  |
| `d3-contour` | 4.0.2 | ISC |  |
| `d3-delaunay` | 6.0.4 | ISC |  |
| `d3-dispatch` | 3.0.1 | ISC |  |
| `d3-drag` | 3.0.0 | ISC |  |
| `d3-dsv` | 3.0.1 | ISC |  |
| `d3-ease` | 3.0.1 | BSD-3-Clause |  |
| `d3-fetch` | 3.0.1 | ISC |  |
| `d3-force` | 3.0.0 | ISC |  |
| `d3-format` | 3.1.2 | ISC |  |
| `d3-geo` | 3.1.1 | ISC |  |
| `d3-hierarchy` | 3.1.2 | ISC |  |
| `d3-interpolate` | 3.0.1 | ISC |  |
| `d3-path` | 1.0.9 | BSD-3-Clause |  |
| `d3-path` | 3.1.0 | ISC |  |
| `d3-polygon` | 3.0.1 | ISC |  |
| `d3-quadtree` | 3.0.1 | ISC |  |
| `d3-random` | 3.0.1 | ISC |  |
| `d3-sankey` | 0.12.3 | BSD-3-Clause |  |
| `d3-scale-chromatic` | 3.1.0 | ISC |  |
| `d3-scale` | 4.0.2 | ISC |  |
| `d3-selection` | 3.0.0 | ISC |  |
| `d3-shape` | 1.3.7 | BSD-3-Clause |  |
| `d3-shape` | 3.2.0 | ISC |  |
| `d3-time-format` | 4.1.0 | ISC |  |
| `d3-time` | 3.1.0 | ISC |  |
| `d3-timer` | 3.0.1 | ISC |  |
| `d3-transition` | 3.0.1 | ISC |  |
| `d3-zoom` | 3.0.0 | ISC |  |
| `d3` | 7.9.0 | ISC |  |
| `dagre-d3-es` | 7.0.14 | MIT |  |
| `dayjs` | 1.11.23 | MIT |  |
| `delaunator` | 5.1.0 | ISC |  |
| `dequal` | 2.0.3 | MIT |  |
| `devlop` | 1.1.0 | MIT |  |
| `dompurify` | 3.4.17 | (MPL-2.0 OR Apache-2.0) | yes |
| `elkjs` | 0.9.3 | EPL-2.0 |  |
| `entities` | 8.1.0 | BSD-2-Clause |  |
| `es-toolkit` | 1.52.0 | MIT |  |
| `hachure-fill` | 0.5.2 | MIT |  |
| `hast-util-to-html` | 9.0.5 | MIT |  |
| `hast-util-whitespace` | 3.0.0 | MIT |  |
| `html-void-elements` | 3.0.0 | MIT |  |
| `iconv-lite` | 0.6.3 | MIT |  |
| `import-meta-resolve` | 4.2.0 | MIT |  |
| `internmap` | 1.0.1 | ISC |  |
| `internmap` | 2.0.3 | ISC |  |
| `katex` | 0.18.10 | MIT |  |
| `khroma` | 2.1.0 | UNDECLARED (ships MIT licence file) |  |
| `linkify-it` | 6.1.0 | MIT |  |
| `lodash-es` | 4.18.1 | MIT |  |
| `markdown-it-anchor` | 10.0.0 | Unlicense | yes |
| `markdown-it-deflist` | 4.0.0 | MIT | yes |
| `markdown-it-footnote` | 4.0.0 | MIT | yes |
| `markdown-it-mark` | 4.0.0 | MIT | yes |
| `markdown-it-sub` | 2.0.0 | MIT | yes |
| `markdown-it-sup` | 2.0.0 | MIT | yes |
| `markdown-it-task-lists` | 2.1.1 | ISC | yes |
| `markdown-it` | 15.0.2 | MIT | yes |
| `marked` | 16.4.2 | MIT |  |
| `mathjax` | 4.1.3 | Apache-2.0 | yes |
| `mdast-util-to-hast` | 13.2.1 | MIT |  |
| `mdurl` | 2.1.0 | MIT |  |
| `mermaid` | 12.2.0 | MIT | yes |
| `micromark-util-character` | 2.1.1 | MIT |  |
| `micromark-util-encode` | 2.0.1 | MIT |  |
| `micromark-util-sanitize-uri` | 2.0.1 | MIT |  |
| `micromark-util-symbol` | 2.0.1 | MIT |  |
| `micromark-util-types` | 2.0.3 | MIT |  |
| `oniguruma-parser` | 0.12.2 | MIT |  |
| `oniguruma-to-es` | 4.3.6 | MIT |  |
| `package-manager-detector` | 1.9.0 | MIT |  |
| `path-data-parser` | 0.1.0 | MIT |  |
| `points-on-curve` | 0.2.0 | MIT |  |
| `points-on-path` | 0.2.1 | MIT |  |
| `property-information` | 7.2.0 | MIT |  |
| `punycode.js` | 2.3.1 | MIT |  |
| `react-dom` | 19.3.1 | MIT | yes |
| `react` | 19.3.1 | MIT | yes |
| `regex-recursion` | 6.0.2 | MIT |  |
| `regex-utilities` | 2.3.0 | MIT |  |
| `regex` | 6.1.0 | MIT |  |
| `robust-predicates` | 3.0.3 | Unlicense |  |
| `roughjs` | 4.6.6 | MIT |  |
| `rw` | 1.3.3 | BSD-3-Clause |  |
| `safer-buffer` | 2.1.2 | MIT |  |
| `shiki` | 4.5.0 | MIT | yes |
| `space-separated-tokens` | 2.0.2 | MIT |  |
| `stringify-entities` | 4.0.4 | MIT |  |
| `style-mod` | 4.1.4 | MIT |  |
| `stylis` | 4.4.0 | MIT |  |
| `tinyexec` | 1.3.1 | MIT |  |
| `trim-lines` | 3.0.1 | MIT |  |
| `ts-dedent` | 2.3.0 | MIT |  |
| `uc.micro` | 3.0.0 | MIT |  |
| `unist-util-is` | 6.0.1 | MIT |  |
| `unist-util-position` | 5.0.0 | MIT |  |
| `unist-util-stringify-position` | 4.0.0 | MIT |  |
| `unist-util-visit-parents` | 6.0.2 | MIT |  |
| `unist-util-visit` | 5.1.0 | MIT |  |
| `uuid` | 14.0.3 | MIT |  |
| `vfile-message` | 4.0.3 | MIT |  |
| `vfile` | 6.0.3 | MIT |  |
| `w3c-keyname` | 2.2.8 | MIT |  |
| `yaml` | 2.9.1 | ISC | yes |
| `zustand` | 5.0.15 | MIT | yes |
| `zwitch` | 2.0.4 | MIT |  |

</details>

---

# Appendix B — Rust dependencies from `Cargo.lock` (477 crates.io packages)

"In binary" is derived from the release PDB (section 7.2).

<details>
<summary>477 crates — click to expand</summary>

| Crate | Version | Licence | In `openmark.exe`? |
|---|---|---|---|
| `adler2` | 2.0.1 | 0BSD OR MIT OR Apache-2.0 |  |
| `aho-corasick` | 1.1.5 | Unlicense OR MIT | **yes** |
| `alloc-no-stdlib` | 3.0.0 | BSD-3-Clause | **yes** |
| `alloc-stdlib` | 0.3.0 | BSD-3-Clause | **yes** |
| `android_system_properties` | 0.1.6 | MIT OR Apache-2.0 |  |
| `anyhow` | 1.0.104 | MIT OR Apache-2.0 | **yes** |
| `async-broadcast` | 0.7.2 | MIT OR Apache-2.0 |  |
| `async-channel` | 2.5.0 | Apache-2.0 OR MIT |  |
| `async-executor` | 1.14.0 | Apache-2.0 OR MIT |  |
| `async-io` | 2.6.0 | Apache-2.0 OR MIT |  |
| `async-lock` | 3.4.2 | Apache-2.0 OR MIT |  |
| `async-process` | 2.5.0 | Apache-2.0 OR MIT |  |
| `async-recursion` | 1.2.0 | MIT OR Apache-2.0 |  |
| `async-signal` | 0.2.14 | Apache-2.0 OR MIT |  |
| `async-task` | 4.7.1 | Apache-2.0 OR MIT |  |
| `async-trait` | 0.1.92 | MIT OR Apache-2.0 |  |
| `atk` | 0.18.2 | MIT |  |
| `atk-sys` | 0.18.2 | MIT |  |
| `atomic-waker` | 1.1.2 | Apache-2.0 OR MIT |  |
| `autocfg` | 1.5.1 | Apache-2.0 OR MIT |  |
| `base64` | 0.21.7 | MIT OR Apache-2.0 | **yes** |
| `base64` | 0.22.1 | MIT OR Apache-2.0 | **yes** |
| `base64` | 0.23.1 | MIT OR Apache-2.0 | **yes** |
| `bincode` | 1.3.3 | MIT | **yes** |
| `bit-set` | 0.8.0 | Apache-2.0 OR MIT | **yes** |
| `bit-vec` | 0.8.0 | Apache-2.0 OR MIT | **yes** |
| `bitflags` | 1.3.2 | MIT/Apache-2.0 | **yes** |
| `bitflags` | 2.13.2 | MIT OR Apache-2.0 | **yes** |
| `block-buffer` | 0.10.4 | MIT OR Apache-2.0 |  |
| `block2` | 0.6.2 | MIT |  |
| `blocking` | 1.7.0 | Apache-2.0 OR MIT |  |
| `brotli` | 9.0.0 | BSD-3-Clause AND MIT | **yes** |
| `brotli-decompressor` | 6.0.1 | BSD-3-Clause/MIT | **yes** |
| `bs58` | 0.5.1 | MIT/Apache-2.0 |  |
| `bumpalo` | 3.20.3 | MIT OR Apache-2.0 |  |
| `bytemuck` | 1.25.2 | Zlib OR Apache-2.0 OR MIT |  |
| `byteorder` | 1.5.0 | Unlicense OR MIT |  |
| `bytes` | 1.12.1 | MIT | **yes** |
| `cairo-rs` | 0.18.5 | MIT |  |
| `cairo-sys-rs` | 0.18.2 | MIT |  |
| `camino` | 1.2.6 | MIT OR Apache-2.0 | **yes** |
| `cargo_metadata` | 0.19.2 | MIT | **yes** |
| `cargo_toml` | 1.0.1 | Apache-2.0 OR MIT |  |
| `cargo-platform` | 0.1.9 | MIT OR Apache-2.0 | **yes** |
| `cc` | 1.8.0 | MIT OR Apache-2.0 |  |
| `cesu8` | 1.1.0 | Apache-2.0/MIT |  |
| `cfb` | 0.14.0 | MIT | **yes** |
| `cfg_aliases` | 0.2.2 | MIT |  |
| `cfg-expr` | 0.15.8 | MIT OR Apache-2.0 |  |
| `cfg-if` | 1.0.5 | MIT OR Apache-2.0 | **yes** |
| `chrono` | 0.4.45 | MIT OR Apache-2.0 | **yes** |
| `combine` | 4.6.9 | MIT |  |
| `concurrent-queue` | 2.5.0 | Apache-2.0 OR MIT |  |
| `cookie` | 0.18.2 | MIT OR Apache-2.0 | **yes** |
| `core-foundation` | 0.10.1 | MIT OR Apache-2.0 |  |
| `core-foundation-sys` | 0.8.7 | MIT OR Apache-2.0 |  |
| `core-graphics` | 0.25.0 | MIT OR Apache-2.0 |  |
| `core-graphics-types` | 0.2.0 | MIT OR Apache-2.0 |  |
| `cpufeatures` | 0.2.17 | MIT OR Apache-2.0 |  |
| `crc32fast` | 1.5.2 | MIT OR Apache-2.0 |  |
| `crossbeam-channel` | 0.5.17 | MIT OR Apache-2.0 | **yes** |
| `crossbeam-utils` | 0.8.23 | MIT OR Apache-2.0 | **yes** |
| `crypto-common` | 0.1.7 | MIT OR Apache-2.0 |  |
| `cssparser` | 0.37.0 | MPL-2.0 | **yes** |
| `cssparser-macros` | 0.7.1 | MPL-2.0 |  |
| `ctor` | 1.0.13 | Apache-2.0 OR MIT | **yes** |
| `darling` | 0.24.1 | MIT |  |
| `darling_core` | 0.24.1 | MIT |  |
| `darling_macro` | 0.24.1 | MIT |  |
| `dbus` | 0.9.12 | Apache-2.0/MIT |  |
| `defmt` | 1.2.0 | MIT OR Apache-2.0 |  |
| `defmt-macros` | 1.2.0 | MIT OR Apache-2.0 |  |
| `defmt-parser` | 1.1.0 | MIT OR Apache-2.0 |  |
| `deranged` | 0.5.9 | MIT OR Apache-2.0 | **yes** |
| `derive_more` | 2.1.1 | MIT | **yes** |
| `derive_more-impl` | 2.1.1 | MIT |  |
| `digest` | 0.10.7 | MIT OR Apache-2.0 |  |
| `dirs` | 7.0.0 | MIT OR Apache-2.0 | **yes** |
| `dirs-sys` | 0.5.0 | MIT OR Apache-2.0 | **yes** |
| `dispatch2` | 0.3.1 | Zlib OR Apache-2.0 OR MIT |  |
| `displaydoc` | 0.2.7 | MIT OR Apache-2.0 |  |
| `dlopen2` | 0.8.2 | MIT |  |
| `dlopen2_derive` | 0.4.3 | MIT |  |
| `dom_query` | 0.28.0 | MIT | **yes** |
| `dpi` | 0.1.2 | Apache-2.0 AND MIT | **yes** |
| `dtoa` | 1.0.11 | MIT OR Apache-2.0 | **yes** |
| `dtoa-short` | 0.3.5 | MPL-2.0 | **yes** |
| `dunce` | 1.0.5 | CC0-1.0 OR MIT-0 OR Apache-2.0 | **yes** |
| `dyn-clone` | 1.0.20 | MIT OR Apache-2.0 | **yes** |
| `embed_plist` | 1.2.2 | MIT OR Apache-2.0 |  |
| `embed-resource` | 3.0.12 | MIT |  |
| `endi` | 1.1.1 | MIT |  |
| `enumflags2` | 0.7.12 | MIT OR Apache-2.0 |  |
| `enumflags2_derive` | 0.7.12 | MIT OR Apache-2.0 |  |
| `equivalent` | 1.0.3 | Apache-2.0 OR MIT | **yes** |
| `erased-serde` | 0.4.10 | MIT OR Apache-2.0 | **yes** |
| `errno` | 0.3.14 | MIT OR Apache-2.0 |  |
| `event-listener` | 5.4.2 | Apache-2.0 OR MIT |  |
| `event-listener-strategy` | 0.5.4 | Apache-2.0 OR MIT |  |
| `fastrand` | 2.5.0 | Apache-2.0 OR MIT |  |
| `fdeflate` | 0.3.7 | MIT OR Apache-2.0 |  |
| `field-offset` | 0.3.6 | MIT OR Apache-2.0 |  |
| `find-msvc-tools` | 0.1.14 | MIT OR Apache-2.0 |  |
| `flate2` | 1.1.10 | MIT OR Apache-2.0 |  |
| `fnv` | 1.0.7 | Apache-2.0 / MIT | **yes** |
| `foldhash` | 0.2.0 | Zlib | **yes** |
| `foreign-types` | 0.5.0 | MIT/Apache-2.0 |  |
| `foreign-types-macros` | 0.2.4 | MIT/Apache-2.0 |  |
| `foreign-types-shared` | 0.3.1 | MIT/Apache-2.0 |  |
| `form_urlencoded` | 1.2.2 | MIT OR Apache-2.0 | **yes** |
| `futures-channel` | 0.3.34 | MIT OR Apache-2.0 |  |
| `futures-core` | 0.3.34 | MIT OR Apache-2.0 |  |
| `futures-executor` | 0.3.34 | MIT OR Apache-2.0 |  |
| `futures-io` | 0.3.34 | MIT OR Apache-2.0 |  |
| `futures-lite` | 2.6.1 | Apache-2.0 OR MIT |  |
| `futures-macro` | 0.3.34 | MIT OR Apache-2.0 |  |
| `futures-sink` | 0.3.34 | MIT OR Apache-2.0 |  |
| `futures-task` | 0.3.34 | MIT OR Apache-2.0 |  |
| `futures-util` | 0.3.34 | MIT OR Apache-2.0 |  |
| `gdk` | 0.18.2 | MIT |  |
| `gdk-pixbuf` | 0.18.5 | MIT |  |
| `gdk-pixbuf-sys` | 0.18.0 | MIT |  |
| `gdk-sys` | 0.18.2 | MIT |  |
| `gdkwayland-sys` | 0.18.2 | MIT |  |
| `gdkx11` | 0.18.2 | MIT |  |
| `gdkx11-sys` | 0.18.2 | MIT |  |
| `generic-array` | 0.14.7 | MIT |  |
| `gethostname` | 1.1.0 | Apache-2.0 | **yes** |
| `getrandom` | 0.3.4 | MIT OR Apache-2.0 | **yes** |
| `getrandom` | 0.4.3 | MIT OR Apache-2.0 | **yes** |
| `gio` | 0.18.4 | MIT |  |
| `gio-sys` | 0.18.1 | MIT |  |
| `glib` | 0.18.5 | MIT |  |
| `glib-macros` | 0.18.5 | MIT |  |
| `glib-sys` | 0.18.1 | MIT |  |
| `glob` | 0.3.4 | MIT OR Apache-2.0 | **yes** |
| `gobject-sys` | 0.18.0 | MIT |  |
| `gtk` | 0.18.2 | MIT |  |
| `gtk-sys` | 0.18.2 | MIT |  |
| `gtk3-macros` | 0.18.2 | MIT |  |
| `hashbrown` | 0.12.3 | MIT OR Apache-2.0 | **yes** |
| `hashbrown` | 0.17.1 | MIT OR Apache-2.0 | **yes** |
| `heck` | 0.4.1 | MIT OR Apache-2.0 |  |
| `heck` | 0.5.0 | MIT OR Apache-2.0 |  |
| `hermit-abi` | 0.5.3 | MIT OR Apache-2.0 |  |
| `hex` | 0.4.3 | MIT OR Apache-2.0 |  |
| `html5ever` | 0.39.0 | MIT OR Apache-2.0 | **yes** |
| `http` | 1.5.0 | MIT OR Apache-2.0 | **yes** |
| `http-body` | 1.1.0 | MIT |  |
| `http-body-util` | 0.1.5 | MIT |  |
| `http-range` | 0.1.5 | MIT | **yes** |
| `httparse` | 1.10.1 | MIT OR Apache-2.0 |  |
| `hyper` | 1.12.0 | MIT |  |
| `hyper-util` | 0.1.21 | MIT |  |
| `iana-time-zone` | 0.1.65 | MIT OR Apache-2.0 |  |
| `iana-time-zone-haiku` | 0.1.2 | MIT OR Apache-2.0 |  |
| `ico` | 0.5.0 | MIT |  |
| `icu_collections` | 2.3.0 | Unicode-3.0 | **yes** |
| `icu_locale_core` | 2.3.0 | Unicode-3.0 | **yes** |
| `icu_normalizer` | 2.3.0 | Unicode-3.0 | **yes** |
| `icu_normalizer_data` | 2.3.0 | Unicode-3.0 | **yes** |
| `icu_properties` | 2.3.0 | Unicode-3.0 | **yes** |
| `icu_properties_data` | 2.3.0 | Unicode-3.0 | **yes** |
| `icu_provider` | 2.3.1 | Unicode-3.0 | **yes** |
| `ident_case` | 1.0.1 | MIT/Apache-2.0 |  |
| `idna` | 1.1.0 | MIT OR Apache-2.0 | **yes** |
| `idna_adapter` | 1.2.2 | Apache-2.0 OR MIT | **yes** |
| `indexmap` | 1.9.3 | Apache-2.0 OR MIT | **yes** |
| `indexmap` | 2.14.2 | Apache-2.0 OR MIT | **yes** |
| `infer` | 0.22.0 | MIT | **yes** |
| `ipnet` | 2.12.2 | MIT OR Apache-2.0 |  |
| `is-docker` | 0.2.0 | MIT |  |
| `is-wsl` | 0.4.0 | MIT |  |
| `itoa` | 1.0.18 | MIT OR Apache-2.0 | **yes** |
| `javascriptcore-rs` | 1.1.2 | MIT |  |
| `javascriptcore-rs-sys` | 1.1.1 | MIT |  |
| `jiff` | 0.2.38 | Unlicense OR MIT |  |
| `jiff-core` | 0.1.1 | Unlicense OR MIT |  |
| `jiff-static` | 0.2.38 | Unlicense OR MIT |  |
| `jiff-tzdb` | 0.1.9 | Unlicense OR MIT |  |
| `jiff-tzdb-platform` | 0.1.3 | Unlicense OR MIT |  |
| `jni` | 0.21.1 | MIT/Apache-2.0 |  |
| `jni-sys` | 0.4.1 | MIT OR Apache-2.0 |  |
| `jni-sys` | 0.3.1 | MIT OR Apache-2.0 |  |
| `jni-sys-macros` | 0.4.1 | MIT OR Apache-2.0 |  |
| `js-sys` | 0.3.106 | MIT OR Apache-2.0 |  |
| `json-patch` | 4.2.0 | MIT/Apache-2.0 | **yes** |
| `jsonptr` | 0.7.1 | MIT OR Apache-2.0 | **yes** |
| `keyboard-types` | 0.8.3 | MIT OR Apache-2.0 | **yes** |
| `libappindicator` | 0.9.0 | Apache-2.0 OR MIT |  |
| `libappindicator-sys` | 0.9.0 | Apache-2.0 OR MIT |  |
| `libc` | 0.2.190 | MIT OR Apache-2.0 |  |
| `libdbus-sys` | 0.2.7 | Apache-2.0/MIT |  |
| `libloading` | 0.7.4 | ISC |  |
| `libredox` | 0.1.25 | MIT |  |
| `linux-raw-sys` | 0.12.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  |
| `litemap` | 0.8.3 | Unicode-3.0 | **yes** |
| `lock_api` | 0.4.14 | MIT OR Apache-2.0 | **yes** |
| `log` | 0.4.34 | MIT OR Apache-2.0 | **yes** |
| `markup5ever` | 0.39.0 | MIT OR Apache-2.0 | **yes** |
| `memchr` | 2.8.3 | Unlicense OR MIT | **yes** |
| `memoffset` | 0.9.1 | MIT |  |
| `mime` | 0.3.17 | MIT OR Apache-2.0 | **yes** |
| `miniz_oxide` | 0.8.9 | MIT OR Zlib OR Apache-2.0 |  |
| `miniz_oxide` | 0.9.1 | MIT OR Zlib OR Apache-2.0 |  |
| `mio` | 1.2.4 | MIT | **yes** |
| `muda` | 0.20.0 | Apache-2.0 OR MIT | **yes** |
| `ndk` | 0.9.0 | MIT OR Apache-2.0 |  |
| `ndk-context` | 0.1.1 | MIT OR Apache-2.0 |  |
| `ndk-sys` | 0.6.0+11769913 | MIT OR Apache-2.0 |  |
| `new_debug_unreachable` | 1.0.6 | MIT |  |
| `nix` | 0.31.3 | MIT |  |
| `num_enum` | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 |  |
| `num_enum_derive` | 0.7.6 | BSD-3-Clause OR MIT OR Apache-2.0 |  |
| `num-conv` | 0.2.2 | MIT OR Apache-2.0 | **yes** |
| `num-traits` | 0.2.19 | MIT OR Apache-2.0 | **yes** |
| `objc2` | 0.6.5 | MIT |  |
| `objc2-app-kit` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-cloud-kit` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-core-data` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-core-foundation` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-core-graphics` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-core-image` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-core-location` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-core-text` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-encode` | 4.1.0 | MIT |  |
| `objc2-exception-helper` | 0.1.1 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-foundation` | 0.3.2 | MIT |  |
| `objc2-io-surface` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-quartz-core` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-ui-kit` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-user-notifications` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `objc2-web-kit` | 0.3.2 | Zlib OR Apache-2.0 OR MIT |  |
| `once_cell` | 1.21.4 | MIT OR Apache-2.0 | **yes** |
| `open` | 5.4.4 | MIT | **yes** |
| `option-ext` | 0.2.0 | MPL-2.0 | **yes** |
| `ordered-stream` | 0.2.0 | MIT OR Apache-2.0 |  |
| `os_info` | 3.15.0 | MIT | **yes** |
| `pango` | 0.18.3 | MIT |  |
| `pango-sys` | 0.18.0 | MIT |  |
| `parking` | 2.2.1 | Apache-2.0 OR MIT |  |
| `parking_lot` | 0.12.5 | MIT OR Apache-2.0 | **yes** |
| `parking_lot_core` | 0.9.12 | MIT OR Apache-2.0 | **yes** |
| `percent-encoding` | 2.3.2 | MIT OR Apache-2.0 | **yes** |
| `phf` | 0.13.1 | MIT | **yes** |
| `phf_codegen` | 0.13.1 | MIT |  |
| `phf_generator` | 0.13.1 | MIT |  |
| `phf_macros` | 0.13.1 | MIT |  |
| `phf_shared` | 0.13.1 | MIT | **yes** |
| `pin-project-lite` | 0.2.17 | Apache-2.0 OR MIT | **yes** |
| `piper` | 0.2.5 | MIT OR Apache-2.0 |  |
| `pkg-config` | 0.3.34 | MIT OR Apache-2.0 |  |
| `plist` | 1.10.1 | MIT | **yes** |
| `png` | 0.17.16 | MIT OR Apache-2.0 |  |
| `png` | 0.18.1 | MIT OR Apache-2.0 |  |
| `polling` | 3.11.0 | Apache-2.0 OR MIT |  |
| `portable-atomic` | 1.15.0 | Apache-2.0 OR MIT |  |
| `portable-atomic-util` | 0.2.8 | Apache-2.0 OR MIT |  |
| `potential_utf` | 0.1.6 | Unicode-3.0 | **yes** |
| `powerfmt` | 0.2.1 | MIT OR Apache-2.0 | **yes** |
| `precomputed-hash` | 0.1.1 | MIT | **yes** |
| `proc-macro-crate` | 1.3.1 | MIT OR Apache-2.0 |  |
| `proc-macro-crate` | 2.0.2 | MIT OR Apache-2.0 |  |
| `proc-macro-crate` | 3.5.0 | MIT OR Apache-2.0 |  |
| `proc-macro-error` | 1.0.4 | MIT OR Apache-2.0 |  |
| `proc-macro-error-attr` | 1.0.4 | MIT OR Apache-2.0 |  |
| `proc-macro2` | 1.0.107 | MIT OR Apache-2.0 | **yes** |
| `quick-xml` | 0.42.0 | MIT | **yes** |
| `quote` | 1.0.47 | MIT OR Apache-2.0 | **yes** |
| `r-efi` | 5.3.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |  |
| `r-efi` | 6.0.0 | MIT OR Apache-2.0 OR LGPL-2.1-or-later |  |
| `raw-window-handle` | 0.6.2 | MIT OR Apache-2.0 OR Zlib | **yes** |
| `redox_syscall` | 0.5.18 | MIT |  |
| `redox_users` | 0.5.3 | MIT |  |
| `ref-cast` | 1.0.27 | MIT OR Apache-2.0 |  |
| `ref-cast-impl` | 1.0.27 | MIT OR Apache-2.0 |  |
| `regex` | 1.13.1 | MIT OR Apache-2.0 | **yes** |
| `regex-automata` | 0.4.18 | MIT OR Apache-2.0 | **yes** |
| `regex-syntax` | 0.8.11 | MIT OR Apache-2.0 | **yes** |
| `reqwest` | 0.13.5 | MIT OR Apache-2.0 |  |
| `rfd` | 0.16.0 | MIT | **yes** |
| `rustc_version` | 0.4.1 | MIT OR Apache-2.0 |  |
| `rustc-hash` | 2.1.3 | Apache-2.0 OR MIT | **yes** |
| `rustix` | 1.1.5 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  |
| `rustversion` | 1.0.23 | MIT OR Apache-2.0 |  |
| `same-file` | 1.0.6 | Unlicense/MIT | **yes** |
| `schemars` | 0.8.22 | MIT | **yes** |
| `schemars` | 0.9.0 | MIT | **yes** |
| `schemars` | 1.2.3 | MIT | **yes** |
| `schemars_derive` | 0.8.22 | MIT |  |
| `scopeguard` | 1.2.0 | MIT OR Apache-2.0 | **yes** |
| `selectors` | 0.38.0 | MPL-2.0 | **yes** |
| `semver` | 1.0.28 | MIT OR Apache-2.0 | **yes** |
| `serde` | 1.0.229 | MIT OR Apache-2.0 | **yes** |
| `serde_core` | 1.0.229 | MIT OR Apache-2.0 | **yes** |
| `serde_derive` | 1.0.229 | MIT OR Apache-2.0 |  |
| `serde_derive_internals` | 0.29.1 | MIT OR Apache-2.0 |  |
| `serde_json` | 1.0.154 | MIT OR Apache-2.0 | **yes** |
| `serde_repr` | 0.1.21 | MIT OR Apache-2.0 |  |
| `serde_spanned` | 0.6.9 | MIT OR Apache-2.0 | **yes** |
| `serde_spanned` | 1.1.2 | MIT OR Apache-2.0 | **yes** |
| `serde_with` | 3.24.0 | MIT OR Apache-2.0 | **yes** |
| `serde_with_macros` | 3.24.0 | MIT OR Apache-2.0 |  |
| `serde-untagged` | 0.1.9 | MIT OR Apache-2.0 | **yes** |
| `serialize-to-javascript` | 0.1.2 | MIT OR Apache-2.0 | **yes** |
| `serialize-to-javascript-impl` | 0.1.2 | MIT OR Apache-2.0 |  |
| `servo_arc` | 0.4.3 | MIT OR Apache-2.0 | **yes** |
| `sha2` | 0.10.9 | MIT OR Apache-2.0 |  |
| `shlex` | 2.0.1 | MIT OR Apache-2.0 |  |
| `signal-hook-registry` | 1.4.8 | MIT OR Apache-2.0 |  |
| `simd-adler32` | 0.3.10 | MIT |  |
| `siphasher` | 1.0.4 | MIT OR Apache-2.0 | **yes** |
| `slab` | 0.4.12 | MIT |  |
| `smallvec` | 1.16.3 | MIT OR Apache-2.0 | **yes** |
| `socket2` | 0.6.5 | MIT OR Apache-2.0 | **yes** |
| `softbuffer` | 0.4.8 | MIT OR Apache-2.0 | **yes** |
| `soup3` | 0.5.0 | MIT |  |
| `soup3-sys` | 0.5.0 | MIT |  |
| `stable_deref_trait` | 1.2.1 | MIT OR Apache-2.0 | **yes** |
| `static_vcruntime` | 3.0.0 | MIT OR Apache-2.0 OR Zlib |  |
| `string_cache` | 0.9.0 | MIT OR Apache-2.0 | **yes** |
| `string_cache_codegen` | 0.6.1 | MIT OR Apache-2.0 |  |
| `strsim` | 0.11.1 | MIT |  |
| `swift-rs` | 1.0.9 | MIT OR Apache-2.0 |  |
| `syn` | 1.0.109 | MIT OR Apache-2.0 |  |
| `syn` | 2.0.119 | MIT OR Apache-2.0 |  |
| `syn` | 3.0.9 | MIT OR Apache-2.0 |  |
| `sync_wrapper` | 1.0.2 | Apache-2.0 |  |
| `synstructure` | 0.14.0 | MIT |  |
| `sys-locale` | 0.3.2 | MIT OR Apache-2.0 | **yes** |
| `system-deps` | 6.2.2 | MIT OR Apache-2.0 |  |
| `tao` | 0.37.1 | Apache-2.0 | **yes** |
| `tao-macros` | 0.1.4 | MIT OR Apache-2.0 |  |
| `target-lexicon` | 0.12.16 | Apache-2.0 WITH LLVM-exception |  |
| `tauri` | 2.12.4 | Apache-2.0 OR MIT | **yes** |
| `tauri-build` | 2.7.3 | Apache-2.0 OR MIT |  |
| `tauri-codegen` | 2.7.3 | Apache-2.0 OR MIT |  |
| `tauri-macros` | 2.7.3 | Apache-2.0 OR MIT |  |
| `tauri-plugin` | 2.7.2 | Apache-2.0 OR MIT |  |
| `tauri-plugin-dialog` | 2.8.3 | Apache-2.0 OR MIT | **yes** |
| `tauri-plugin-fs` | 2.7.1 | Apache-2.0 OR MIT | **yes** |
| `tauri-plugin-opener` | 2.7.2 | Apache-2.0 OR MIT | **yes** |
| `tauri-plugin-os` | 2.4.0 | Apache-2.0 OR MIT | **yes** |
| `tauri-plugin-persisted-scope` | 2.4.2 | Apache-2.0 OR MIT | **yes** |
| `tauri-plugin-process` | 2.4.0 | Apache-2.0 OR MIT | **yes** |
| `tauri-plugin-single-instance` | 2.5.4 | Apache-2.0 OR MIT | **yes** |
| `tauri-plugin-store` | 2.5.0 | Apache-2.0 OR MIT | **yes** |
| `tauri-plugin-wdio` | 1.5.0 | MIT OR Apache-2.0 |  |
| `tauri-plugin-window-state` | 2.5.0 | Apache-2.0 OR MIT | **yes** |
| `tauri-runtime` | 2.12.2 | Apache-2.0 OR MIT | **yes** |
| `tauri-runtime-wry` | 2.12.2 | Apache-2.0 OR MIT | **yes** |
| `tauri-utils` | 2.10.2 | Apache-2.0 OR MIT | **yes** |
| `tauri-winres` | 0.3.6 | MIT |  |
| `tempfile` | 3.27.0 | MIT OR Apache-2.0 |  |
| `tendril` | 0.5.1 | MIT OR Apache-2.0 | **yes** |
| `thiserror` | 1.0.69 | MIT OR Apache-2.0 | **yes** |
| `thiserror` | 2.0.21 | MIT OR Apache-2.0 | **yes** |
| `thiserror-impl` | 1.0.69 | MIT OR Apache-2.0 |  |
| `thiserror-impl` | 2.0.21 | MIT OR Apache-2.0 |  |
| `time` | 0.3.55 | MIT OR Apache-2.0 | **yes** |
| `time-core` | 0.1.9 | MIT OR Apache-2.0 | **yes** |
| `time-macros` | 0.2.32 | MIT OR Apache-2.0 |  |
| `tinystr` | 0.8.4 | Unicode-3.0 | **yes** |
| `tinyvec` | 1.13.3 | Zlib OR Apache-2.0 OR MIT |  |
| `tokio` | 1.53.3 | MIT | **yes** |
| `tokio-macros` | 2.7.2 | MIT |  |
| `tokio-util` | 0.7.20 | MIT |  |
| `toml` | 0.8.2 | MIT OR Apache-2.0 | **yes** |
| `toml` | 1.1.8+spec-1.1.0 | MIT OR Apache-2.0 | **yes** |
| `toml_datetime` | 0.6.3 | MIT OR Apache-2.0 | **yes** |
| `toml_datetime` | 1.1.2+spec-1.1.0 | MIT OR Apache-2.0 | **yes** |
| `toml_edit` | 0.19.15 | MIT OR Apache-2.0 |  |
| `toml_edit` | 0.20.2 | MIT OR Apache-2.0 |  |
| `toml_edit` | 0.25.17+spec-1.1.0 | MIT OR Apache-2.0 |  |
| `toml_parser` | 1.1.5+spec-1.1.0 | MIT OR Apache-2.0 | **yes** |
| `toml_writer` | 1.1.3+spec-1.1.0 | MIT OR Apache-2.0 | **yes** |
| `tower` | 0.5.3 | MIT |  |
| `tower-http` | 0.6.11 | MIT |  |
| `tower-layer` | 0.3.3 | MIT |  |
| `tower-service` | 0.3.3 | MIT |  |
| `tracing` | 0.1.44 | MIT | **yes** |
| `tracing-attributes` | 0.1.31 | MIT |  |
| `tracing-core` | 0.1.36 | MIT | **yes** |
| `tray-icon` | 0.25.1 | MIT OR Apache-2.0 |  |
| `try-lock` | 0.2.5 | MIT |  |
| `typeid` | 1.0.3 | MIT OR Apache-2.0 | **yes** |
| `typenum` | 1.20.1 | MIT OR Apache-2.0 |  |
| `uds_windows` | 1.2.1 | MIT |  |
| `unicode-ident` | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | **yes** |
| `unicode-segmentation` | 1.13.3 | MIT OR Apache-2.0 | **yes** |
| `url` | 2.5.8 | MIT OR Apache-2.0 | **yes** |
| `urlpattern` | 0.6.0 | MIT | **yes** |
| `utf8_iter` | 1.0.4 | Apache-2.0 OR MIT | **yes** |
| `uuid` | 1.28.0 | Apache-2.0 OR MIT | **yes** |
| `version_check` | 0.9.5 | MIT/Apache-2.0 |  |
| `version-compare` | 0.2.1 | MIT |  |
| `vswhom` | 0.1.0 | MIT |  |
| `vswhom-sys` | 0.1.3 | MIT |  |
| `walkdir` | 2.5.0 | Unlicense/MIT | **yes** |
| `want` | 0.3.2 | MIT |  |
| `wasi` | 0.11.1+wasi-snapshot-preview1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  |
| `wasip2` | 1.0.4+wasi-0.2.12 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  |
| `wasm-bindgen` | 0.2.129 | MIT OR Apache-2.0 |  |
| `wasm-bindgen-futures` | 0.4.79 | MIT OR Apache-2.0 |  |
| `wasm-bindgen-macro` | 0.2.129 | MIT OR Apache-2.0 |  |
| `wasm-bindgen-macro-support` | 0.2.129 | MIT OR Apache-2.0 |  |
| `wasm-bindgen-shared` | 0.2.129 | MIT OR Apache-2.0 |  |
| `wasm-streams` | 0.5.0 | MIT OR Apache-2.0 |  |
| `web_atoms` | 0.2.6 | MIT OR Apache-2.0 | **yes** |
| `web-sys` | 0.3.106 | MIT OR Apache-2.0 |  |
| `web-time` | 1.1.0 | MIT OR Apache-2.0 | **yes** |
| `webkit2gtk` | 2.0.2 | MIT |  |
| `webkit2gtk-sys` | 2.0.2 | MIT |  |
| `webview2-com` | 0.39.1 | MIT | **yes** |
| `webview2-com-macros` | 0.8.1 | MIT |  |
| `webview2-com-sys` | 0.39.1 | MIT | **yes** |
| `winapi` | 0.3.9 | MIT/Apache-2.0 |  |
| `winapi-i686-pc-windows-gnu` | 0.4.0 | MIT/Apache-2.0 |  |
| `winapi-util` | 0.1.11 | Unlicense OR MIT | **yes** |
| `winapi-x86_64-pc-windows-gnu` | 0.4.0 | MIT/Apache-2.0 |  |
| `window-vibrancy` | 0.8.1 | Apache-2.0 OR MIT | **yes** |
| `windows` | 0.62.2 | MIT OR Apache-2.0 | **yes** |
| `windows_aarch64_gnullvm` | 0.42.2 | MIT OR Apache-2.0 |  |
| `windows_aarch64_gnullvm` | 0.53.1 | MIT OR Apache-2.0 |  |
| `windows_aarch64_msvc` | 0.42.2 | MIT OR Apache-2.0 |  |
| `windows_aarch64_msvc` | 0.53.1 | MIT OR Apache-2.0 |  |
| `windows_i686_gnu` | 0.42.2 | MIT OR Apache-2.0 |  |
| `windows_i686_gnu` | 0.53.1 | MIT OR Apache-2.0 |  |
| `windows_i686_gnullvm` | 0.53.1 | MIT OR Apache-2.0 |  |
| `windows_i686_msvc` | 0.42.2 | MIT OR Apache-2.0 |  |
| `windows_i686_msvc` | 0.53.1 | MIT OR Apache-2.0 |  |
| `windows_x86_64_gnu` | 0.42.2 | MIT OR Apache-2.0 |  |
| `windows_x86_64_gnu` | 0.53.1 | MIT OR Apache-2.0 |  |
| `windows_x86_64_gnullvm` | 0.42.2 | MIT OR Apache-2.0 |  |
| `windows_x86_64_gnullvm` | 0.53.1 | MIT OR Apache-2.0 |  |
| `windows_x86_64_msvc` | 0.42.2 | MIT OR Apache-2.0 |  |
| `windows_x86_64_msvc` | 0.53.1 | MIT OR Apache-2.0 |  |
| `windows-collections` | 0.3.2 | MIT OR Apache-2.0 |  |
| `windows-core` | 0.62.2 | MIT OR Apache-2.0 | **yes** |
| `windows-future` | 0.3.2 | MIT OR Apache-2.0 |  |
| `windows-implement` | 0.60.2 | MIT OR Apache-2.0 |  |
| `windows-interface` | 0.59.3 | MIT OR Apache-2.0 |  |
| `windows-link` | 0.2.1 | MIT OR Apache-2.0 | **yes** |
| `windows-numerics` | 0.3.1 | MIT OR Apache-2.0 |  |
| `windows-result` | 0.4.1 | MIT OR Apache-2.0 | **yes** |
| `windows-strings` | 0.5.1 | MIT OR Apache-2.0 | **yes** |
| `windows-sys` | 0.45.0 | MIT OR Apache-2.0 | **yes** |
| `windows-sys` | 0.60.2 | MIT OR Apache-2.0 | **yes** |
| `windows-sys` | 0.61.2 | MIT OR Apache-2.0 | **yes** |
| `windows-targets` | 0.42.2 | MIT OR Apache-2.0 | **yes** |
| `windows-targets` | 0.53.5 | MIT OR Apache-2.0 | **yes** |
| `windows-threading` | 0.2.1 | MIT OR Apache-2.0 |  |
| `windows-version` | 0.1.7 | MIT OR Apache-2.0 | **yes** |
| `winnow` | 0.5.40 | MIT | **yes** |
| `winnow` | 1.0.4 | MIT | **yes** |
| `winreg` | 0.56.0 | MIT |  |
| `wit-bindgen` | 0.57.1 | Apache-2.0 WITH LLVM-exception OR Apache-2.0 OR MIT |  |
| `writeable` | 0.6.4 | Unicode-3.0 | **yes** |
| `wry` | 0.57.0 | Apache-2.0 OR MIT | **yes** |
| `x11` | 2.21.0 | MIT |  |
| `x11-dl` | 2.21.0 | MIT |  |
| `yoke` | 0.8.3 | Unicode-3.0 | **yes** |
| `yoke-derive` | 0.8.4 | Unicode-3.0 |  |
| `zbus` | 5.19.0 | MIT |  |
| `zbus_macros` | 5.19.0 | MIT |  |
| `zbus_names` | 4.3.4 | MIT |  |
| `zcheapstr` | 1.1.0 | MIT |  |
| `zerofrom` | 0.1.8 | Unicode-3.0 | **yes** |
| `zerofrom-derive` | 0.1.8 | Unicode-3.0 |  |
| `zerotrie` | 0.2.5 | Unicode-3.0 | **yes** |
| `zerovec` | 0.11.8 | Unicode-3.0 | **yes** |
| `zerovec-derive` | 0.11.6 | Unicode-3.0 |  |
| `zlib-rs` | 0.6.8 | Zlib |  |
| `zmij` | 1.0.23 | MIT | **yes** |
| `zvariant` | 5.15.0 | MIT |  |
| `zvariant_derive` | 5.15.0 | MIT |  |
| `zvariant_utils` | 4.2.0 | MIT |  |
| `openmark` | 0.1.0 | MIT (this project, path dependency) | **yes** |

</details>

---

# Appendix C — Development-only JavaScript (378 packages, not redistributed)

<details>
<summary>378 packages — click to expand</summary>

| Package | Version | Licence |
|---|---|---|
| `@asamuzakjp/css-color` | 7.1.5 | MIT |
| `@asamuzakjp/dom-selector` | 10.0.3 | MIT |
| `@babel/code-frame` | 7.29.7 | MIT |
| `@babel/parser` | 7.29.9 | MIT |
| `@babel/types` | 7.29.8 | MIT |
| `@bramus/specificity` | 2.4.3 | MIT |
| `@cacheable/memory` | 2.2.0 | MIT |
| `@cacheable/utils` | 2.5.0 | MIT |
| `@csstools/css-calc` | 3.4.3 | MIT |
| `@csstools/css-color-parser` | 4.2.6 | MIT |
| `@csstools/css-parser-algorithms` | 4.0.2 | MIT |
| `@csstools/css-syntax-patches-for-csstree` | 1.1.15 | MIT-0 |
| `@esbuild/aix-ppc64` | 0.28.2 | MIT |
| `@esbuild/android-arm64` | 0.28.2 | MIT |
| `@esbuild/android-arm` | 0.28.2 | MIT |
| `@esbuild/android-x64` | 0.28.2 | MIT |
| `@esbuild/darwin-arm64` | 0.28.2 | MIT |
| `@esbuild/darwin-x64` | 0.28.2 | MIT |
| `@esbuild/freebsd-arm64` | 0.28.2 | MIT |
| `@esbuild/freebsd-x64` | 0.28.2 | MIT |
| `@esbuild/linux-arm64` | 0.28.2 | MIT |
| `@esbuild/linux-arm` | 0.28.2 | MIT |
| `@esbuild/linux-ia32` | 0.28.2 | MIT |
| `@esbuild/linux-loong64` | 0.28.2 | MIT |
| `@esbuild/linux-mips64el` | 0.28.2 | MIT |
| `@esbuild/linux-ppc64` | 0.28.2 | MIT |
| `@esbuild/linux-riscv64` | 0.28.2 | MIT |
| `@esbuild/linux-s390x` | 0.28.2 | MIT |
| `@esbuild/linux-x64` | 0.28.2 | MIT |
| `@esbuild/netbsd-arm64` | 0.28.2 | MIT |
| `@esbuild/netbsd-x64` | 0.28.2 | MIT |
| `@esbuild/openbsd-arm64` | 0.28.2 | MIT |
| `@esbuild/openbsd-x64` | 0.28.2 | MIT |
| `@esbuild/openharmony-arm64` | 0.28.2 | MIT |
| `@esbuild/sunos-x64` | 0.28.2 | MIT |
| `@esbuild/win32-arm64` | 0.28.2 | MIT |
| `@esbuild/win32-ia32` | 0.28.2 | MIT |
| `@esbuild/win32-x64` | 0.28.2 | MIT |
| `@eslint-community/eslint-utils` | 4.10.1 | MIT |
| `@eslint/config-array` | 0.23.5 | Apache-2.0 |
| `@eslint/config-helpers` | 0.7.0 | Apache-2.0 |
| `@eslint/core` | 1.2.1 | Apache-2.0 |
| `@eslint/plugin-kit` | 0.7.3 | Apache-2.0 |
| `@humanfs/core` | 0.19.2 | Apache-2.0 |
| `@humanfs/node` | 0.16.8 | Apache-2.0 |
| `@inquirer/checkbox` | 4.3.2 | MIT |
| `@inquirer/confirm` | 5.1.21 | MIT |
| `@inquirer/core` | 10.3.2 | MIT |
| `@inquirer/editor` | 4.2.23 | MIT |
| `@inquirer/expand` | 4.0.23 | MIT |
| `@inquirer/external-editor` | 1.0.3 | MIT |
| `@inquirer/input` | 4.3.1 | MIT |
| `@inquirer/number` | 3.0.23 | MIT |
| `@inquirer/password` | 4.0.23 | MIT |
| `@inquirer/prompts` | 7.10.1 | MIT |
| `@inquirer/rawlist` | 4.1.11 | MIT |
| `@inquirer/search` | 3.2.2 | MIT |
| `@inquirer/select` | 4.4.2 | MIT |
| `@inquirer/type` | 3.0.10 | MIT |
| `@isaacs/cliui` | 8.0.2 | ISC |
| `@jest/expect-utils` | 30.5.2 | MIT |
| `@jest/pattern` | 30.5.0 | MIT |
| `@jest/schemas` | 30.5.0 | MIT |
| `@jest/types` | 30.5.1 | MIT |
| `@jridgewell/trace-mapping` | 0.3.31 | MIT |
| `@keyv/bigmap` | 1.3.1 | MIT |
| `@pkgjs/parseargs` | 0.11.0 | MIT |
| `@playwright/test` | 1.64.1 | Apache-2.0 |
| `@promptbook/utils` | 0.69.5 | CC-BY-4.0 |
| `@puppeteer/browsers` | 2.13.2 | Apache-2.0 |
| `@rolldown/binding-android-arm-eabi` | 1.2.14 | MIT |
| `@rolldown/binding-android-arm64` | 1.2.14 | MIT |
| `@rolldown/binding-darwin-arm64` | 1.2.14 | MIT |
| `@rolldown/binding-darwin-x64` | 1.2.14 | MIT |
| `@rolldown/binding-freebsd-x64` | 1.2.14 | MIT |
| `@rolldown/binding-linux-arm-gnueabihf` | 1.2.14 | MIT |
| `@rolldown/binding-linux-arm64-gnu` | 1.2.14 | MIT |
| `@rolldown/binding-linux-arm64-musl` | 1.2.14 | MIT |
| `@rolldown/binding-linux-ppc64-gnu` | 1.2.14 | MIT |
| `@rolldown/binding-linux-s390x-gnu` | 1.2.14 | MIT |
| `@rolldown/binding-linux-x64-gnu` | 1.2.14 | MIT |
| `@rolldown/binding-linux-x64-musl` | 1.2.14 | MIT |
| `@rolldown/binding-openharmony-arm64` | 1.2.14 | MIT |
| `@rolldown/binding-win32-arm64-msvc` | 1.2.14 | MIT |
| `@rolldown/binding-win32-x64-msvc` | 1.2.14 | MIT |
| `@tauri-apps/cli-darwin-arm64` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-darwin-x64` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-linux-arm-gnueabihf` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-linux-arm64-gnu` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-linux-arm64-musl` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-linux-riscv64-gnu` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-linux-x64-gnu` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-linux-x64-musl` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-win32-arm64-msvc` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-win32-ia32-msvc` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli-win32-x64-msvc` | 2.12.3 | Apache-2.0 OR MIT |
| `@tauri-apps/cli` | 2.12.3 | Apache-2.0 OR MIT |
| `@types/chai` | 5.2.3 | MIT |
| `@types/istanbul-lib-report` | 3.0.3 | MIT |
| `@types/istanbul-reports` | 3.0.4 | MIT |
| `@types/markdown-it` | 14.2.0 | MIT |
| `@types/node` | 20.19.43 | MIT |
| `@types/node` | 26.6.5 | MIT |
| `@types/react-dom` | 19.3.0 | MIT |
| `@types/react` | 19.3.0 | MIT |
| `@types/ws` | 8.18.2 | MIT |
| `@types/yargs` | 17.0.35 | MIT |
| `@types/yauzl` | 2.10.3 | MIT |
| `@typescript/typescript-aix-ppc64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-darwin-arm64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-darwin-x64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-freebsd-arm64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-freebsd-x64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-linux-arm64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-linux-arm` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-linux-loong64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-linux-mips64el` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-linux-ppc64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-linux-riscv64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-linux-s390x` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-linux-x64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-netbsd-arm64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-netbsd-x64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-openbsd-arm64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-openbsd-x64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-sunos-x64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-win32-arm64` | 7.0.2 | Apache-2.0 |
| `@typescript/typescript-win32-x64` | 7.0.2 | Apache-2.0 |
| `@vitejs/plugin-react` | 6.1.2 | MIT |
| `@vitest/coverage-v8` | 5.0.5 | MIT |
| `@vitest/istanbul-lib-report` | 1.0.2 | MIT |
| `@vitest/mocker` | 5.0.5 | MIT |
| `@vitest/pretty-format` | 3.2.7 | MIT |
| `@vitest/pretty-format` | 4.1.11 | MIT |
| `@vitest/snapshot` | 3.2.7 | MIT |
| `@vitest/snapshot` | 4.1.11 | MIT |
| `@vitest/utils` | 4.1.11 | MIT |
| `@wdio/cli` | 9.32.0 | MIT |
| `@wdio/config` | 9.32.0 | MIT |
| `@wdio/dot-reporter` | 9.32.0 | MIT |
| `@wdio/globals` | 9.31.3 | MIT |
| `@wdio/local-runner` | 9.32.0 | MIT |
| `@wdio/logger` | 9.29.1 | MIT |
| `@wdio/mocha-framework` | 9.32.0 | MIT |
| `@wdio/native-core` | 1.3.0 | MIT |
| `@wdio/native-utils` | 2.8.0 | MIT |
| `@wdio/repl` | 9.16.2 | MIT |
| `@wdio/reporter` | 9.31.2 | MIT |
| `@wdio/reporter` | 9.32.0 | MIT |
| `@wdio/runner` | 9.32.0 | MIT |
| `@wdio/spec-reporter` | 9.31.2 | MIT |
| `@wdio/spec-reporter` | 9.32.0 | MIT |
| `@wdio/tauri-service` | 1.5.0 | MIT |
| `@wdio/types` | 9.31.2 | MIT |
| `@wdio/types` | 9.32.0 | MIT |
| `@wdio/utils` | 9.32.0 | MIT |
| `@wdio/xvfb` | 9.32.0 | MIT |
| `abort-controller` | 3.0.0 | MIT |
| `acorn-jsx` | 5.3.2 | MIT |
| `ajv` | 6.15.0 | MIT |
| `ansi-styles` | 4.3.0 | MIT |
| `anymatch` | 3.1.3 | ISC |
| `archiver` | 8.0.0 | MIT |
| `ast-types` | 0.13.4 | MIT |
| `ast-v8-to-istanbul` | 1.0.7 | MIT |
| `bare-fs` | 4.8.4 | Apache-2.0 |
| `bare-stream` | 2.13.4 | Apache-2.0 |
| `bare-url` | 2.5.5 | Apache-2.0 |
| `bidi-js` | 1.1.0 | MIT |
| `brace-expansion` | 1.1.21 | MIT |
| `brace-expansion` | 2.1.7 | MIT |
| `brace-expansion` | 5.0.12 | MIT |
| `braces` | 3.0.3 | MIT |
| `buffer` | 6.0.3 | MIT |
| `cacheable` | 2.5.0 | MIT |
| `chalk` | 4.1.2 | MIT |
| `cheerio-select` | 2.1.0 | BSD-2-Clause |
| `cheerio` | 1.2.0 | MIT |
| `chokidar` | 3.6.0 | MIT |
| `chokidar` | 4.0.3 | MIT |
| `cliui` | 7.0.4 | ISC |
| `cliui` | 8.0.1 | ISC |
| `clone` | 1.0.4 | MIT |
| `color-convert` | 2.0.1 | MIT |
| `compress-commons` | 7.0.1 | MIT |
| `cose-base` | 1.0.3 | MIT |
| `cose-base` | 2.2.0 | MIT |
| `crc32-stream` | 7.0.1 | MIT |
| `create-wdio` | 9.32.0 | MIT |
| `cross-spawn` | 7.0.6 | MIT |
| `css-select` | 5.2.2 | BSD-2-Clause |
| `css-tree` | 3.2.1 | MIT |
| `data-urls` | 8.0.0 | MIT |
| `debug` | 4.4.3 | MIT |
| `defaults` | 1.0.4 | MIT |
| `degenerator` | 5.0.1 | MIT |
| `dom-serializer` | 2.0.0 | MIT |
| `domhandler` | 5.0.3 | BSD-2-Clause |
| `domutils` | 3.2.2 | BSD-2-Clause |
| `easy-table` | 1.2.0 | MIT |
| `edge-paths` | 3.0.5 | MIT |
| `edgedriver` | 6.3.1 | MIT |
| `ejs` | 3.1.10 | Apache-2.0 |
| `encoding-sniffer` | 0.2.1 | MIT |
| `end-of-stream` | 1.4.5 | MIT |
| `error-ex` | 1.3.4 | MIT |
| `esbuild` | 0.28.2 | MIT |
| `escodegen` | 2.1.0 | BSD-2-Clause |
| `eslint-scope` | 9.1.2 | BSD-2-Clause |
| `eslint` | 10.12.0 | MIT |
| `espree` | 11.2.0 | BSD-2-Clause |
| `esquery` | 1.7.0 | BSD-3-Clause |
| `esrecurse` | 4.3.0 | BSD-2-Clause |
| `estree-walker` | 3.0.3 | MIT |
| `events-universal` | 1.0.1 | Apache-2.0 |
| `execa` | 9.6.1 | MIT |
| `expect-webdriverio` | 6.1.0 | MIT |
| `expect` | 30.5.2 | MIT |
| `extract-zip` | 2.0.1 | BSD-2-Clause |
| `fast-check` | 4.10.2 | MIT |
| `fd-slicer` | 1.1.0 | MIT |
| `fdir` | 6.5.0 | MIT |
| `figures` | 6.1.0 | MIT |
| `file-entry-cache` | 11.1.5 | MIT |
| `filelist` | 1.0.6 | Apache-2.0 |
| `fill-range` | 7.1.1 | MIT |
| `find-up` | 5.0.0 | MIT |
| `find-up` | 6.3.0 | MIT |
| `flat-cache` | 6.1.23 | MIT |
| `foreground-child` | 3.3.1 | ISC |
| `fsevents` | 2.3.3 | MIT |
| `geckodriver` | 6.1.1 | MIT |
| `get-stream` | 5.2.0 | MIT |
| `get-stream` | 9.0.1 | MIT |
| `get-uri` | 6.0.5 | MIT |
| `glob-parent` | 5.1.2 | ISC |
| `glob-parent` | 6.0.2 | ISC |
| `glob` | 10.5.0 | ISC |
| `glob` | 8.1.0 | ISC |
| `hashery` | 1.5.1 | MIT |
| `hosted-git-info` | 7.0.2 | ISC |
| `hosted-git-info` | 8.1.0 | ISC |
| `html-encoding-sniffer` | 7.0.0 | MIT |
| `htmlparser2` | 10.1.0 | MIT |
| `http-proxy-agent` | 7.0.2 | MIT |
| `https-proxy-agent` | 7.0.6 | MIT |
| `iconv-lite` | 0.7.3 | MIT |
| `inflight` | 1.0.6 | ISC |
| `inquirer` | 12.11.1 | MIT |
| `is-binary-path` | 2.1.0 | MIT |
| `is-glob` | 4.0.3 | MIT |
| `jackspeak` | 3.4.3 | BlueOak-1.0.0 |
| `jake` | 10.9.4 | Apache-2.0 |
| `jest-diff` | 30.5.2 | MIT |
| `jest-matcher-utils` | 30.5.2 | MIT |
| `jest-message-util` | 30.5.1 | MIT |
| `jest-mock` | 30.5.2 | MIT |
| `jest-util` | 30.5.1 | MIT |
| `js-yaml` | 4.3.2 | MIT |
| `jsdom` | 30.1.3 | MIT |
| `jszip` | 3.10.2 | (MIT OR GPL-3.0-or-later) |
| `keyv` | 5.6.0 | MIT |
| `lazystream` | 1.0.1 | MIT |
| `levn` | 0.4.1 | MIT |
| `lie` | 3.3.0 | MIT |
| `lightningcss-android-arm64` | 1.33.0 | MPL-2.0 |
| `lightningcss-darwin-arm64` | 1.33.0 | MPL-2.0 |
| `lightningcss-darwin-x64` | 1.33.0 | MPL-2.0 |
| `lightningcss-freebsd-x64` | 1.33.0 | MPL-2.0 |
| `lightningcss-linux-arm-gnueabihf` | 1.33.0 | MPL-2.0 |
| `lightningcss-linux-arm64-gnu` | 1.33.0 | MPL-2.0 |
| `lightningcss-linux-arm64-musl` | 1.33.0 | MPL-2.0 |
| `lightningcss-linux-x64-gnu` | 1.33.0 | MPL-2.0 |
| `lightningcss-linux-x64-musl` | 1.33.0 | MPL-2.0 |
| `lightningcss-win32-arm64-msvc` | 1.33.0 | MPL-2.0 |
| `lightningcss-win32-x64-msvc` | 1.33.0 | MPL-2.0 |
| `lightningcss` | 1.33.0 | MPL-2.0 |
| `locate-app` | 2.5.0 | Apache-2.0 |
| `locate-path` | 6.0.0 | MIT |
| `locate-path` | 7.2.0 | MIT |
| `log-symbols` | 4.1.0 | MIT |
| `magic-string` | 0.30.21 | MIT |
| `magic-string` | 1.4.3 | MIT |
| `magicast` | 0.5.5 | MIT |
| `minimatch` | 10.2.6 | BlueOak-1.0.0 |
| `minimatch` | 3.1.5 | ISC |
| `minimatch` | 5.1.9 | ISC |
| `minimatch` | 9.0.9 | ISC |
| `mocha` | 10.8.2 | MIT |
| `normalize-package-data` | 6.0.2 | BSD-2-Clause |
| `normalize-package-data` | 7.0.1 | BSD-2-Clause |
| `npm-run-path` | 6.0.0 | MIT |
| `nth-check` | 2.1.1 | BSD-2-Clause |
| `once` | 1.4.0 | ISC |
| `optionator` | 0.9.4 | MIT |
| `p-limit` | 3.1.0 | MIT |
| `p-limit` | 4.0.0 | MIT |
| `p-locate` | 5.0.0 | MIT |
| `p-locate` | 6.0.0 | MIT |
| `pac-proxy-agent` | 7.2.0 | MIT |
| `pac-resolver` | 7.0.1 | MIT |
| `parse-json` | 7.1.1 | MIT |
| `parse5-htmlparser2-tree-adapter` | 7.1.0 | MIT |
| `parse5-parser-stream` | 7.1.2 | MIT |
| `parse5` | 7.3.0 | MIT |
| `parse5` | 8.0.1 | MIT |
| `path-scurry` | 1.11.1 | BlueOak-1.0.0 |
| `playwright` | 1.64.1 | Apache-2.0 |
| `postcss` | 8.5.30 | MIT |
| `pretty-format` | 30.5.1 | MIT |
| `pretty-ms` | 9.3.1 | MIT |
| `proxy-agent` | 6.5.0 | MIT |
| `pump` | 3.0.4 | MIT |
| `qified` | 0.10.1 | MIT |
| `randombytes` | 2.1.0 | MIT |
| `read-pkg-up` | 10.1.0 | MIT |
| `read-pkg` | 8.1.0 | MIT |
| `readable-stream` | 2.3.8 | MIT |
| `readable-stream` | 4.8.0 | MIT |
| `readdir-glob` | 3.0.0 | Apache-2.0 |
| `readdirp` | 3.6.0 | MIT |
| `recursive-readdir` | 2.2.3 | MIT |
| `resq` | 1.11.0 | MIT |
| `rolldown` | 1.2.14 | MIT |
| `rxjs` | 7.8.2 | Apache-2.0 |
| `safe-regex2` | 5.1.2 | MIT |
| `saxes` | 6.0.0 | ISC |
| `serialize-error` | 12.0.0 | MIT |
| `serialize-javascript` | 6.0.2 | BSD-3-Clause |
| `shebang-command` | 2.0.0 | MIT |
| `socks-proxy-agent` | 8.0.5 | MIT |
| `socks` | 2.8.10 | MIT |
| `source-map` | 0.6.1 | BSD-3-Clause |
| `spdx-correct` | 3.2.0 | Apache-2.0 |
| `spdx-expression-parse` | 3.0.1 | MIT |
| `stack-utils` | 2.0.6 | MIT |
| `streamx` | 2.28.1 | MIT |
| `string-width` | 4.2.3 | MIT |
| `string-width` | 5.1.2 | MIT |
| `string_decoder` | 1.1.1 | MIT |
| `string_decoder` | 1.3.0 | MIT |
| `strip-ansi` | 6.0.1 | MIT |
| `strip-ansi` | 7.2.0 | MIT |
| `supports-color` | 7.2.0 | MIT |
| `supports-color` | 8.1.1 | MIT |
| `tar-fs` | 3.1.3 | MIT |
| `tar-stream` | 3.2.2 | MIT |
| `teex` | 1.0.1 | MIT |
| `text-decoder` | 1.2.7 | Apache-2.0 |
| `tinyglobby` | 0.2.17 | MIT |
| `tldts` | 7.4.18 | MIT |
| `to-regex-range` | 5.0.1 | MIT |
| `tough-cookie` | 6.0.2 | BSD-3-Clause |
| `tr46` | 7.0.0 | MIT |
| `tsx` | 4.23.15 | MIT |
| `type-check` | 0.4.0 | MIT |
| `typescript` | 7.0.2 | Apache-2.0 |
| `uri-js` | 4.4.1 | BSD-2-Clause |
| `validate-npm-package-license` | 3.0.4 | Apache-2.0 |
| `vite` | 8.3.4 | MIT |
| `vitest` | 5.0.5 | MIT |
| `w3c-xmlserializer` | 6.0.0 | MIT |
| `wait-port` | 1.1.0 | MIT |
| `wcwidth` | 1.0.1 | MIT |
| `webdriver` | 9.32.0 | MIT |
| `webdriverio` | 9.32.0 | MIT |
| `whatwg-encoding` | 3.1.1 | MIT |
| `whatwg-url` | 17.3.0 | MIT |
| `which` | 2.0.2 | ISC |
| `which` | 6.0.1 | ISC |
| `wrap-ansi` | 6.2.0 | MIT |
| `wrap-ansi` | 7.0.0 | MIT |
| `wrap-ansi` | 8.1.0 | MIT |
| `yargs-unparser` | 2.0.0 | MIT |
| `yargs` | 16.2.2 | MIT |
| `yargs` | 17.7.3 | MIT |
| `yauzl` | 2.10.0 | MIT |
| `zip-stream` | 7.0.5 | MIT |

</details>

