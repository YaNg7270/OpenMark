/**
 * Self-contained HTML export.
 *
 * The reading pipeline hands over a sanitised skeleton in which every expensive construct is
 * an **empty placeholder** (`data-om-math`, `data-om-mermaid`, `data-om-code`), because
 * typesetting is what makes a large document expensive to open. Export has the opposite
 * problem: the file has to be finished, with nothing left to load.
 *
 * Two entry points, one output:
 *
 *  - **Live DOM** (`liveRoot`): the reading view has already typeset what the reader is
 *    looking at. That output is the reference — MathJax's own SVG, Mermaid's own SVG with its
 *    internal `<style>`, Shiki's tokens — so it is copied out verbatim rather than
 *    re-derived. Lazy rendering leaves off-screen formulas empty, so anything missing is
 *    filled afterwards.
 *  - **Headless**: no live DOM given, so every placeholder is typeset here through the same
 *    MathJax/Mermaid/Shiki drivers the reader uses. This is the path for a document that was
 *    just parsed, or exported from a background view.
 *
 * Both paths converge on the same finishing steps: resolve Shiki's dual-theme variables to
 * one concrete palette, give each diagram an intrinsic size, inline local images, and check
 * the result for anything that could reach the network.
 */

import type { CodeBlock, MathExpression, MermaidDiagram, RenderResult } from '../markdown/types';
import { renderExpression } from '../math/mathjax';
import { highlightCode } from '../render/highlighter';
import { renderDiagram } from '../render/mermaid';
import { writeFile } from '../fs/fileService';
import { desktopAssetReader, inlineImages } from './assets';
import { resolveCodeTheme } from './code';
import { exportStylesheet } from './styles';
import {
  ExportError,
  asExportError,
  type ExportOutcome,
  type ExportReport,
  type ExportTheme,
  type HtmlExport,
  type HtmlFileExport,
  type SelfContainedCheck,
  type StandaloneHtmlOptions,
} from './types';

/**
 * The reading column in pixels, handed to MathJax so a long display equation breaks at the
 * width it will actually occupy instead of overflowing one line.
 *
 * Derived from the exported stylesheet rather than guessed: `max-width: 46rem` (736px at 16px,
 * the reading column) minus the 3rem of horizontal padding each side = 640px of content.
 * Getting this wrong is not fatal — an equation would break a little earlier or later than it
 * does in the reader — but an export should look like the document, not like an approximation.
 */
const CONTENT_WIDTH_PX = 46 * 16 - 2 * 3 * 16;

/** Diagram font, resolved from the app variable mermaid embeds in its SVG. */
const DIAGRAM_FONT_STACK =
  "'Segoe UI Variable Text', 'Segoe UI', -apple-system, 'Microsoft YaHei UI', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif";

/** Ids the parser generates (`math-1`, `mermaid-2`, `code-3`) — safe in an attribute selector. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Builds the complete `.html` file.
 *
 * Rejects when the document cannot be exported at all (no DOM, nothing parsed). Everything
 * that is merely *incomplete* — a missing figure, a formula MathJax refused — is reported in
 * [`ExportReport`] instead, because losing the export would be worse than losing one figure.
 */
export async function tryExportStandaloneHtml(
  options: StandaloneHtmlOptions,
): Promise<ExportOutcome<HtmlExport>> {
  try {
    return { ok: true, result: await buildStandaloneHtml(options) };
  } catch (error) {
    return { ok: false, error: asExportError(error) };
  }
}

/** The exported file as a string. See [`tryExportStandaloneHtml`] for the report. */
export async function exportStandaloneHtml(options: StandaloneHtmlOptions): Promise<string> {
  return (await buildStandaloneHtml(options)).html;
}

/**
 * Exports and writes the file through the shared file service.
 *
 * Reusing `writeFile` keeps the export on the same path as every other save: atomic replace
 * in the desktop app, a download in the browser.
 */
export async function exportStandaloneHtmlToFile(
  options: StandaloneHtmlOptions,
  outputPath: string,
): Promise<HtmlFileExport> {
  const { html, report } = await buildStandaloneHtml(options);
  const written = await writeFile(outputPath, html, { bom: false, eol: 'lf', makeBackup: false });
  return { path: written.path, size: written.size, report };
}

async function buildStandaloneHtml(options: StandaloneHtmlOptions): Promise<HtmlExport> {
  if (typeof document === 'undefined') {
    throw new ExportError('no-dom', 'exporting HTML needs a DOM');
  }
  const result = options.result;
  if (!result || typeof result.html !== 'string') {
    throw new ExportError('nothing-to-export', 'the document has not been parsed yet');
  }

  const theme: ExportTheme = options.theme ?? 'light';
  const title = resolveTitle(options, result);
  const report = createReport(title, theme);

  // Parsed into an *inert* document rather than a detached `<div>`: Chromium starts fetching
  // an `<img>` the moment its `src` is set, even when the element is not connected, and an
  // export must not fetch a remote image on the author's behalf just to look at it. Images in
  // a document with no browsing context are never loaded.
  const root = new DOMParser().parseFromString(result.html, 'text/html').body;

  adoptLiveContent(root, options.liveRoot ?? null, report);
  await fillPlaceholders(root, result, theme, report);
  resolveCodeTheme(root, theme);
  normalizeDiagrams(root);
  removeBlockToolbars(root);
  removeMathJaxCounters(root);
  await inlineImages(root, {
    documentPath: options.sourcePath,
    readAsset: options.readAsset ?? desktopAssetReader,
    report,
  });

  const wrapped = wrapDocument({
    title,
    lang: options.lang ?? 'zh-CN',
    theme,
    body: root.innerHTML,
    result,
  });

  // Last line of defence for the "no scripts" requirement: the sanitised skeleton cannot
  // contain one, but a self-contained file must be provably script-free rather than assumed
  // to be, so anything that slips through is removed and reported.
  const stripped = stripScripts(wrapped);
  if (stripped.removed > 0) {
    report.strippedScripts = stripped.removed;
    report.warnings.push(`removed ${stripped.removed} script tag(s) from the export`);
  }

  report.verification = verifySelfContained(stripped.html, report.remoteImages);
  if (!report.verification.selfContained) {
    for (const url of report.verification.unexpectedRequests) {
      report.warnings.push(`left an external request in the export: ${url}`);
    }
  }

  return { html: stripped.html, report };
}

// ------------------------------------------------------------ skeleton → content

/** Copies already-typeset content out of the live reading DOM, replacing the placeholders. */
function adoptLiveContent(
  root: HTMLElement,
  liveRoot: HTMLElement | null,
  report: ExportReport,
): void {
  if (!liveRoot) return;

  for (const placeholder of root.querySelectorAll<HTMLElement>('[data-om-math]')) {
    const live = findLive(liveRoot, 'data-om-math', placeholder.dataset['omMath']);
    if (!live || live.innerHTML.trim() === '') continue;
    placeholder.innerHTML = live.innerHTML;
    // `markFilled` before `copyState`, so the attribute order matches the headless path and
    // both entry points produce a byte-identical file for the same document.
    markFilled(placeholder);
    copyState(placeholder, live);
    report.reusedFromLiveDom.math++;
  }

  for (const placeholder of root.querySelectorAll<HTMLElement>('[data-om-mermaid]')) {
    const live = findLive(liveRoot, 'data-om-mermaid', placeholder.dataset['omMermaid']);
    const canvas = placeholder.querySelector<HTMLElement>('.om-mermaid__canvas');
    const liveCanvas = live?.querySelector<HTMLElement>('.om-mermaid__canvas');
    if (!canvas || !liveCanvas || liveCanvas.innerHTML.trim() === '') continue;
    canvas.innerHTML = liveCanvas.innerHTML;
    markFilled(placeholder);
    copyState(placeholder, live!);
    report.reusedFromLiveDom.mermaid++;
  }

  for (const placeholder of root.querySelectorAll<HTMLElement>('[data-om-code]')) {
    const live = findLive(liveRoot, 'data-om-code', placeholder.dataset['omCode']);
    const code = placeholder.querySelector<HTMLElement>('.om-code__code');
    const liveCode = live?.querySelector<HTMLElement>('.om-code__code');
    if (!code || !liveCode || liveCode.innerHTML.trim() === '') continue;
    code.innerHTML = liveCode.innerHTML;
    code.className = liveCode.className;
    const style = liveCode.getAttribute('style');
    if (style === null) code.removeAttribute('style');
    else code.setAttribute('style', style);
    const label = live
      ?.querySelector<HTMLElement>('.om-code__pre')
      ?.getAttribute('data-om-lang-label');
    const target = placeholder.querySelector<HTMLElement>('.om-code__pre');
    if (label && target) target.setAttribute('data-om-lang-label', label);
    markFilled(placeholder);
    report.reusedFromLiveDom.code++;
  }
}

/** Typesets whatever the live DOM did not provide, in document order. */
async function fillPlaceholders(
  root: HTMLElement,
  result: RenderResult,
  theme: ExportTheme,
  report: ExportReport,
): Promise<void> {
  const mathById = new Map(result.math.map((entry) => [entry.id, entry]));
  const mermaidById = new Map(result.mermaid.map((entry) => [entry.id, entry]));
  const codeById = new Map(result.code.map((entry) => [entry.id, entry]));

  // One query, so the order is exactly the document's order. MathJax's AMS numbering depends
  // on it, and a report that reads out of order is a report nobody can act on.
  for (const node of root.querySelectorAll<HTMLElement>(
    '[data-om-math],[data-om-mermaid],[data-om-code]',
  )) {
    if (node.dataset['omFilled'] === '1') continue;

    const math = mathById.get(node.dataset['omMath'] ?? '');
    if (math) {
      await fillMath(node, math, report);
      continue;
    }
    const diagram = mermaidById.get(node.dataset['omMermaid'] ?? '');
    if (diagram) {
      await fillMermaid(node, diagram, theme, report);
      continue;
    }
    const block = codeById.get(node.dataset['omCode'] ?? '');
    if (block) {
      await fillCode(node, block, report);
      continue;
    }
  }
}

/** Mirrors the reader's math fill, including its "a failed formula keeps its source" rule. */
async function fillMath(
  node: HTMLElement,
  expr: MathExpression,
  report: ExportReport,
): Promise<void> {
  markFilled(node);
  const outcome = await renderExpression(expr.tex, {
    display: expr.display,
    containerWidth: CONTENT_WIDTH_PX,
  });

  if (outcome.ok) {
    node.innerHTML = outcome.html;
    node.dataset['omState'] = 'ok';
    report.renderedDuringExport.math++;
    return;
  }

  node.dataset['omState'] = 'error';
  node.classList.add('om-math--error');
  node.innerHTML =
    outcome.html || `<span class="om-math__source">${escapeHtml(expr.raw)}</span>`;
  node.title = outcome.error.message;
  report.mathErrors.push({ id: expr.id, message: outcome.error.message });
}

/** Mirrors the reader's diagram fill, keeping the source when rendering fails. */
async function fillMermaid(
  node: HTMLElement,
  diagram: MermaidDiagram,
  theme: ExportTheme,
  report: ExportReport,
): Promise<void> {
  markFilled(node);
  const canvas = node.querySelector<HTMLElement>('.om-mermaid__canvas') ?? node;
  const outcome = await renderDiagram(diagram, theme === 'dark');

  if (outcome.ok) {
    canvas.innerHTML = outcome.svg;
    canvas.querySelector('svg')?.setAttribute('role', 'img');
    report.renderedDuringExport.mermaid++;
    return;
  }

  node.classList.add('om-mermaid--error');
  canvas.innerHTML = `<pre class="om-mermaid__source"><code>${escapeHtml(diagram.code)}</code></pre>`;
  report.mermaidErrors.push({
    id: diagram.id,
    message: outcome.error ?? 'Unknown Mermaid error',
  });
}

/** Mirrors the reader's code fill, hoisting Shiki's `<pre>` into the block chrome. */
async function fillCode(
  node: HTMLElement,
  block: CodeBlock,
  report: ExportReport,
): Promise<void> {
  markFilled(node);
  const code = node.querySelector<HTMLElement>('.om-code__code');
  if (!code) return;

  const { html } = await highlightCode(block.code, block.lang);
  const holder = document.createElement('div');
  holder.innerHTML = html;
  const shiki = holder.querySelector('pre');

  if (shiki) {
    code.innerHTML = shiki.innerHTML;
    if (shiki.className) code.className = `om-code__code ${shiki.className}`;
    const style = shiki.getAttribute('style');
    if (style) code.setAttribute('style', style);
  } else {
    code.innerHTML = html;
  }

  const lang = node.dataset['omLang'] ?? '';
  const pre = node.querySelector<HTMLElement>('.om-code__pre');
  if (lang && pre) pre.dataset['omLangLabel'] = lang;

  report.renderedDuringExport.code++;
}

function markFilled(node: HTMLElement): void {
  node.dataset['omFilled'] = '1';
}

/** Carries the reader's success/error state across so the export styles identically. */
function copyState(target: HTMLElement, live: HTMLElement): void {
  const state = live.dataset['omState'];
  if (state) target.dataset['omState'] = state;

  for (const name of ['om-math--error', 'om-mermaid--error']) {
    if (live.classList.contains(name)) target.classList.add(name);
  }
  const title = live.getAttribute('title');
  if (title) target.setAttribute('title', title);
}

function findLive(root: HTMLElement, attribute: string, id: string | undefined): HTMLElement | null {
  if (!id || !SAFE_ID.test(id)) return null;
  return root.querySelector<HTMLElement>(`[${attribute}="${id}"]`);
}

// ------------------------------------------------------------------- finishing

/**
 * Gives every diagram a size of its own.
 *
 * Mermaid is configured with `useMaxWidth: true` for the reader, which is right there — the
 * diagram should follow the reading column. Here it is not: the export has to stand on its
 * own without the app's stylesheet, so each SVG gets the intrinsic size from its own
 * `viewBox` (which is exactly the markup `useMaxWidth: false` produces) plus a `max-width`
 * cap so an over-wide diagram scales down instead of running off the page.
 *
 * The app's mermaid configuration is global and shared with the live view, so this is done by
 * rewriting the output rather than by re-initialising Mermaid with different options — that
 * would change what the reader sees.
 */
function normalizeDiagrams(root: HTMLElement): void {
  for (const svg of Array.from(root.querySelectorAll<SVGSVGElement>('.om-mermaid__canvas svg'))) {
    const holder = document.createElement('div');
    // The font mermaid embeds is an app CSS variable (`var(--om-font-ui)`); resolving it here
    // is what stops the exported diagram from falling back to an arbitrary default font.
    holder.innerHTML = svg.outerHTML.replaceAll('var(--om-font-ui)', DIAGRAM_FONT_STACK);
    const hardened = holder.querySelector('svg');
    if (!hardened) continue;

    const size = readViewBoxSize(hardened.getAttribute('viewBox'));
    if (size) {
      hardened.setAttribute('width', String(size.width));
      hardened.setAttribute('height', String(size.height));
      const existing = (hardened.getAttribute('style') ?? '').replace(/;?\s*$/, '');
      hardened.setAttribute(
        'style',
        existing === ''
          ? 'max-width: 100%; height: auto'
          : `${existing}; max-width: 100%; height: auto`,
      );
    }
    hardened.setAttribute('role', 'img');
    svg.replaceWith(hardened);
  }
}

/** An SVG `viewBox`'s width and height, when it has a usable one. */
function readViewBoxSize(viewBox: string | null): { width: number; height: number } | null {
  const parts = (viewBox ?? '').trim().split(/[\s,]+/);
  if (parts.length !== 4) return null;
  const width = Number(parts[2]);
  const height = Number(parts[3]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

/** The copy button lives in the toolbar and has no meaning in a static file. */
function removeBlockToolbars(root: HTMLElement): void {
  for (const toolbar of Array.from(root.querySelectorAll('.om-code__toolbar'))) {
    toolbar.remove();
  }
}

/**
 * Removes MathJax's `ctxtmenu_counter` from every container.
 *
 * It is MathJax's own bookkeeping for the right-click menu (which expression was attached
 * first, page-wide), so it is meaningless without MathJax's scripts — and worse than
 * meaningless: it makes the export depend on how many formulas the page had already typeset,
 * so exporting the same document twice would not produce the same file.
 */
function removeMathJaxCounters(root: HTMLElement): void {
  for (const container of Array.from(root.querySelectorAll('mjx-container[ctxtmenu_counter]'))) {
    container.removeAttribute('ctxtmenu_counter');
  }
}

/** Frontmatter title, else the first heading, else the file name. */
function resolveTitle(options: StandaloneHtmlOptions, result: RenderResult): string {
  const explicit = options.title?.trim();
  if (explicit) return explicit;

  const fromFrontmatter = readFrontmatterString(result.frontmatter, 'title');
  if (fromFrontmatter) return fromFrontmatter;

  const firstHeading = result.outline[0];
  const heading = (firstHeading?.plainText ?? firstHeading?.text ?? '').trim();
  if (heading) return heading;

  const name = options.sourcePath.split(/[\\/]/).pop() ?? options.sourcePath;
  return name.replace(/\.(md|markdown|mdown|mkd|txt)$/i, '') || name;
}

function readFrontmatterString(
  frontmatter: Record<string, unknown> | null,
  key: string,
): string | null {
  const value = frontmatter?.[key];
  if (typeof value === 'string' && value.trim() !== '') return value.trim();
  return null;
}

// -------------------------------------------------------------------- document

interface DocumentParts {
  title: string;
  lang: string;
  theme: ExportTheme;
  body: string;
  result: RenderResult;
}

function wrapDocument(parts: DocumentParts): string {
  const meta = [
    `<meta name="generator" content="OpenMark HTML export">`,
    metaTag('author', readFrontmatterString(parts.result.frontmatter, 'author')),
    metaTag('description', readFrontmatterString(parts.result.frontmatter, 'description')),
  ]
    .filter((line): line is string => line !== null)
    .join('\n');

  return `<!doctype html>
<html lang="${escapeAttribute(parts.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(parts.title)}</title>
${meta}
<style>
${exportStylesheet(parts.theme)}
</style>
</head>
<body>
<article class="om-doc">
${parts.body}
</article>
</body>
</html>
`;
}

function metaTag(name: string, value: string | null): string | null {
  if (value === null) return null;
  return `<meta name="${name}" content="${escapeAttribute(value)}">`;
}

// --------------------------------------------------------------- verification

const NAMESPACE_DECLARATION = /xmlns(?::[a-z]+)?="[^"]*"/gi;

/** Attribute names on which a browser fetches something. `a[href]` navigates, so it is not one. */
const REQUEST_ATTRIBUTES = ['src', 'srcset', 'poster', 'data'] as const;

/**
 * Checks the produced file the way a browser would read it.
 *
 * A URL that arrives as a hyperlink is not a request, so it is listed but does not make the
 * export non-self-contained; a remote *image* the source itself referenced is allowed for the
 * same reason. Anything else that would be fetched does, and is listed separately so the
 * caller can see exactly what to fix.
 */
function verifySelfContained(html: string, allowedRemote: readonly string[]): SelfContainedCheck {
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  const scriptTags = parsed.querySelectorAll('script').length;
  // `xmlns="http://www.w3.org/2000/svg"` reads as `http://` to a grep but is an identifier,
  // not a request; counting them separately is what makes that distinction auditable.
  const namespaceDeclarations = [...html.matchAll(NAMESPACE_DECLARATION)].length;

  const externalUrls = new Set<string>();
  const requests = new Set<string>();

  for (const element of parsed.querySelectorAll(
    `${REQUEST_ATTRIBUTES.map((name) => `[${name}]`).join(',')},link[href]`,
  )) {
    for (const name of REQUEST_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value) collectExternal(value, externalUrls, requests);
    }
    if (element.tagName.toLowerCase() === 'link') {
      const href = element.getAttribute('href');
      if (href) collectExternal(href, externalUrls, requests);
    }
  }

  for (const style of parsed.querySelectorAll('style')) {
    const css = style.textContent ?? '';
    for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
      if (match[1]) collectExternal(match[1], externalUrls, requests);
    }
    for (const match of css.matchAll(/@import\s+(?:url\()?\s*['"]([^'"]+)['"]/gi)) {
      if (match[1]) collectExternal(match[1], externalUrls, requests);
    }
  }

  // Links are listed for completeness — they are what a reader will click — but they cannot
  // make the file depend on the network to render.
  for (const anchor of parsed.querySelectorAll('a[href]')) {
    const href = anchor.getAttribute('href');
    if (href) collectExternal(href, externalUrls, new Set());
  }

  const requestList = [...requests];
  const unexpectedRequests = requestList.filter(
    (url) => !allowedRemote.some((allowed) => url === allowed || url.startsWith(allowed)),
  );

  return {
    scriptTags,
    externalUrls: [...externalUrls],
    externalRequests: requestList,
    unexpectedRequests,
    namespaceDeclarations,
    selfContained: scriptTags === 0 && unexpectedRequests.length === 0,
  };
}

function collectExternal(value: string, urls: Set<string>, requests: Set<string>): void {
  const trimmed = value.trim().replace(/^['"]|['"]$/g, '');
  // `data:` is inline content, and a bare fragment or relative path never leaves the file.
  if (trimmed === '' || /^data:/i.test(trimmed) || trimmed.startsWith('#')) return;
  if (!/^(https?:)?\/\//i.test(trimmed)) return;
  urls.add(trimmed);
  requests.add(trimmed);
}

function stripScripts(html: string): { html: string; removed: number } {
  let removed = 0;
  const stripped = html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, () => {
      removed++;
      return '';
    })
    .replace(/<script\b[^>]*>/gi, () => {
      removed++;
      return '';
    });
  return { html: stripped, removed };
}

// ------------------------------------------------------------------- reporting

function createReport(title: string, theme: ExportTheme): ExportReport {
  return {
    title,
    theme,
    reusedFromLiveDom: { math: 0, mermaid: 0, code: 0 },
    renderedDuringExport: { math: 0, mermaid: 0, code: 0 },
    inlinedImages: [],
    remoteImages: [],
    missingImages: [],
    mathErrors: [],
    mermaidErrors: [],
    strippedScripts: 0,
    warnings: [],
    verification: {
      scriptTags: 0,
      externalUrls: [],
      externalRequests: [],
      unexpectedRequests: [],
      namespaceDeclarations: 0,
      selfContained: false,
    },
  };
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;');
}
