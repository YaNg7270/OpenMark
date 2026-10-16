import { createHighlighterCore, type HighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import { BROADSHEET_LIGHT } from './broadsheet-theme';

/**
 * Syntax highlighting via Shiki.
 *
 * Design choices:
 *  - **JavaScript regex engine**, not the Oniguruma WASM build: a desktop app has no
 *    CDN, and shipping a `.wasm` asset alongside the bundle is one more thing that can
 *    fail to resolve. The JS engine needs no extra file and is fast enough for reading.
 *  - **Dual themes in one pass.** Highlighting emits both the light and dark colour as
 *    CSS custom properties, so switching theme is a pure CSS operation with no
 *    re-tokenisation and no flash.
 *  - **Grammars load on demand.** Only the languages a document actually uses are
 *    imported, so the initial payload stays small even though the grammar set is large.
 */

const THEME_LIGHT = BROADSHEET_LIGHT.name!;
const THEME_DARK = 'github-dark';

/**
 * Grammar loaders, keyed by Shiki language id.
 *
 * Every entry is an explicit static `import()`: Vite must be able to see the literal
 * specifier at build time, so a template-literal path would silently produce a missing
 * chunk in the packaged app.
 */
const LANG_LOADERS: Record<string, () => Promise<unknown>> = {
  // --- pre-loaded on first use ---
  bash: () => import('shiki/langs/bash.mjs'),
  c: () => import('shiki/langs/c.mjs'),
  cpp: () => import('shiki/langs/cpp.mjs'),
  csharp: () => import('shiki/langs/csharp.mjs'),
  css: () => import('shiki/langs/css.mjs'),
  diff: () => import('shiki/langs/diff.mjs'),
  go: () => import('shiki/langs/go.mjs'),
  html: () => import('shiki/langs/html.mjs'),
  java: () => import('shiki/langs/java.mjs'),
  javascript: () => import('shiki/langs/javascript.mjs'),
  json: () => import('shiki/langs/json.mjs'),
  jsx: () => import('shiki/langs/jsx.mjs'),
  kotlin: () => import('shiki/langs/kotlin.mjs'),
  markdown: () => import('shiki/langs/markdown.mjs'),
  php: () => import('shiki/langs/php.mjs'),
  python: () => import('shiki/langs/python.mjs'),
  ruby: () => import('shiki/langs/ruby.mjs'),
  rust: () => import('shiki/langs/rust.mjs'),
  sql: () => import('shiki/langs/sql.mjs'),
  swift: () => import('shiki/langs/swift.mjs'),
  toml: () => import('shiki/langs/toml.mjs'),
  tsx: () => import('shiki/langs/tsx.mjs'),
  typescript: () => import('shiki/langs/typescript.mjs'),
  xml: () => import('shiki/langs/xml.mjs'),
  yaml: () => import('shiki/langs/yaml.mjs'),
  // --- on demand ---
  ada: () => import('shiki/langs/ada.mjs'),
  asm: () => import('shiki/langs/asm.mjs'),
  clojure: () => import('shiki/langs/clojure.mjs'),
  cmake: () => import('shiki/langs/cmake.mjs'),
  dart: () => import('shiki/langs/dart.mjs'),
  dockerfile: () => import('shiki/langs/dockerfile.mjs'),
  elixir: () => import('shiki/langs/elixir.mjs'),
  erlang: () => import('shiki/langs/erlang.mjs'),
  fortran: () => import('shiki/langs/fortran-free-form.mjs'),
  fsharp: () => import('shiki/langs/fsharp.mjs'),
  gdscript: () => import('shiki/langs/gdscript.mjs'),
  graphql: () => import('shiki/langs/graphql.mjs'),
  groovy: () => import('shiki/langs/groovy.mjs'),
  haskell: () => import('shiki/langs/haskell.mjs'),
  ini: () => import('shiki/langs/ini.mjs'),
  julia: () => import('shiki/langs/julia.mjs'),
  latex: () => import('shiki/langs/latex.mjs'),
  less: () => import('shiki/langs/less.mjs'),
  lua: () => import('shiki/langs/lua.mjs'),
  makefile: () => import('shiki/langs/makefile.mjs'),
  matlab: () => import('shiki/langs/matlab.mjs'),
  nginx: () => import('shiki/langs/nginx.mjs'),
  nim: () => import('shiki/langs/nim.mjs'),
  nix: () => import('shiki/langs/nix.mjs'),
  objectivec: () => import('shiki/langs/objective-c.mjs'),
  ocaml: () => import('shiki/langs/ocaml.mjs'),
  perl: () => import('shiki/langs/perl.mjs'),
  powershell: () => import('shiki/langs/powershell.mjs'),
  protobuf: () => import('shiki/langs/protobuf.mjs'),
  r: () => import('shiki/langs/r.mjs'),
  scala: () => import('shiki/langs/scala.mjs'),
  scheme: () => import('shiki/langs/scheme.mjs'),
  scss: () => import('shiki/langs/scss.mjs'),
  solidity: () => import('shiki/langs/solidity.mjs'),
  svelte: () => import('shiki/langs/svelte.mjs'),
  verilog: () => import('shiki/langs/verilog.mjs'),
  vhdl: () => import('shiki/langs/vhdl.mjs'),
  viml: () => import('shiki/langs/viml.mjs'),
  vue: () => import('shiki/langs/vue.mjs'),
  wasm: () => import('shiki/langs/wasm.mjs'),
  zig: () => import('shiki/langs/zig.mjs'),
};

/** Aliases that documents commonly use but that are not Shiki language ids. */
const LANG_ALIASES: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  shellsession: 'bash',
  cs: 'csharp',
  'c++': 'cpp',
  'c#': 'csharp',
  golang: 'go',
  yml: 'yaml',
  md: 'markdown',
  ps1: 'powershell',
  docker: 'dockerfile',
  gql: 'graphql',
  objc: 'objectivec',
  'objective-c': 'objectivec',
  tex: 'latex',
  mathematica: 'wolfram',
  text: '',
  txt: '',
  plaintext: '',
  plain: '',
  none: '',
  '': '',
};

export type TokenTheme = 'light' | 'dark';

let highlighterPromise: Promise<HighlighterCore> | null = null;
const loadedLangs = new Set<string>();

/** Maps a fence info string to a Shiki language id, or '' for "render as plain text". */
export function resolveLanguage(raw: string): string {
  const key = raw.trim().toLowerCase();
  if (key in LANG_ALIASES) return LANG_ALIASES[key]!;
  // Unknown language: fall through to plain text rather than failing to render.
  return key in LANG_LOADERS ? key : '';
}

async function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [BROADSHEET_LIGHT, import('shiki/themes/github-dark.mjs')],
      // A tiny eager set keeps the first code block instant; the rest arrive on demand.
      langs: [import('shiki/langs/javascript.mjs'), import('shiki/langs/json.mjs')],
      engine: createJavaScriptRegexEngine({ forgiving: true }),
    });
  }
  return highlighterPromise;
}

async function ensureLanguage(hl: HighlighterCore, lang: string): Promise<boolean> {
  if (lang === '' || loadedLangs.has(lang)) return lang !== '';
  const loader = LANG_LOADERS[lang];
  if (!loader) return false;
  try {
    await hl.loadLanguage((await loader()) as never);
    loadedLangs.add(lang);
    return true;
  } catch {
    return false;
  }
}

/** HTML-escapes plain text, used when no grammar applies. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export interface HighlightResult {
  html: string;
  /** False when the language was unknown and the block fell back to plain text. */
  highlighted: boolean;
}

/**
 * Highlights one code block.
 *
 * Returns Shiki's `<pre class="shiki">` markup carrying both themes as custom
 * properties. `defaultColor: false` is what makes instant theme switching possible.
 */
export async function highlightCode(code: string, lang: string): Promise<HighlightResult> {
  const resolved = resolveLanguage(lang);
  if (resolved === '') {
    return { html: `<pre class="shiki shiki--plain"><code>${escapeHtml(code)}</code></pre>`, highlighted: false };
  }

  try {
    const hl = await getHighlighter();
    if (!(await ensureLanguage(hl, resolved))) {
      return { html: `<pre class="shiki shiki--plain"><code>${escapeHtml(code)}</code></pre>`, highlighted: false };
    }
    const html = hl.codeToHtml(code, {
      lang: resolved,
      themes: { light: THEME_LIGHT, dark: THEME_DARK },
      defaultColor: false,
    });
    return { html, highlighted: true };
  } catch {
    return { html: `<pre class="shiki shiki--plain"><code>${escapeHtml(code)}</code></pre>`, highlighted: false };
  }
}

/** Loaded grammar ids, exposed for the settings/diagnostics panels. */
export function loadedLanguages(): string[] {
  return [...loadedLangs].sort();
}
