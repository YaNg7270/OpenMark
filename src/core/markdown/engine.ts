import MarkdownIt from 'markdown-it';
import type { MarkdownIt as MarkdownItInstance, Token } from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';
import deflist from 'markdown-it-deflist';
import sub from 'markdown-it-sub';
import sup from 'markdown-it-sup';
import mark from 'markdown-it-mark';
import { parse as parseYaml } from 'yaml';
import { RenderCollector, excerpt } from './collector';
import { LineIndex, SourceLocator, normalizeEol } from './line-index';
import { mathPlugin, MATH_ENVIRONMENTS, MATH_META_KEY, type MathTokenMeta } from './math-plugin';
import { frontmatterPlugin, FRONTMATTER_META, type FrontmatterInfo } from './rules';
import { codePlaceholder, mathPlaceholder, mermaidPlaceholder, preservedPlaceholder } from './placeholders';
import type { Diagnostic, DocRange, OutlineEntry, RenderResult, RenderStats } from './types';
import { emptyStats } from './types';

/** Fence info strings that mean "diagram" rather than "code". */
const MERMAID_FENCES: Record<string, true> = { mermaid: true, mmd: true };
/** Fence info strings that mean "display math" rather than "code". */
const MATH_FENCES: Record<string, true> = { math: true, mathjax: true };

export interface OpenmarkEnv {
  /**
   * Index signatures so the env can be passed straight to markdown-it, whose `Env` is an
   * open record for plugins to put things in.
   */
  [key: string]: unknown;
  [key: symbol]: unknown;
  om: RenderCollector;
  index: LineIndex;
  frontmatter: FrontmatterInfo | null;
  frontmatterValue: Record<string, unknown> | null;
  /** Collector for outline entries; assembled in the post-pass. */
  outline: OutlineEntry[];
}

interface HeadingDraft {
  level: number;
  text: string;
  plainText: string;
  range: DocRange;
  tokenIndex: number;
}

/**
 * The anchor stem for a heading: lower-cased, punctuation stripped, whitespace collapsed.
 *
 * Punctuation is removed with a Unicode-aware class so CJK titles survive — a rule based on
 * ASCII alphanumerics would reduce every Chinese heading to the fallback string.
 */
export function headingSlugBase(text: string): string {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'heading'
  );
}

/**
 * Deterministic anchor id, de-duplicated within a document. Never produces an empty string.
 *
 * Collisions are resolved by suffixing a counter rather than by dropping the heading, so
 * every heading remains linkable.
 */
export function slugifyHeading(text: string, seen: Map<string, number>): string {
  const base = headingSlugBase(text);
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base}-${count}`;
}

/** CJK characters count individually; Latin runs count as words. */
export function countWords(text: string): { words: number; cjk: number; latin: number } {
  const cjk = text.match(/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af]/gu)?.length ?? 0;
  const latin = text.match(/[A-Za-z0-9][A-Za-z0-9'’_-]*/g)?.length ?? 0;
  return { words: cjk + latin, cjk, latin };
}

function plainTextOf(inlineToken: Token | undefined): string {
  if (!inlineToken?.children) return '';
  let out = '';
  for (const child of inlineToken.children) {
    if (child.type === 'text' || child.type === 'code_inline') out += child.content;
    else if (child.type === 'softbreak' || child.type === 'hardbreak') out += ' ';
  }
  return out;
}

/**
 * The post-parse pass. Walks block tokens (and their inline children) **in document
 * order** and:
 *
 * - assigns stable ids to every renderable construct,
 * - resolves exact source ranges — from `token.map` for blocks, and via a
 *   forward-only `SourceLocator` for inline math, whose offsets markdown-it does not
 *   expose,
 * - builds the heading outline and anchors,
 * - records constructs we deliberately do not interpret so they are never lost.
 *
 * Document order is guaranteed by markdown-it: `state.tokens` is flat and ordered,
 * and an `inline` token's children are ordered within it. Every collection here
 * depends on that, which is why the locator can be forward-only and cheap.
 */
function collectPass(state: { tokens: Token[]; src: string; env: OpenmarkEnv }): void {
  const { tokens, env } = state;
  const { om, index } = env;
  const locator = new SourceLocator(index, state.src);
  const headingDrafts: HeadingDraft[] = [];

  const locateBlock = (map: [number, number] | null): DocRange | null => {
    if (!map) return null;
    const { from, to } = index.spanForLines(map[0], map[1] - 1);
    return index.range(from, to);
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;

    switch (token.type) {
      case 'om_frontmatter': {
        const info = (token.meta as Record<string, unknown> | null)?.[FRONTMATTER_META] as FrontmatterInfo | undefined;
        if (info) {
          env.frontmatter = info;
          env.frontmatterValue = tryParseYaml(info.body, om, token.map ? locateBlock(token.map) : null);
          om.addPreserved({
            kind: 'frontmatter',
            raw: info.raw,
            range: locateBlock(token.map) ?? emptyRange(),
          });
        }
        break;
      }

      case 'math_block': {
        const meta = token.meta as MathTokenMeta | null;
        const src = meta?.[MATH_META_KEY];
        const range = locateBlock(token.map);
        if (src && range) {
          const expr = om.addMath({
            tex: src.tex,
            raw: src.raw,
            display: true,
            delimiter: src.delimiter,
            range,
            order: range.start.offset,
            ...(src.environment ? { environment: src.environment } : {}),
          });
          meta.omId = expr.id;
          checkMathSource(om, expr.id, src.tex, range);
        }
        break;
      }

      case 'fence': {
        const range = locateBlock(token.map);
        if (!range) break;
        const info = token.info.trim();
        const lang = (info.split(/\s+/)[0] ?? '').toLowerCase();

        if (MATH_FENCES[lang] === true) {
          const expr = om.addMath({
            tex: token.content.replace(/\n$/, ''),
            raw: token.content,
            display: true,
            delimiter: 'math-fence',
            range,
            order: range.start.offset,
          });
          token.meta = { ...(token.meta as object), omId: expr.id, omFence: 'math' };
          checkMathSource(om, expr.id, expr.tex, range);
          break;
        }

        if (MERMAID_FENCES[lang] === true) {
          const kind = detectMermaidKind(token.content);
          const diagram = om.addMermaid({ code: token.content, kind, range, order: range.start.offset });
          token.meta = { ...(token.meta as object), omId: diagram.id, omFence: 'mermaid' };
          break;
        }

        const block = om.addCode({
          code: token.content,
          lang,
          info,
          range,
          order: range.start.offset,
          plain: false,
        });
        token.meta = { ...(token.meta as object), omId: block.id, omFence: 'code' };
        break;
      }

      case 'heading_open': {
        const inline = tokens[i + 1];
        const level = Number(token.tag.slice(1)) || 1;
        const text = plainTextOf(inline as never);
        const range = locateBlock(token.map) ?? emptyRange();
        headingDrafts.push({ level, text, plainText: text, range, tokenIndex: i });
        break;
      }

      case 'html_block': {
        if (isComment(token.content)) {
          const range = locateBlock(token.map) ?? emptyRange();
          const preserved = om.addPreserved({ kind: 'html-comment', raw: token.content, range });
          token.meta = { ...(token.meta as object), omId: preserved.id, omPreserved: 'html-comment' };
        }
        break;
      }

      case 'inline': {
        const children = token.children;
        if (!children) break;
        const bounds = token.map ? index.spanForLines(token.map[0], token.map[1] - 1) : undefined;
        for (const child of children) {
          if (child.type === 'math_inline') {
            const meta = child.meta as MathTokenMeta | null;
            const src = meta?.[MATH_META_KEY];
            if (!src) continue;
            const hit = locator.locate(src.raw, bounds);
            const range = hit?.range ?? emptyRange();
            const expr = om.addMath({
              tex: src.tex,
              raw: src.raw,
              display: src.display,
              delimiter: src.delimiter,
              range,
              order: range.start.offset,
            });
            meta.omId = expr.id;
            checkMathSource(om, expr.id, src.tex, range);
          } else if (child.type === 'html_inline' && isComment(child.content)) {
            const hit = locator.locate(child.content, bounds);
            const range = hit?.range ?? emptyRange();
            const preserved = om.addPreserved({ kind: 'html-comment', raw: child.content, range });
            child.meta = { ...(child.meta as object), omId: preserved.id, omPreserved: 'html-comment' };
          }
        }
        break;
      }

      case 'code_block': {
        // Indented code blocks are real code; give them an id so the same lazy
        // highlighter handles them and the copy button works.
        const range = locateBlock(token.map);
        if (!range) break;
        const block = om.addCode({
          code: token.content,
          lang: '',
          info: '',
          range,
          order: range.start.offset,
          plain: true,
        });
        token.meta = { ...(token.meta as object), omId: block.id, omFence: 'code' };
        locator.locate(token.content, index.spanForLines(token.map![0], token.map![1] - 1));
        break;
      }

      default:
        break;
    }
  }

  // Headings: assign one deterministic anchor per heading, then nest the flat list.
  const seenSlugs = new Map<string, number>();
  const flatOutline: OutlineEntry[] = [];
  for (const draft of headingDrafts) {
    const base = headingSlugBase(draft.plainText);
    const isDuplicate = seenSlugs.has(base);
    const slug = slugifyHeading(draft.plainText, seenSlugs);
    const id = `om-h-${slug}`;
    if (isDuplicate) {
      om.report('duplicate-heading-anchor', 'info', `Duplicate heading text; anchor suffixed to stay unique`, draft.range, {
        source: 'markdown',
        excerpt: excerpt(base, 60),
        detail: `已有同名标题，本标题的锚点被改为 \`${id}\`，以避免链接指向错误章节。`,
      });
    }
    tokens[draft.tokenIndex]!.attrSet('id', id);
    flatOutline.push({
      id,
      level: draft.level,
      text: draft.text,
      plainText: draft.plainText,
      range: draft.range,
      children: [],
    });
  }
  env.outline = nestOutline(flatOutline);

  // Runs here rather than in a separate pass because the token stream is only available
  // during parsing, and a second parse just to inspect links would double the cost.
  remoteResourceDiagnostics(tokens, om, index);
}

/**
 * Converts a document-ordered heading list into a tree using a level stack, so a
 * `h2 → h4` jump (skipped level) still nests under the `h2` rather than being lost.
 */
export function nestOutline(flat: OutlineEntry[]): OutlineEntry[] {
  const roots: OutlineEntry[] = [];
  const stack: OutlineEntry[] = [];
  for (const entry of flat) {
    while (stack.length > 0 && stack[stack.length - 1]!.level >= entry.level) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(entry);
    else roots.push(entry);
    stack.push(entry);
  }
  return roots;
}

function emptyRange(): DocRange {
  const p = { line: 1, column: 1, offset: 0 };
  return { start: p, end: p };
}

function isComment(html: string): boolean {
  const t = html.trim();
  return t.startsWith('<!--') && t.endsWith('-->');
}

/**
 * Emits the placeholder for a construct that the collect pass classified. The
 * classification lives on `token.meta` so the renderer stays a pure function of the
 * token, and an unresolved id degrades to an empty container rather than throwing.
 */
function renderPlaceholderToken(token: Token): string {
  const meta = token.meta as { omId?: string; omFence?: string } | null;
  const id = meta?.omId ?? '';
  if (meta?.omFence === 'mermaid') return mermaidPlaceholder(id, detectMermaidKind(token.content));
  if (meta?.omFence === 'math') return mathPlaceholder(id, true);
  const lang = (token.info.trim().split(/\s+/)[0] ?? '').toLowerCase();
  return codePlaceholder(id, lang);
}

export function detectMermaidKind(code: string): string {
  const first = code
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('%%'));
  if (!first) return 'unknown';
  const head = first.split(/[\s({[]/)[0] ?? 'unknown';
  return head || 'unknown';
}

function tryParseYaml(
  body: string,
  om: RenderCollector,
  range: DocRange | null,
): Record<string, unknown> | null {
  if (!body.trim()) return null;
  try {
    const value = parseYaml(body, { maxAliasCount: 100 });
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
    return null;
  } catch (err) {
    om.report('invalid-frontmatter', 'warning', 'Frontmatter is not valid YAML', range ?? emptyRange(), {
      source: 'markdown',
      detail: err instanceof Error ? err.message : String(err),
      excerpt: excerpt(body),
    });
    return null;
  }
}

/**
 * Cheap, non-authoritative LaTeX sanity checks used to seed the diagnostics panel
 * before MathJax runs. MathJax is the authority on whether an expression renders;
 * this only catches the mistakes that are certain without a typesetter.
 */
function checkMathSource(om: RenderCollector, mathId: string, tex: string, range: DocRange): void {
  unsupportedEnvironmentDiagnostic(om, mathId, tex, range);
  let depth = 0;
  for (let i = 0; i < tex.length; i++) {
    const c = tex[i]!;
    if (c === '\\') {
      i++; // a backslash always binds the next character, so `\{` never opens a group
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth < 0) {
        om.report('math-unbalanced-braces', 'error', 'Unmatched closing brace in formula', range, {
          source: 'math',
          mathId,
          excerpt: excerpt(tex),
          detail: 'A `}` appears without a matching `{`.',
        });
        return;
      }
    }
  }
  if (depth > 0) {
    om.report('math-unbalanced-braces', 'error', `Formula has ${depth} unclosed \`{\``, range, {
      source: 'math',
      mathId,
      excerpt: excerpt(tex),
      detail: 'Braces must balance; an unclosed group makes the whole formula fail to render.',
    });
  }
}

/** Diagnostics for structural markdown problems that markdown-it silently accepts. */
function structuralDiagnostics(source: string, om: RenderCollector, index: LineIndex): void {
  const lines = source.split('\n');
  let fenceDepth = 0;
  let fenceChar = '';
  let fenceStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (!m) continue;
    const ticks = m[1]!;
    if (fenceDepth === 0) {
      fenceDepth = 1;
      fenceChar = ticks[0]!;
      fenceStart = i;
      continue;
    }
    if (ticks[0] === fenceChar) fenceDepth = 0;
  }

  if (fenceDepth > 0) {
    const from = index.lineStart(fenceStart);
    const to = index.lineEnd(lines.length - 1);
    om.report('unclosed-fence', 'error', `Unclosed code fence opened on line ${fenceStart + 1}`, index.range(from, to), {
      source: 'markdown',
      excerpt: excerpt(lines[fenceStart]!),
      detail: `The fence starting with \`${fenceChar.repeat(3)}\` is never closed, so the rest of the file is treated as code.`,
    });
  }

  // A `$$` that is never closed usually means the author lost a formula.
  const dollarPairs = countUnescaped(source, '$$');
  if (dollarPairs % 2 === 1) {
    const offset = source.lastIndexOf('$$');
    om.report('unclosed-math', 'error', 'Unclosed display-math delimiter `$$`', index.range(offset, offset + 2), {
      source: 'math',
      excerpt: excerpt(source.slice(offset, offset + 60)),
      detail: 'An odd number of `$$` markers was found. Add the missing closer or escape it as `\\$\\$`.',
    });
  }

  /*
   * Tab-indented list markers.
   *
   * CommonMark expands a tab to the next multiple of four, so a list indented with tabs
   * nests to a different depth than the author sees in their editor. The parser is not
   * wrong, but the result surprises people, and it is the single most common cause of
   * "my nested list flattened itself".
   */
  const tabList = /^\t+[ \t]*(?:[-*+]|\d+[.)])[ \t]+\S/;
  for (let i = 0; i < lines.length; i++) {
    if (!tabList.test(lines[i]!)) continue;
    const from = index.lineStart(i);
    om.report('tab-indent-in-list', 'warning', 'List indented with a tab character', index.range(from, index.lineEnd(i)), {
      source: 'markdown',
      excerpt: excerpt(lines[i]!),
      detail:
        'CommonMark expands tabs to a multiple of four columns, which can nest this item differently than expected. Prefer spaces.',
    });
    break; // One report per document keeps the panel readable.
  }
}

/**
 * Reports resources that would require the network.
 *
 * OpenMark is offline-first: a document referencing a remote image will show a hole where
 * the figure should be, and the reader deserves to know why rather than assuming the file
 * failed to load. The check is a diagnostic, never a rewrite — the source is untouched.
 */
function remoteResourceDiagnostics(tokens: Token[], om: RenderCollector, index: LineIndex): void {
  const seen = new Set<string>();

  const walk = (list: Token[]): void => {
    for (const token of list) {
      const isImage = token.type === 'image';
      const isLink = token.type === 'link_open';
      if (isImage || isLink) {
        const raw = isImage ? token.attrGet('src') : token.attrGet('href');
        const target = raw === null ? '' : String(raw);
        if (/^https?:\/\//i.test(target) && !seen.has(target)) {
          seen.add(target);
          const range = token.map ? index.range(index.lineStart(token.map[0]), index.lineEnd(token.map[0])) : emptyRange();
          om.report(
            isImage ? 'image-remote' : 'link-remote',
            'info',
            isImage ? 'Image is hosted remotely' : 'Link points to an external site',
            range,
            {
              source: 'asset',
              excerpt: excerpt(target, 90),
              detail: isImage
                ? '离线阅读时该图片无法显示。可将图片下载到文档所在目录并使用相对路径。'
                : '外部链接将在系统浏览器中打开。',
            },
          );
        }
      }
      if (token.children) walk(token.children);
    }
  };

  walk(tokens);
}

/**
 * Flags `\begin{env}` for environments this build does not recognise.
 *
 * MathJax would fail on them anyway, but only at typeset time and with a message that does
 * not say what *is* supported. Catching it at parse time turns "it just shows an error"
 * into an actionable hint.
 */
function unsupportedEnvironmentDiagnostic(om: RenderCollector, mathId: string, tex: string, range: DocRange): void {
  const pattern = /\\begin\{([a-zA-Z*]+)\}/g;
  let match = pattern.exec(tex);
  while (match) {
    const env = match[1]!;
    if (!(env in MATH_ENVIRONMENTS)) {
      om.report('math-unsupported-environment', 'warning', `Unrecognised math environment \`${env}\``, range, {
        source: 'math',
        mathId,
        excerpt: excerpt(match[0], 60),
        detail: '该环境不在支持列表中，MathJax 可能无法渲染。请检查拼写或改用受支持的写法。',
      });
      return;
    }
    match = pattern.exec(tex);
  }
}

function countUnescaped(src: string, needle: string): number {
  let count = 0;
  let idx = src.indexOf(needle);
  while (idx >= 0) {
    let backslashes = 0;
    for (let i = idx - 1; i >= 0 && src.charCodeAt(i) === 0x5c; i--) backslashes++;
    if (backslashes % 2 === 0) count++;
    idx = src.indexOf(needle, idx + needle.length);
  }
  return count;
}

export interface EngineOptions {
  /** Render inline HTML in the output (it is sanitized later). Default true. */
  html?: boolean;
  /** Convert bare URLs to links (GFM autolink). Default true. */
  linkify?: boolean;
  /** Treat a single newline as `<br>`. Default false, matching CommonMark. */
  breaks?: boolean;
  /** Add `disabled` to task-list checkboxes. Default true for reading. */
  taskListDisabled?: boolean;
}

/**
 * Builds the markdown-it instance used for *reading*.
 *
 * `html` stays enabled so authors get `<br>`, `<sub>`, `<kbd>`, `<details>` etc., and
 * safety is enforced by sanitising the produced HTML (see `render.ts`). Crucially,
 * the expensive placeholders (math, Mermaid, code) are **empty at this stage**, so no
 * untrusted markup ever reaches the DOM through them.
 */
export function createEngine(options: EngineOptions = {}): MarkdownItInstance {
  const md = new MarkdownIt({
    html: options.html ?? true,
    linkify: options.linkify ?? true,
    breaks: options.breaks ?? false,
    typographer: false,
    // No `highlight` option: highlighting is done lazily by the code placeholder.
  });

  md.use(taskLists, { enabled: false, label: true, labelAfter: true });
  md.use(footnote);
  md.use(deflist);
  md.use(sub);
  md.use(sup);
  md.use(mark);
  md.use(frontmatterPlugin);
  md.use(mathPlugin, { renderPlaceholder: mathPlaceholder });

  // `math_block`/`math_inline` renderers come from the math plugin; the rest of the
  // second-pass constructs share one renderer because they differ only by placeholder.
  md.renderer.rules['fence'] = (tokens, idx): string => renderPlaceholderToken(tokens[idx]!);
  md.renderer.rules['code_block'] = (tokens, idx): string => renderPlaceholderToken(tokens[idx]!);

  md.renderer.rules['html_block'] = (tokens, idx): string => {
    const meta = tokens[idx]!.meta as { omId?: string; omPreserved?: string } | null;
    if (meta?.omPreserved === 'html-comment') return preservedPlaceholder(meta.omId ?? '', 'comment');
    return tokens[idx]!.content;
  };

  md.renderer.rules['html_inline'] = (tokens, idx): string => {
    const meta = tokens[idx]!.meta as { omId?: string; omPreserved?: string } | null;
    if (meta?.omPreserved === 'html-comment') return preservedPlaceholder(meta.omId ?? '', 'comment');
    return tokens[idx]!.content;
  };

  /*
   * The collect pass needs a line index and a collector. `parseDocument` supplies both
   * through `env`, but `engine.render(src)` is a perfectly reasonable call for a consumer
   * that only wants HTML — and it would otherwise crash deep inside the pass. Creating the
   * two objects on demand keeps the engine self-sufficient: the ids and diagnostics are
   * still produced, they are simply left in `env` for anyone who looks.
   */
  md.core.ruler.after('inline', 'openmark_collect', (state) => {
    const env = state.env as unknown as OpenmarkEnv;
    if (!env.index) env.index = new LineIndex(state.src);
    if (!env.om) env.om = new RenderCollector(env.index);
    if (!env.outline) env.outline = [];
    collectPass({ tokens: state.tokens, src: state.src, env });
  });

  return md;
}

export interface ParseOptions extends EngineOptions {
  /** Keep `\r\n` handling consistent with the file; the reader normalises internally. */
  sourcePath?: string;
}

export interface ParsedDocument extends RenderResult {
  /** Normalised source (LF) that the parse tree's offsets refer to. */
  normalizedSource: string;
}

export interface ParseHooks {
  /** Injected so the sanitiser can live in the browser layer and stay testable. */
  sanitizeHtml?: (html: string) => { html: string; removed: string[] };
}

/**
 * Parses a document to HTML plus the registries needed to finish rendering it.
 * Pure and synchronous: everything expensive (MathJax, Mermaid, Shiki) happens later.
 */
export function parseDocument(source: string, engine: MarkdownItInstance, hooks: ParseHooks = {}): ParsedDocument {
  const startedAt = performance.now();
  const normalized = normalizeEol(source);
  const index = new LineIndex(normalized);
  const collector = new RenderCollector(index);
  const env: OpenmarkEnv = {
    om: collector,
    index,
    frontmatter: null,
    frontmatterValue: null,
    outline: [],
  };

  structuralDiagnostics(normalized, collector, index);

  let html = engine.render(normalized, env);
  if (hooks.sanitizeHtml) {
    const result = hooks.sanitizeHtml(html);
    html = result.html;
    for (const removed of result.removed) {
      collector.report('html-sanitized', 'warning', `Removed unsafe HTML: <${removed}>`, emptyRange(), {
        source: 'markdown',
        detail: 'The element is preserved in the source file but is not rendered.',
      });
    }
  }

  const { words, cjk, latin } = countWords(stripHtml(html));
  const stats: RenderStats = {
    ...emptyStats(),
    sourceBytes: new TextEncoder().encode(source).length,
    sourceLines: index.lineCount,
    parseMs: performance.now() - startedAt,
    mathCount: collector.math.length,
    mermaidCount: collector.mermaid.length,
    codeCount: collector.code.length,
    headingCount: countOutline(env.outline),
    wordCount: words,
    // ~400 CJK glyphs/min and ~220 English words/min, blended.
    readingMinutes: Math.max(1, Math.round(cjk / 400 + latin / 220)),
  };

  return {
    html,
    math: collector.math,
    mermaid: collector.mermaid,
    code: collector.code,
    outline: env.outline,
    preserved: collector.preserved,
    diagnostics: sortDiagnostics(collector.diagnostics),
    stats,
    frontmatter: env.frontmatterValue,
    normalizedSource: normalized,
  };
}

function countOutline(entries: OutlineEntry[]): number {
  let n = 0;
  for (const e of entries) n += 1 + countOutline(e.children);
  return n;
}

function sortDiagnostics(items: Diagnostic[]): Diagnostic[] {
  const rank: Record<string, number> = { error: 0, warning: 1, info: 2 };
  return [...items].sort((a, b) => {
    const byLine = a.range.start.line - b.range.start.line;
    return byLine !== 0 ? byLine : rank[a.severity]! - rank[b.severity]!;
  });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ');
}
