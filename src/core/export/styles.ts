/**
 * The stylesheet that travels inside an exported file.
 *
 * `src/styles/document.css` is the reading stylesheet, and it is written against the app's
 * CSS custom properties (`--om-*`) plus a few things that only exist in the app: the font
 * stacks, `zoom: var(--om-image-scale)`, and the code-block toolbar. An export cannot link
 * it and cannot rely on the app being present, so the palette and the rules are reproduced
 * here with concrete values and no external font.
 *
 * The rules deliberately keep the reader's class names (`.om-doc`, `.om-code`, `.om-math`,
 * `.om-mermaid`): the markup the exporter serialises is the reader's markup, so the same
 * selectors apply, and the two appear side by side without translation.
 */

import type { ExportTheme } from './types';

interface Palette {
  bg: string;
  bgSubtle: string;
  bgElevated: string;
  text: string;
  textMuted: string;
  textFaint: string;
  border: string;
  borderStrong: string;
  accent: string;
  codeBg: string;
  markBg: string;
  error: string;
  errorSoft: string;
  warningSoft: string;
  success: string;
}

const LIGHT: Palette = {
  bg: '#ffffff',
  bgSubtle: '#f7f8fa',
  bgElevated: '#ffffff',
  text: '#1f2328',
  textMuted: '#5a6169',
  textFaint: '#8b939c',
  border: '#e2e5ea',
  borderStrong: '#cdd3db',
  accent: '#2f6feb',
  codeBg: '#f6f8fa',
  markBg: '#fff3a3',
  error: '#cf222e',
  errorSoft: '#ffebe9',
  warningSoft: '#fff8c5',
  success: '#1a7f37',
};

const DARK: Palette = {
  bg: '#16181d',
  bgSubtle: '#1c1f26',
  bgElevated: '#21252d',
  text: '#dfe3e9',
  textMuted: '#9aa3af',
  textFaint: '#6c757f',
  border: '#2b303a',
  borderStrong: '#3a414d',
  accent: '#6ea8fe',
  codeBg: '#1b1e24',
  markBg: '#5c4d00',
  error: '#ff6b6b',
  errorSoft: '#33201f',
  warningSoft: '#322c1a',
  success: '#4ac26b',
};

/** System font stacks — the same families the app names, minus the app's own variables. */
const FONT_UI =
  "'Segoe UI Variable Text', 'Segoe UI', -apple-system, 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif";
const FONT_MONO = "'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', ui-monospace, monospace";

/** The complete stylesheet for one exported document. */
export function exportStylesheet(theme: ExportTheme): string {
  const p = theme === 'dark' ? DARK : LIGHT;
  return `:root {
  color-scheme: ${theme};
  --om-bg: ${p.bg};
  --om-bg-subtle: ${p.bgSubtle};
  --om-bg-elevated: ${p.bgElevated};
  --om-text: ${p.text};
  --om-text-muted: ${p.textMuted};
  --om-text-faint: ${p.textFaint};
  --om-border: ${p.border};
  --om-border-strong: ${p.borderStrong};
  --om-accent: ${p.accent};
  --om-code-bg: ${p.codeBg};
  --om-mark-bg: ${p.markBg};
  --om-error: ${p.error};
  --om-error-soft: ${p.errorSoft};
  --om-success: ${p.success};
  --om-font-ui: ${FONT_UI};
  --om-font-mono: ${FONT_MONO};
  --om-content-width: 46rem;
  --om-radius: 6px;
  --om-radius-sm: 4px;
}

*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--om-bg);
  color: var(--om-text);
  font-family: var(--om-font-ui);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

.om-doc {
  max-width: var(--om-content-width);
  margin: 0 auto;
  padding: 3.5rem 3rem 5rem;
  font-size: 16px;
  line-height: 1.75;
  letter-spacing: 0.01em;
  overflow-wrap: break-word;
}

/* ---- headings ---- */
.om-doc h1, .om-doc h2, .om-doc h3, .om-doc h4, .om-doc h5, .om-doc h6 {
  font-family: var(--om-font-ui);
  font-weight: 650;
  line-height: 1.3;
  margin: 1.6em 0 0.6em;
}
.om-doc h1 { font-size: 1.9em; margin-top: 0; padding-bottom: 0.3em; border-bottom: 1px solid var(--om-border); }
.om-doc h2 { font-size: 1.5em; padding-bottom: 0.24em; border-bottom: 1px solid var(--om-border); }
.om-doc h3 { font-size: 1.25em; }
.om-doc h4 { font-size: 1.08em; }
.om-doc h5, .om-doc h6 { font-size: 1em; color: var(--om-text-muted); }

/* ---- blocks ---- */
.om-doc p, .om-doc ul, .om-doc ol, .om-doc dl, .om-doc table, .om-doc blockquote, .om-doc figure {
  margin: 0 0 1em;
}
.om-doc a { color: var(--om-accent); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--om-accent) 35%, transparent); }
.om-doc strong { font-weight: 680; }
.om-doc mark { background: var(--om-mark-bg); color: inherit; padding: 0 2px; border-radius: 2px; }
.om-doc hr { border: none; border-top: 1px solid var(--om-border); margin: 2em 0; }

/* ---- lists, task lists, definition lists ---- */
.om-doc ul, .om-doc ol { padding-inline-start: 1.9em; }
.om-doc li { margin-bottom: 0.28em; }
.om-doc li > ul, .om-doc li > ol { margin-top: 0.28em; margin-bottom: 0; }
.om-doc li.task-list-item { list-style: none; margin-inline-start: -1.5em; }
.om-doc li.task-list-item input[type='checkbox'] { margin-inline-end: 0.5em; vertical-align: 0.05em; accent-color: var(--om-accent); }
.om-doc dt { font-weight: 650; margin-top: 0.6em; }
.om-doc dd { margin-inline-start: 1.6em; color: var(--om-text-muted); }

/* ---- blockquote, tables, footnotes ---- */
.om-doc blockquote { padding: 0.2em 0 0.2em 1.1em; border-inline-start: 3px solid var(--om-border-strong); color: var(--om-text-muted); }
.om-doc blockquote > :last-child { margin-bottom: 0; }
.om-doc table { border-collapse: collapse; display: block; max-width: 100%; overflow-x: auto; font-size: 0.94em; }
.om-doc th, .om-doc td { padding: 0.42em 0.85em; border: 1px solid var(--om-border); text-align: start; vertical-align: top; }
.om-doc thead th { background: var(--om-bg-subtle); font-weight: 650; }
.om-doc tbody tr:nth-child(even) { background: color-mix(in srgb, var(--om-bg-subtle) 55%, transparent); }
.om-doc .footnotes { margin-top: 2.4em; padding-top: 1em; border-top: 1px solid var(--om-border); font-size: 0.9em; color: var(--om-text-muted); }
.om-doc .footnotes-sep { display: none; }
.om-doc .footnote-backref { margin-inline-start: 0.35em; border: none; }

/* ---- inline code ---- */
.om-doc code {
  font-family: var(--om-font-mono);
  font-size: 0.88em;
  padding: 0.14em 0.36em;
  border-radius: var(--om-radius-sm);
  background: var(--om-code-bg);
}

/* ---- images ---- */
.om-doc img { max-width: 100%; height: auto; border-radius: var(--om-radius-sm); }
.om-doc img[data-om-missing='true'] {
  display: inline-block;
  min-width: 200px;
  min-height: 60px;
  border: 1px dashed var(--om-error);
  background: var(--om-error-soft);
}

/* ---- code blocks ---- */
.om-doc .om-code {
  position: relative;
  margin: 0 0 1.1em;
  border: 1px solid var(--om-border);
  border-radius: var(--om-radius);
  background: var(--om-code-bg);
  overflow: hidden;
}
.om-doc .om-code__pre { margin: 0; padding: 12px 14px; overflow-x: auto; font-size: 0.86em; line-height: 1.6; }
.om-doc .om-code__pre[data-om-lang-label]::before {
  content: attr(data-om-lang-label);
  display: block;
  margin-bottom: 6px;
  font-family: var(--om-font-ui);
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--om-text-faint);
}
.om-doc .om-code__code {
  font-family: var(--om-font-mono);
  background: none;
  padding: 0;
  display: block;
  white-space: pre;
}
/* Shiki's per-theme backgrounds were resolved away; the block chrome supplies the colour. */
.om-doc .om-code__pre .shiki { background: none; }

/* ---- math ---- */
.om-doc .om-math { display: inline-block; max-width: 100%; vertical-align: baseline; }
.om-doc .om-math--display { display: block; text-align: center; margin: 1em 0; overflow-x: auto; overflow-y: hidden; }
.om-doc .om-math mjx-container { display: inline-block; outline: none; }
.om-doc .om-math--display mjx-container { display: block; }
.om-doc .om-math--error {
  display: block;
  padding: 6px 10px;
  border-inline-start: 3px solid var(--om-error);
  background: var(--om-error-soft);
  border-radius: var(--om-radius-sm);
  text-align: start;
}
.om-doc .om-math--error merror { color: var(--om-error); font-family: var(--om-font-mono); font-size: 0.9em; }
.om-doc .om-math__source { font-family: var(--om-font-mono); font-size: 0.88em; color: var(--om-error); white-space: pre-wrap; overflow-wrap: anywhere; }

/* ---- mermaid ---- */
.om-doc .om-mermaid {
  margin: 1.2em 0;
  padding: 10px;
  border: 1px solid var(--om-border);
  border-radius: var(--om-radius);
  background: var(--om-bg-subtle);
  text-align: center;
  overflow-x: auto;
}
.om-doc .om-mermaid__canvas svg { max-width: 100%; height: auto; }
.om-doc .om-mermaid--error { border-color: var(--om-error); background: var(--om-error-soft); text-align: start; }
.om-doc .om-mermaid__source { margin: 0; font-family: var(--om-font-mono); font-size: 0.82em; white-space: pre-wrap; color: var(--om-error); }

/* ---- preserved source and frontmatter ---- */
.om-doc .om-preserved--comment, .om-doc .om-frontmatter { display: none; }
.om-doc .om-preserved__pre {
  font-family: var(--om-font-mono);
  font-size: 0.8em;
  color: var(--om-text-faint);
  white-space: pre-wrap;
  margin: 0;
}

/* ---- print / PDF ---- */
@media print {
  .om-doc { max-width: none; padding: 0; font-size: 11pt; }
  .om-doc h1, .om-doc h2, .om-doc h3, .om-doc h4 { break-after: avoid; }
  .om-doc pre, .om-doc table, .om-doc .om-math--display, .om-doc .om-mermaid { break-inside: avoid; }
  .om-doc a { border: none; color: inherit; }
  /* The export never contains app chrome, but a background keeps dark exports legible. */
  body { background: var(--om-bg); }
  @page { size: A4; margin: 16mm 14mm; }
}
`;
}

/**
 * Minimal `mjx-container` layout rules, used only when MathJax's own stylesheet cannot be
 * found in the live page. MathJax's rules are richer (they carry `overflow`, `min-width`
 * and the assistive-MathML switches), so the capture path is the one that matters.
 */
const MATHJAX_FALLBACK_CSS = `mjx-container[jax="SVG"] { direction: ltr; }
mjx-container[jax="SVG"] > svg { overflow: visible; vertical-align: middle; }
mjx-container[jax="SVG"][display="true"] { display: block; text-align: center; margin: 1em 0; }
mjx-container[jax="SVG"][display="true"] > svg { max-width: 100%; }
mjx-container[jax="SVG"] mjx-assistive-mml { display: none; }
`;

export interface MathJaxStylesheet {
  css: string;
  /** Where the rules came from — `fallback` means the live page had none to copy. */
  source: 'mathjax' | 'fallback';
}

/**
 * Returns MathJax's own stylesheet.
 *
 * MathJax injects a `<style>` element into the page when it boots, and the SVG output is
 * laid out by those rules — without them a display equation is not centred and an inline
 * one sits on the wrong baseline. Copying the element is the only way to export exactly what
 * the reader shows, so it is captured rather than re-approximated.
 */
export function mathJaxStylesheet(): MathJaxStylesheet {
  if (typeof document === 'undefined') return { css: MATHJAX_FALLBACK_CSS, source: 'fallback' };
  const captured = Array.from(document.querySelectorAll('style'))
    .map((element) => element.textContent ?? '')
    .filter((css) => css.includes('mjx-container'))
    .join('\n')
    .trim();
  if (captured === '') return { css: MATHJAX_FALLBACK_CSS, source: 'fallback' };
  return { css: captured, source: 'mathjax' };
}
