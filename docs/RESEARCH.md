# OpenMark — Phase 0 Research

Snapshot date: **2026-10-15**. Host: Windows 11 x64, Node v24.16.0, WebView2 Runtime **149.0.4022.62**,
workspace `D:/OMP WorkSpace/REA typora` (contains a space; see §9.6).

This document records *what was investigated*, the *measured evidence*, and the *decisions taken with their
reasons*. Every non-obvious claim cites a research note or a source file. Anything not verified first-hand is
marked `[UNVERIFIED]`.

---

## 0. Research notes consumed

Read from `local://` (inventory taken with a directory listing *before* reading):

| Note | Status | Used for |
|---|---|---|
| `local://research-typora-benchmark.md` | present | §8 Typora inventory, feature/limitation benchmark, differentiation set |
| `local://research-tauri-windows-e2e.md` | present | §9 Tauri bundling, portable, PDF, WebdriverIO, signing, build gotchas |
| `local://research-render-export.md` | present | §2 parser measurements, §3/§5 library selection, §6 sanitisation |
| `local://research-milkdown.md` | present | §7 Milkdown round-trip measurements, Crepe corruption list, Vditor comparison |
| `local://research-vditor.md` | present (published during this task) | §7 Vditor measurements: CDN path, Lute model, round-trip loss matrix, MathJax-4 swap, Lute licence |
| `local://research-math*.md` | **MISSING** | — (MathJax facts were instead taken from the vendored package, `src/core/math/mathjax.ts`, and `local://research-render-export.md` §4; a dedicated MathStack note was still being written when this document was produced) |

Supplementary in-repo evidence: `public/mathjax/v4/**` and `public/mathjax-fonts/**` (the vendored MathJax
tree and its font data), `src/core/**`, `src/app/**`, `src-tauri/**`, and the test suites under `tests/`.
The Vditor/Lute probe scripts that produced §7's loss matrix were a throwaway scratch directory and have
been removed; their findings are recorded in the table above and in §7 itself.

**Reading order note:** the `local://` listing initially returned four notes; `research-vditor.md` appeared
later, in the same session, and early drafts of §7 were written from `research-milkdown.md`'s Vditor comparison
alone. Both sources are now reconciled below.

---

## 1. Environment baseline (measured)

| Item | Value | Evidence |
|---|---|---|
| OS / arch | Windows 11 x64 | host |
| Node | v24.16.0 | research-render-export header |
| pnpm | present, workspace installed (229 KB `pnpm-lock.yaml`) | `pnpm-lock.yaml`, `pnpm-workspace.yaml` |
| WebView2 Runtime | 149.0.4022.62 present at `HKLM\...\EdgeUpdate\Clients\{F3017226-…}\pv` | research-tauri-windows-e2e "Local environment realities" |
| MSVC / SDK | MSVC 14.44 + Windows SDK 10.0.26100 | research-tauri-windows-e2e §Q9; `scripts/env.sh` probes `2022/BuildTools` + `Windows Kits/10` |
| Rust | **not installed at research time**; installed project-locally during Phase 0 at `C:/omkth/{cargo,rustup}` and `.tools/{cargo,rustup,target}` (gitignored) | research-tauri-windows-e2e §Verdict; `scripts/env.sh`, `.tools/run-tauri.mjs` (both present, pointing at a project-local toolchain) |
| Network | `static.rust-lang.org` ≈ 5.4 KB/s; `rsproxy.cn` ≈ 7.9 MB/s | research-tauri-windows-e2e §Open questions; `scripts/env.sh` sets `RUSTUP_DIST_SERVER=https://rsproxy.cn` |
| Installer tooling download | NSIS 3.13 + WiX 3.14.1 fetched from `github.com` on first bundle | research-tauri-windows-e2e §Q2 |

**Consequence.** The whole toolchain must stay project-local and mirror-backed: no global `PATH`, `~/.cargo`,
`~/.rustup` (`scripts/env.sh` header), and `TAURI_BUNDLER_TOOLS_GITHUB_MIRROR` exists as the escape hatch for
the bundler downloads.

---

## 2. Markdown parser: markdown-it 15.0.2 (DECIDED)

### 2.1 Measured evidence

Spec compliance (`commonmark/commonmark-spec@0.31.2/spec.txt`, 652 examples, harness described in
research-render-export §1) — all **measured locally**:

```
markdown-it 15.0.2 (commonmark preset): 652/652
marked 18.1.1 (default):                498/652
micromark 4.0.3 (allowDangerousHtml+Protocol:true): 652/652
micromark 4.0.3 (defaults):             576/652
```

Throughput on a 1.07 M-character document (median of 3):

| parser | median | Mi chars/s |
|---|---|---|
| markdown-it `md.render` | 50 ms | **20.3** |
| marked `marked.parse` | 52 ms | 19.5 |
| micromark → HTML | 572 ms | 1.8 |
| unified+remark-parse → mdast | 735 ms | 1.4 |
| remark-stringify (mdast → md) | 147 ms | 7.0 |

The whole-AST route (micromark/remark) is **11–15× slower** — disqualifying for a Typora-class app that
re-renders while the user types, unless the AST pass is moved to a worker or restricted to save-time.

Source positions (`Token.map`, read from markdown-it's own `src/token.ts` and measured):

```
heading_open  map=[0,1]   inline map=[0,1]  (children all map===null)
paragraph_open map=[2,3]
bullet_list_open map=[4,6]  list_item_close map=null
```

Block-level **line ranges only**, 0-based, `null` on `*_close`, and **no column/character offsets anywhere**.
That is sufficient for *file:line* diagnostics on block problems (the product requirement) but an inline
problem reports its enclosing paragraph's first line. `src/core/markdown/line-index.ts` (+ `SourceLocator`)
exists precisely to recover exact inline ranges by forward-only re-location.

### 2.2 Round-trip damage (decisive for the architecture)

Parse→serialize is **lossy** and must never be used to write the file
(research-render-export §1.4, measured with `remark-stringify`):

| input | serialized | lossless |
|---|---|---|
| `Title\n=====\n\ntext\n` | `# Title\n\ntext\n` | no (setext→ATX) |
| `*   one\n+   two\n` | `* one\n\n- two\n` | no (markers + spacing) |
| ` ```js   {linenos=true} ` | ` ```js {linenos=true} ` | no (info string) |
| `text\n\n    indented code\n` | fenced block | no (indent→fence) |
| `line one  \nline two\n` | `line one\\\nline two\n` | no (hard-break form) |
| `---\ntitle: x\n---\n\nbody\n` | `***\n\n## title: x\n\nbody\n` | **no — frontmatter destroyed** |
| `a\r\n\r\nb\r\n` | `a\n\nb\n` | no (EOL normalised) |
| `a` (no trailing newline) | `a\n` | no |
| `# 标题 一\n\n正文。\n` | identical | yes (CJK text safe) |
| `<div class="x">…`, `<!-- c -->` | identical | yes |

markdown-it has **no serializer at all**, which is exactly why it fits the constraint: you *cannot* accidentally
round-trip through it.

### 2.3 Default-preset gaps found by measurement

`new MarkdownIt()` alone: GFM tables ON, strikethrough ON; task lists OFF, `==x==` OFF, `~x~`/`^x^` OFF,
`linkify:false`, and **frontmatter is actively destroyed** (`---\na: 1\n---\n\nbody` → `<hr>` + `<h2>a: 1</h2>`
+ `<p>body</p>`).

### 2.4 Decision D2 — parser

**markdown-it 15.0.2** (pin exactly; 15.0.1 fixed `GHSA-253c-mchw-3w2r`, a quadratic-complexity DoS in
`linkify:true`, 15.0.2 fixed a second quadratic path in smartquotes). Reasons: 652/652 CommonMark, ~20 Mi chars/s,
MIT, bundled TypeScript declarations since 15.0.0, and a plugin ecosystem for every extension the product needs
(footnotes, definition lists, task lists, `==`, `~x~`, `^x^`). Implemented as `src/core/markdown/engine.ts`:
`taskLists` (disabled checkboxes for reading), `footnote`, `deflist`, `sub`, `sup`, `mark`, a **custom**
frontmatter rule (`src/core/markdown/rules.ts`) and a **custom** math rule (`src/core/markdown/math-plugin.ts`).
`typographer:false`; no `highlight` option (highlighting is deferred to the lazy code placeholder).

Chosen over remark/micromark for speed; over marked because marked carries **no position information at all**
(measured: zero tokens expose `map`/`position`), which rules it out for the diagnostics feature.

---

## 3. Math: MathJax 4.1.3 (DECIDED) — including the Node-on-Windows defect

### 3.1 The defect: MathJax 4 cannot initialise under Node on Windows

`src/core/math/mathjax.ts` (module header, authoritative statement):

> MathJax 4's Node component loader builds bare Windows paths (`D:/…`) and hands them to `import()`, which
> requires a `file://` URL — so `MathJax.init()` fails outright on Windows Node.

Corroborated by research-render-export §Verdict #3 ("set `loader.paths.mathjax` explicitly or Node loading
fails on Windows") and by the MathStack investigation, which abandoned the Node route entirely in favour of a
real Chromium page (`history://MathStack`, probes driven through `eval`/browser tabs rather than Node).

**Consequences, all of which are now structural:**

1. MathJax is **browser-only** and **lazily loaded** (`ensureMathJax()` injects `tex-svg.js` via
   `document.createElement('script')`). It is never imported by `src/core/markdown/*`, so parsing and unit tests
   stay Node-native and fast.
2. Any *server-side* or Node-side formula rendering (a future CLI, a corpus validator that renders 200+ cases in
   CI) must go through a real browser (Playwright) or wait for an upstream fix — **a design constraint, not a
   bug to work around**. `[UNVERIFIED]` whether MathJax ≥4.1.4 fixes the loader path handling; no such release
   was checked here.
3. The vendor step is a **copy**, not an import: `scripts/prepare-mathjax.mjs` resolves the pnpm symlink to the
   real package and copies it to `public/mathjax/v4/`, skipping `node-main*`, `require.mjs` and docs. Verified
   vendored tree: `public/mathjax/v4` = `mathjax@4.1.3`, 19 MB, stamp file `.vendor-stamp`.

### 3.2 Per-expression conversion instead of document scanning

MathJax's normal mode scans a page for delimiters. OpenMark cannot use it: the pipeline already decided where
the math is (`math-plugin.ts` tokenizer) and the diagnostics feature must attribute a failure to one specific
expression with its own source range. So `renderExpression(tex, {display, containerWidth, scale})` drives
`MathJax.startup.document.convert()` and reads back `adaptor.outerHTML(node)`.

Browser-only mode is configured in `configure()`:

| Setting | Value | Reason (from the code's own comments) |
|---|---|---|
| `loader.paths.mathjax` | local `public/mathjax/v4` | offline; the component loader resolves `[tex]/mhchem` at runtime relative to it |
| `loader.load` | `['[tex]/mhchem']` | `\ce{}` / `\pu{}` |
| `tex.packages['[+]']` | `mhchem, ams, mathtools, boldsymbol, cancel, color, unicode, textmacros, autoload` | chemistry, environments/numbering, `\coloneqq`-class macros, `\cancel`, `\textcolor`, CJK-in-formula, `\text{}`, lazy-load for anything left |
| `tex.processEscapes/processEnvironments` | `true` | `\$` and `\begin{align}` handling |
| `tex.tags` | `'none'` | numbering is enabled per-render (§3.4) |
| `svg.fontCache` | `'local'` | self-contained SVG for HTML/PDF export |
| `svg.useXlink` | `false` | `href` survives HTML serialisation where an XLink namespace declaration would be dropped |
| `options.enableMenu` | `true` | MathJax's own context menu (copy as LaTeX etc.) |
| `options.enableAssistiveMml` | `false` | avoids pulling the speech/a11y payload |
| `startup.typeset` | `false` | no document scanning |

### 3.3 Error reporting (the requirement "a failure must never make the LaTeX disappear")

Measured that MathJax emits the original TeX inside `<merror data-mjx-error="…">`. `renderExpression` regexes
`/data-mjx-error="([^"]*)"/` out of the serialised node and returns a discriminated outcome
`{ok:false, html, error:{name:'TeXError', message}}`; entity-decoded via `decodeAttr`. Two further failure modes
are modelled: `MathJaxUnavailable` (script blocked/absent → degrade to showing LaTeX) and `ConversionError`
(`convert()` threw). `src/core/render/typesetter.ts` `fillMath()` then:

- keeps `outcome.html` when present, otherwise writes `expr.raw` (delimiters included) into the node;
- sets `data-om-state="error"` and `.om-math--error`, and puts the message in `title`;
- calls `onMathError` and emits a `math-render-error` diagnostic carrying `range`, `mathId`, `excerpt` and the
  formula source in `detail`.

There is also a **pre-typeset** sanity check (`checkMathSource` in `engine.ts`) that counts brace balance
(backslash-aware, so `\{` never opens a group). It is explicitly documented as *non-authoritative*: "MathJax is
the authority on whether an expression renders".

### 3.4 Equation numbering

`setEquationNumbering(enable)` mutates the **TeX input jax** (`startup.document.inputJax[i].options.tags`), not
the config global — MathJax reads `tex.tags` at jax construction, so mutating the config afterwards has no
effect (documented in the code). `resetMathDocument()` clears the label/tag state so re-rendering the same file
yields identical numbers. `needsNumbering(texSources)` detects `\label|\tag|\ref|\eqref` or an
`align/equation/gather/multline/eqnarray` environment. In `typesetter.ts`, a document that needs numbering is
typeset **eagerly and sequentially in document order** (a lazily-rendered subset would receive numbers in
viewport order); everything else stays lazy.

### 3.5 Open risk R-MATH-1 — the MathJax 4 font payload is not vendored (offline/CSP hazard)

Verified in this repo:

- `public/mathjax/v4/` contains the `mathjax@4.1.3` package and **no font data package**: `output/` holds only
  `chtml.js` and `svg.js`; `find public/mathjax/v4 -iname '*newcm*'` → nothing; the only `mhchem` file is
  `input/tex/extensions/mhchem.js` (the TeX extension, not the chemistry glyph font).
- `node_modules/@mathjax` **does not exist** — `@mathjax/mathjax-newcm-font` and
  `@mathjax/mathjax-mhchem-font-extension` are not dependencies (`package.json` lists only `mathjax: ^4.1.3`).
- The vendored bundle carries hardcoded fallbacks: `tex-svg.js` and `loader.js` both contain
  `https://cdn.jsdelivr.net/npm/@mathjax…`, and `output/svg.js` defines the default font template
  `FONTPATH = "@mathjax/%%FONT%%-font"` with `fontPath` resolved as `` [fonts]/%%FONT%%-font ``.
- `src/core/math/mathjax.ts` sets `loader.paths.mathjax` but **never** `loader.paths.fonts` or
  `output.fontPath`.
- Independently measured (research-vditor §Limitation 9, in Chromium): an unconfigured MathJax 4.1.3 SVG render
  issues a request to `https://cdn.jsdelivr.net/npm/@mathjax/mathjax-newcm-font@4.1.3/svg/dynamic/<glyph>.js`,
  and `tex-svg.js` also references `https://cdn.jsdelivr.net/npm/speech-rule-engine@…`.

`[INFERENCE]` — in the packaged app the CSP is `script-src 'self'` (`src-tauri/tauri.conf.json`), so any
dynamic font-component fetch is blocked; characters whose glyph data is not already inlined would then render
with missing/blank glyphs rather than an explicit error. The exact in-app behaviour is **`[UNVERIFIED]`** because
no UI exists yet to observe it (see §11).

**Required fix (tracked as a Phase-3 blocker):** add `@mathjax/mathjax-newcm-font@4.1.3` (and
`@mathjax/mathjax-mhchem-font-extension@4.1.3` if `\ce{}` glyphs are incomplete) to `package.json`, copy them
under `public/mathjax/v4/` in `scripts/prepare-mathjax.mjs`, and set `loader.paths.fonts` (plus
`output.fontPath` if the resolver still escapes) in `configure()`. A cheap alternative to evaluate: the
`tex-svg-nofont.js` component (874 KB vs 1,849,625 B for `tex-svg.js`) **if** it removes the runtime font fetch
— `[UNVERIFIED]` (research-vditor Open question 3).

### 3.6 mhchem / `\pu{}`

`\ce{}` and `\pu{}` come from the `mhchem` TeX extension, loaded explicitly (`loader.load`) and listed in
`tex.packages`. mhchem is inside the `mathjax` package (`input/tex/extensions/mhchem.js` — verified present),
so no extra dependency is needed for the *macros*; only the *glyphs* are subject to R-MATH-1.

---

## 4. Math delimiter disambiguation (implemented, matching the spec)

`src/core/markdown/math-plugin.ts` implements the tokenizer by hand rather than using
`markdown-it-texmath` / `remark-math`, because the requirement is the *exact byte range of every expression*
plus the authored source verbatim. Rejected plugins, with evidence:
`markdown-it-texmath@1.0.0` last published 2022-05 with a `markdown-it@^13` devDependency;
`markdown-it-mathjax3@5.2.0` depends on `mathxyjax3@0.8.3` (a non-standard 7.6 MB near-homograph package) and
`@se-oss/deasync` — a supply-chain risk (research-render-export §2).

The four ambiguity rules, as implemented (and as documented in the file header):

1. an opening `$` must not be followed by whitespace;
2. a closing `$` must not be preceded by whitespace;
3. a closing `$` must not be followed by a digit;
4. neither `$…$` nor `$$…$$` may span a line break.

(1)+(2) reject `Price: $5, $10`; (3) rejects `$10,$20`; (4) stops a stray `$` from swallowing the rest of the
document. `\(…\)` and `\[…\]` are unambiguous and may span lines; when no closer exists the inline rule
**declines**, so markdown-it's `escape` rule handles the backslash and a lone `\(` renders as a literal `(`.
Registration order encodes this: `md.inline.ruler.before('escape', 'math_inline', …)`. Escaped delimiters are
handled by `indexOfUnescaped` (odd-backslash counting), so `\$$` and `\\$$` differ.
Code spans and fenced/indented code are handled *before* inline rules run, so a `$` inside them can never reach
the tokenizer — a property of markdown-it's design, not a special case here.

Supported block openers (`matchBlockOpener`) and the exported `MATH_ENVIRONMENTS` set (31 names: `math`,
`displaymath`, `equation(*)`, `align(*)`, `alignat(*)`, `gather(*)`, `multline(*)`, `eqnarray(*)`, `flalign(*)`,
`cases`, `rcases`, `dcases(*)`, `drcases`, `split`, `array`, `matrix`, `pmatrix`, `bmatrix`, `Bmatrix`,
`vmatrix`, `Vmatrix`, `smallmatrix`, `subequations`). `findEnvironmentEnd` counts nested same-name environments.
Delimiter kinds are typed as `MathDelimiter` in `src/core/markdown/types.ts`:
`dollar | dollar-block | paren-inline | paren-block | latex-env | math-fence`.
Fence aliases: ` ```math ` and ` ```mathjax ` become display math, not code (`MATH_FENCES` in `engine.ts`);
` ```mermaid `/` ```mmd ` become diagrams; everything else is a code block.

---

## 5. Syntax highlighting: Shiki 4.5.0 (DECIDED)

`src/core/render/highlighter.ts`, with the reasons recorded in its header:

- **JavaScript regex engine** (`createJavaScriptRegexEngine({forgiving:true})`), not the Oniguruma WASM build:
  no `.wasm` asset to ship/resolve in a desktop app, no CDN, and "fast enough for reading". Shiki ≥3.9.1
  supports all built-in languages on this engine (research-render-export §3).
- **Dual themes in one pass** — `github-light` + `github-dark` with `defaultColor:false`, so theme switching is
  pure CSS with no re-tokenisation (matches `tokens.css`, which defines light/dark custom properties).
- **Grammars load on demand** — 66 language loaders (25 in the first group, 41 on-demand), each an explicit
  literal `import('shiki/langs/x.mjs')` so Vite can emit one chunk per grammar; only `javascript` and `json` are
  preloaded into the core highlighter. Measured cost backdrop:
  a 50-language subset is 2,879,939 B; `cpp` alone is 533,914 B (research-render-export §3).
- **Graceful degradation** — `resolveLanguage()` maps aliases (`js→javascript`, `py→python`, `text/txt/none→''`)
  and an unknown language returns `''` → plain escaped `<pre class="shiki shiki--plain">`, never a failure.
  Same fallback on a grammar-load exception.
- Rejected: highlight.js (386 language modules / 1.58 MB, CSS themes to maintain) and Prism (324 components +
  633 KB of minified files) — Shiki is the only one that gives exact TextMate fidelity and theme-as-data.

---

## 6. Diagrams and sanitisation

### 6.1 Mermaid 12.2.0

`src/core/render/mermaid.ts`: lazy `import('mermaid')` (package measured at 122 MB on disk including source
maps; `dist/mermaid.esm.min.mjs` 30,936 B + 5,363,101 B of chunks), initialised with
`startOnLoad:false`, **`securityLevel:'strict'`**, **`suppressErrorRendering:true`**, **`htmlLabels:false`**,
`maxTextSize:200_000`, `maxEdges:1_000`, plus explicit light/dark `themeVariables` derived from the app's tokens.
`securityLevel:'strict'` sanitises labels and blocks script execution and `javascript:` URLs;
`htmlLabels:false` removes HTML-label injection entirely and keeps output portable to HTML/PDF export;
`suppressErrorRendering` stops Mermaid injecting its own red error diagram so the app can show its own.
Results are cached by `theme + source` with a 200-entry bound; `validateDiagram()` parses without rendering so
the diagnostics panel can be fed cheaply.

### 6.2 Sanitisation: DOMPurify 3.4.17, **sanitise before inject**

`src/core/markdown/sanitize.ts`. The ordering is the security model, and it is stated in the header:

> Sanitisation runs on the **intermediate** HTML, before it is inserted into the DOM. At that point every
> expensive construct is still an empty placeholder: math, Mermaid and code blocks carry no content at all.

So author HTML (`<br>`, `<kbd>`, `<details>`, …) is sanitised while `<script>`, event handlers and
`javascript:` URLs cannot survive; then MathJax/Mermaid inject SVG into containers that were *already*
sanitised, produced by trusted libraries rather than by the document. The alternative (sanitise after
typesetting) is what forces editors to allow `<use>`/`foreignObject`, which DOMPurify's SVG rules exist to
block. Concrete configuration: explicit `ALLOWED_TAGS` (markdown/GFM + `label` for task lists + `mjx-container`),
`ALLOWED_ATTR` allow-list including `data-*`/`aria-*`, `FORBID_TAGS`
(`script style iframe object embed form base link meta`), `FORBID_ATTR` (inline `on*` handlers, `formaction`,
`srcdoc`), `ALLOWED_URI_REGEXP` limited to `http(s)`, `mailto`, `tel`, `data:image/*`, `SAFE_FOR_XML:true`, and
`KEEP_CONTENT:false`. Stripped tags are **named back** to the UI (`removed[]` → `html-sanitized` diagnostics) so
nothing is dropped silently. Cross-check: engine `html:true` stays on for reading, with the comment that "safety
is enforced by sanitising the produced HTML".

---

## 7. Editor kernel: Vditor 4.0.0 vs Milkdown 7.22.3 (DECIDED: adopt neither as the source of truth)

### 7.1 Vditor 4.0.0 — measured verdict (research-vditor)

`mode:'ir'` (instant rendering) and `'wysiwyg'` use the **DOM as the document model**: `getValue()` re-serialises
`contenteditable` HTML through Lute 1.7.6 (`VditorIRDOM2Md`). Measured losses in `mode:'ir'`:

| input | `getValue()` | kind |
|---|---|---|
| `Hard break next:  \n` | `Hard break next:\n` | **semantic** (joins the rendered lines) |
| CRLF file | LF | rewrite of every line on Windows |
| `a\n\n\n\nb` | `a\n\nb` | blank-line collapse |
| `\|:--\|--:\|` | `\| :- \| -: \|` | table delimiter rewrite |
| `- [x] done` | `- [X]  done` | task-list case + spacing |
| ` ```js title="x" {1,3-5}` | ` ```js ` | fence info string dropped |
| `~~~js` | ` ```js ` (wysiwyg) | fence marker rewrite |
| `[ref]: url "t"` | title dropped | reference title lost |
| tab-indented list | 2 spaces | indentation rewrite |
| unclosed fence | auto-closed | structural change |
| NBSP (U+00A0) | space | `code160to32` in **all** modes |

Preserved byte-identically: HTML comments, unknown syntax, raw HTML, footnotes, math macros, frontmatter
fields, and the broken-formula source. **Only `mode:'sv'` round-trips byte-for-byte** (measured `equal:true`),
i.e. fidelity demands giving up the instant-render experience. Normalisation is idempotent (first save rewrites,
later saves are stable) but there is no "modified?" flag and no retained original bytes.

Other decisive constraints: default `cdn` is `https://unpkg.com/vditor@4.0.0` and the loaders (`addScript`,
`addScriptSync`) fetch `i18n/`, `icons/`, `lute.min.js`, KaTeX/MathJax/hljs/mermaid at runtime — offline is only
achievable by repointing `cdn` to a bundled copy (measured: zero external requests with `cdn:'./vd'`).
`addScriptSync` is **synchronous XHR + inline script injection**, so it needs a CSP that permits inline scripts
and it blocks startup. No find/replace and no text model: issue #317 closed *wontfix*, #1901 closed "no plan",
because Lute cannot produce source maps (88250/lute#187) → "基于行列的操作都无法实现". Math is a closed
`'KaTeX' | 'MathJax'` union and `customRenders` cannot intercept `language:'math'` (branch order in
`processCode.ts`); the bundled MathJax is **3.1.2** (2020). A MathJax 4.1.3 swap was verified end-to-end by two
recipes (drop-in + `output.fontPath`, or an id-cache bypass on the hardcoded `protyleMathJaxScript`), but needs
`@mathjax/mathjax-newcm-font` (**47 MB / 1124 files**) shipped locally. **Licence compliance gap:** Vditor is MIT,
but the shipped `dist/js/lute/lute.min.js` contains Lute, which is **Mulan PSL v2**, with **no licence file or
banner** in `dist/js/lute/` (while `dist/js/mathjax/LICENSE` and `dist/js/highlight.js/LICENSE` are shipped).

### 7.2 Milkdown 7.22.3 — measured verdict (research-milkdown)

MIT, pure ESM, active (7.22.3 published 2026-10-10), offline-clean, and it has the best CJK story of the two
(real composition handling in `inline-nodes-cursor-plugin.ts` + `custom-input-rules.ts`, plus
`prosemirror-virtual-cursor`). But the **ProseMirror document is the source of truth** and `getMarkdown()` always
re-serialises it. Measured damage: YAML frontmatter destroyed (`---\ntitle: x\n---\n` becomes a setext H2),
CRLF→LF, BOM dropped, reference-link definitions lost, entities rewritten (`AT&amp;T` → `AT\&T`), bullet markers
`-`→`*`, ordered lists renumbered, setext→ATX, thematic breaks →`***`, fence info strings dropped, tilde fences
→ backticks, indented code → fenced, hard breaks `  `→`\`, table padding rewritten, wiki links and GitHub
alerts escaped. **Crepe-specific corruption:** ` ```latex ` fences are silently converted to `$$` display math
(a real LaTeX listing destroyed), single-line `$$E=mc^2$$` demoted to inline `$…$`, and with the default
ImageBlock feature the image **alt text is overwritten by the resize ratio** (`![alt text](…)` → `![1.00](…)`).
`\ce{H2O}` renders as garbage because mhchem is not loaded (one-line fix, `katex/contrib/mhchem`).
The frontmatter fix is proven and cheap, and the MathJax 4 swap is localised to a `toDOM`/`renderPreview`
function, but the effort estimate is **~12–20 engineer-days** on top of Crepe plus **3–5 days** of risk work for
a diff/patch-based save that keeps untouched bytes untouched. Crepe bundles 2.79 MB raw / 928 KB gzip (worst
case, no splitting) + 1.1 MB of KaTeX fonts.

### 7.3 Decision D7 — architecture follows from the two verdicts

Neither kernel can keep the promise "saving must not change my file", because both reconstruct markdown from a
DOM/doc model. OpenMark therefore **keeps the authoritative source text as the sole write target** (see
`docs/ARCHITECTURE.md` §3) and treats any editor kernel as a *view* behind an adapter. Reading-side rendering
stays markdown-it-based (§2) so that the reading experience does not inherit either kernel's normalisation.

---

## 8. Typora benchmark (reference product) — inventory and who wins where

Facts, from `local://research-typora-benchmark.md` (public docs/site/changelog/issue tracker only; no assets or
source copied):

| Item | Value |
|---|---|
| Version (2026-10-15) | 1.14.10 (Windows x64/ia32; arm64 1.14.9; macOS; Linux) |
| Runtime | Electron/Chromium (proprietary, not open source) |
| Price / licence | US$14.99, one-time, 1 user / up to 3 devices; 15-day trial |
| Built-in themes | 6 (github, gothic, newsprint, night, pixyll, whitey + whitey-deep) |
| Code fence languages | ~100 (CodeMirror modes), incl. `math`, `mermaid`, `pseudocode` |
| Mermaid | 11.13.0 (since 1.13) |
| Math | **MathJax v4 since 1.13** (v3.2.2 since 1.4); mhchem built in; physics optional; `$ $`, `$$ $$`, `\(\)`, `\[\]`, ` ```math ` |
| Editor engine | CodeMirror for code fences / source mode |
| Plugin system | none in-app |
| Default inline-math rules | Pandoc-style (opening `$` not followed by space; closing not preceded by space, not preceded by `\`, not followed by a digit) — the same convention OpenMark implements (§4) |
| Numbering | No automatic / AMS rule / auto-all; `\label`+`\ref`; `\label`/`\ref` are **lost in docx export** (pandoc#7774) |
| Export | Native PDF/HTML/Image; everything else (docx, odt, rtf, epub, LaTeX, wiki, RST, RevealJS) needs an external **pandoc** |
| Read-only mode | **does not exist** (issues #710, #4645, #5352, #6056 closed as duplicates) |
| Tabs | **not supported** (New Tab = "Not Supported" on Windows) |
| Reformat / lint | **none** — "Typora does not have built-in markdown convert, reformat or lint function" |
| Autosave (Win/Linux) | opt-in, default 5 min; recovery = "Recover Unsaved Drafts", **no version control** |

**The 12 documented pain points** (ranked in the note by how directly each justifies a differentiator):
1. hard render-size cap (~2 MB, "The file is too large to render in Typora"), issue #1961 open since 2018 and
   still open 2026-10-09; users report rejection at 1.78 MB–5.7 MB;
2. slowness/freezing on large or math-heavy documents (#1285, #6389, #6542, #6670 — a 525 KB file froze desktop
   input for ~1 min on Windows 11);
3. data loss with no recovery (#6618: buffer blanks, Ctrl+Z unreliable; #4415, #3107);
4. saved-file identity mutation — `.mdx` is silently renamed to `.md` on save (#6324, open);
5. math regressions and no math diagnostics (1.13/MathJax v4 broke `\part`, `\R`, `\bold{}`, `coloneqq`,
   `degree`, `prescript`; 1.14.10 inline-math merging bug; only tool is "Force Refresh");
6. no read-only / view-only mode;
7. Chinese/IME defects on Windows and Linux (#6302 Sogou caret jump, #6554 Microsoft Pinyin first-char
   English, #6659 Fcitx5 dropped first character; #2494 Chinese quotes converted to English by auto-pair);
8. PDF/print export fragility and doc-vs-changelog contradictions about dark themes;
9. no lint/health check/reformat;
10. reading-experience gaps (no tabs, no Files+Outline simultaneously, Focus Mode is a writing aid);
11. autocomplete that cannot be turned off (#6198);
12. doc/behaviour drift and security history (CVE-2020-18748; "Fix XSS on mermaid and math" in 1.9;
    "Fix a security vulnerability" in 1.14.8).

Parity features OpenMark must match rather than beat: cursor-local source reveal, sidebar modes with `Ctrl+P`
fuzzy open and `Ctrl+Shift+F` folder search, word count with reading time and the "1 hanzi = 1 word" rule,
focus/typewriter modes, table GUI, optional code line numbers, ~100 languages, callouts/task lists/footnotes/
TOC/frontmatter, per-format export with pandoc pass-through, theme CSS layer order with a light/dark split,
`Ctrl+Shift+0/=/−` zoom, Always-on-Top, JumpList, `typora .` CLI.

**The six differentiation features mandated by the goal** map 1:1 onto items 1–6 and 9–10 above: compatibility
diagnostics, math diagnostics panel, immersive textbook reading, safe read-only mode, document health check,
advanced reading settings. They are specified as requirements E1–E6 in `docs/PRD.md`.

---

## 9. Tauri 2 on Windows 11 — findings

### 9.1 Versions and licences (read from crates.io / npm on 2026-10-15)

| Package | Version | Licence |
|---|---|---|
| crates `tauri` / `tauri-cli` | **2.12.4** / 2.12.3 | Apache-2.0 OR MIT |
| npm `@tauri-apps/api` / `@tauri-apps/cli` | 2.12.4 / 2.12.3 | Apache-2.0 OR MIT |
| `tauri-driver` (crate) | 2.1.0 | Apache-2.0 OR MIT |
| npm `@wdio/tauri-service` / `@wdio/tauri-plugin` | 1.5.0 | MIT |
| plugins (dialog/fs/opener/store/window-state/updater/os/process) | 2.8.3 / 2.7.1 / 2.7.2 / 2.5.0 / 2.5.0 / 2.14.0 / 2.4.0 / 2.4.0 | MIT OR Apache-2.0 |
| `tauri-plugin-persisted-scope` / `single-instance` | 2.4.2 / 2.5.4 | MIT OR Apache-2.0 |

Tauri v3 exists only as `3.0.0-alpha.5` (Rust 1.95) — **do not use**.

### 9.2 Inconsistency found in-repo: declared MSRV

`src-tauri/Cargo.toml` declares `rust-version = "1.77.2"`, but `tauri` 2.12.4 declares `rust_version: 1.90`,
and every official plugin doc states "This plugin requires a Rust version of at least **1.90**". The manifest's
MSRV is therefore wrong/stale and will mislead tooling (and any rustup auto-toolchain selection). **Action:** set
`rust-version = "1.90"`. (Evidence: research-tauri-windows-e2e §Q1; `src-tauri/Cargo.toml`.)

### 9.3 Bundling

`src-tauri/tauri.conf.json` requests `targets: ["nsis","msi","app"]`. `nsis` and `msi` are the Windows
installers (NSIS defaults to `installMode: currentUser`, no admin — matching the config). **`app` is macOS-only**
and is noise on a Windows-only product ("`app` | macOS application bundle"). `msi` additionally requires the
VBSCRIPT optional Windows feature, which Microsoft is deprecating → **NSIS is the safer primary installer**.
`bundle.fileAssociations` registers `md`/`markdown` with a ProgId and the prompt `"open with OpenMark"`; the
opened path arrives as `argv[1]`. It **cannot silently become the default handler** on Windows 11
(`HKCU\...\FileExts\.md\UserChoice` is hash-protected), so onboarding must explain the one-time confirmation.

Portable shipping is two mechanisms: `tauri build --no-bundle` (raw `.exe`, WebView2 preinstalled on Win11) and
`app > appDirectoriesOverride` (added in 2.12.0) to keep app data next to the executable —
`src-tauri/tauri.portable.conf.json` already contains `{"app":{"appDirectoriesOverride":"data"}}`.
**Gap found:** `package.json`'s `desktop:build:portable` is `tauri build --no-bundle` and does **not** pass
`--config src-tauri/tauri.portable.conf.json`, so the portable flavour is not actually reachable from the
documented script. `[INFERENCE]` on intent; the mismatch itself is verified.

### 9.4 PDF: no API exists (must build it)

`wry`'s Windows `print()` is `self.eval("window.print()")` and Tauri documents `webview.print()` as
macOS-only + dialog-based; the upstream request for silent PDF export (**wry#707**) is still open as of
2026-05-01. WebView2 itself can do it: `ICoreWebView2_7::PrintToPdf` / `ICoreWebView2_16::PrintToPdfStream`.
OpenMark has already taken the first architectural step: `Cargo.toml` declares optional `webview2-com 0.39.1`
and `windows 0.62.2` behind a `pdf-export` feature, and `src-tauri/src/lib.rs` documents that "no command is
exported until it actually calls PrintToPdf" — **verified: `commands.rs` contains no PDF command**. Known
gotcha: `PrintToPdfAsync` renders the *current viewport layout*, so a fixed print width + `@media print` must be
forced first. Fallback that ships with zero code: `window.print()` → WebView2 print preview → "Microsoft Print
to PDF" (offline, not silent).

### 9.5 E2E (WebdriverIO)

Route: `@wdio/tauri-service` with the **embedded** provider (a WebDriver server inside the app), pinning
`@wdio/cli`/`webdriverio` to **9.x** (the service declares `peerDependencies: webdriverio ^9.0.0` while latest
webdriverio is 10.0.2). Windows backend is msedgedriver ↔ WebView2; a version mismatch **hangs** the suite
(not an error), so `autoDownloadEdgeDriver: true` is mandatory. Requirements: `tauri-plugin-wdio` (+
`tauri-plugin-wdio-webdriver` for embedded), the `wdio:default` permission, `withGlobalTauri: true`, and a
frontend `import '@wdio/tauri-plugin'` **before** app code.

State in this repo: `package.json` pins `@wdio/*` + `webdriverio` at ^9.32.0 ✓; `Cargo.toml` has
`tauri-plugin-wdio = "1.5.0"` ✓; `lib.rs` registers it only under `#[cfg(debug_assertions)]` ✓;
`capabilities/wdio.json` grants `wdio:default` ✓; `tauri.conf.json` sets `withGlobalTauri: true` ✓.
**Gaps found:** `index.html` does not import `@wdio/tauri-plugin` (so `browser.tauri.execute()`, mocking and log
capture would fail with "Tauri plugin not available"), and `tests/desktop/` is empty (no `wdio.conf.ts`).
Native OS dialogs are fundamentally not drivable by WebDriver → dialog flows must be tested by mocking the
invoked command (`browser.tauri.mock`).

### 9.6 Build gotchas accepted as constraints

First `cargo build` ~5–15 min; Defender real-time scanning multiplies it (exclusions for `src-tauri/target`,
`%USERPROFILE%\.cargo`, `%LOCALAPPDATA%\tauri` are the documented mitigation); `target/` reaches several GB;
**MAX_PATH (260)** is a real hazard and this workspace path contains a space and is long — the research
explicitly recommends a short path such as `D:\src\openmark` and/or `LongPathsEnabled`; `failed to run light.exe`
means the VBSCRIPT feature is off (MSI only). None of these block the project, but they are the reason Phase 1
keeps `CARGO_TARGET_DIR` configurable.

### 9.7 Distribution signing

Unsigned or self-signed installers produce "Windows protected your PC"; **Smart App Control** on fresh
Windows 11 installs *blocks* unsigned binaries outright; SmartScreen reputation resets to zero per version
unless versions share a publisher identity; EV certificates no longer bypass SmartScreen. Budget path:
Azure Artifact Signing (~$9.99/month, no hardware token) or a custom `bundle.windows.signCommand`.
Updater signing (`TAURI_SIGNING_PRIVATE_KEY`) is a separate, always-required mechanism.

### 9.8 Decision D9 — Tauri over Electron

Tauri was checked against the Windows-only risks that matter (bundling, file association, file access, PDF, E2E,
auto-update) and each has a concrete path (§9.3–§9.7). Electron's only real advantage here is a mature
multi-window/OS-dialog E2E story, and `@wdio/tauri-service` already exposes `listWindows()`/`switchWindow()`;
its driver stack (msedgedriver/WebView2) must be version-matched but that is automatable. Keep Tauri.

---

## 10. Decision register

| # | Decision | Reason (evidence) |
|---|---|---|
| D1 | Tauri 2.12.4 + React 19 + TS + Vite 8, Windows-first | §9.8; MSVC/SDK present; WebView2 present; plugins cover dialog/fs/opener/store/state/single-instance |
| D2 | markdown-it 15.0.2 as the parser; **never** re-serialise | §2.1 (652/652, 20.3 Mi chars/s), §2.2 (serialisation is lossy) |
| D3 | Custom frontmatter rule preserving raw source; first-line `---` only | `rules.ts`: "recognised but never interpreted destructively"; default preset destroys frontmatter (§2.3) |
| D4 | MathJax 4.1.3, SVG, `fontCache:'local'`, `useXlink:false`, browser-only, per-expression conversion | §3.1–§3.3; self-contained SVG for export; per-expression error attribution required by E2 |
| D5 | Hand-written math tokenizer with the 4 ambiguity rules | §4; off-the-shelf plugins expose neither byte ranges nor the authored source |
| D6 | Shiki 4.5.0 JS engine, dual themes, per-language dynamic import | §5 |
| D7 | Mermaid 12.2.0 `strict` + `htmlLabels:false` + `suppressErrorRendering` | §6.1; untrusted diagram source |
| D8 | Sanitise-before-inject with DOMPurify on the placeholder HTML | §6.2; avoids having to allow SVG `<use>`/`foreignObject` |
| D9 | No editor kernel owns the document; authoritative source text + surgical patching; adapter boundary | §7.1, §7.2 (both kernels reconstruct markdown and lose fidelity) |
| D10 | Lazy typesetting via placeholders + registries, IntersectionObserver-style deferral | `types.ts` header, `placeholders.ts`, `typesetter.ts`; enables a multi-MB document (Typora's cap is the anti-goal) |
| D11 | BOM + line-ending preservation on the byte path | `src/core/fs/encoding.ts` header: otherwise every Windows file becomes a whole-file diff |
| D12 | Atomic write (temp + fsync + rename) with rotating backups | `src-tauri/src/commands.rs`; crash-safety and Typora pain #3 |
| D13 | Debug-only WDIO plugin, `wdio:default` capability, WDIO pinned to 9.x | §9.5; never ship the test surface |
| D14 | `window.print()` now, WebView2 `PrintToPdf` behind `pdf-export` later | §9.4; no Tauri API exists |

---

## 11. Open questions / unverified

1. **MathJax 4 font payload in the packaged app (R-MATH-1)** — does a local `tex-svg.js` render every glyph
   offline, or does the blocked jsdelivr font fetch degrade characters? Needs a real WebView2 observation.
   §3.5. `[UNVERIFIED]`
2. **`@wdio/tauri-service` 1.5.0 on WDIO 10** — peer range says 9.x; a v2 is hinted. Pinned to 9.x. `[UNVERIFIED]`
3. **Exact MSI `Advertise="yes"` ProgId behaviour** on Win11 (immediate "Open with" entry vs. after an Explorer
   refresh/reboot). `[UNVERIFIED]`
4. **`.md` ownership when another editor owns it** — expected "Open with" + one manual confirmation; needs a
   clean-image test. `[UNVERIFIED]`
5. **Smart App Control state on the build machine** — determines whether unsigned local installs even run.
   `[UNVERIFIED]`
6. **Bundler tool cache path** on Windows (`target/.tauri/` vs user cache) was not located in the source. `[UNVERIFIED]`
7. **MathJax `tex-svg-nofont.js`** — whether it removes the runtime font fetch entirely. `[UNVERIFIED]`
8. **Byte-exact round-trip of the OpenMark write path under composition/IME editing** — cannot be assessed until
   the editor surface exists; the *file* path (BOM/EOL) is covered by `encoding.ts`, the *edit* path is not.
   `[UNVERIFIED]`
