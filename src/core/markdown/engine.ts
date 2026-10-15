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
import { LineIndex, SourceLocator } from './line-index';
import { normalizeEol } from '@/core/fs/encoding';
import { mathPlugin, MATH_ENVIRONMENTS, MATH_META_KEY, type MathTokenMeta } from './math-plugin';
import { frontmatterPlugin, FRONTMATTER_META, type FrontmatterInfo } from './rules';
import { codePlaceholder, mathPlaceholder, mermaidPlaceholder, preservedPlaceholder } from './placeholders';
import type { SanitizeFinding } from './sanitize';
import { assetDiagnostics, type AssetStatus } from '@/core/diagnostics/assets';
import type {
  Diagnostic,
  DocRange,
  OutlineEntry,
  ParsedDocument,
  RenderStats,
  SourceBlock,
  SourceBlockKind,
} from './types';
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
        collectRawImages(token.content, token, om, index);
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
          } else if (child.type === 'image') {
            const raw = child.attrGet('src');
            const alt = child.attrGet('alt');
            const hit = locator.locate(String(raw ?? ''), bounds);
            if (hit) {
              om.addImage({
                path: String(raw ?? ''),
                alt: alt === null ? '' : String(alt),
                range: hit.range,
              });
            }
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
  unbalancedEnvironmentDiagnostic(om, mathId, tex, range);
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
 * Turns the sanitiser's findings into reader-facing diagnostics.
 *
 * A removed `<script>` is reported separately from other sanitisation because it is a
 * different kind of statement: not "this markup was dropped" but "this file tried to execute
 * code". A reader opening an untrusted document deserves to know which happened.
 *
 * The diagnostic's position is the first occurrence in the source, so the panel can jump to
 * it rather than pointing at the top of the file.
 */
function reportSanitizerFindings(
  om: RenderCollector,
  findings: readonly SanitizeFinding[],
  index: LineIndex,
  source: string,
): void {
  const PATTERNS: Record<SanitizeFinding, RegExp> = {
    script: /<\s*script[\s>]/i,
    style: /<\s*style[\s>]/i,
    frame: /<\s*(?:iframe|frame|frameset|embed)[\s>]/i,
    object: /<\s*object[\s>]/i,
    form: /<\s*form[\s>]/i,
    meta: /<\s*(?:meta|base|link)[\s>]/i,
    svg: /<\s*svg[\s>]/i,
    'event-handler': /\son[a-z]+\s*=/i,
    'unsafe-url': /\b(?:href|src|xlink:href)\s*=\s*["']?\s*(?:javascript|vbscript|file|data:text\/html)/i,
  };
  const LABELS: Record<SanitizeFinding, string> = {
    script: '内联脚本',
    style: '内联样式表',
    frame: '内嵌框架',
    object: '内嵌对象',
    form: '表单',
    meta: '文档级元信息',
    svg: '内嵌 SVG',
    'event-handler': '事件处理属性',
    'unsafe-url': '不安全的链接地址',
  };

  for (const finding of findings) {
    const match = PATTERNS[finding].exec(source);
    const offset = match ? match.index : 0;
    const line = index.lineAt(offset);
    const range = index.range(offset, Math.min(offset + (match?.[0].length ?? 1), source.length));
    om.report(
      finding === 'script' ? 'script-removed' : 'html-sanitized',
      finding === 'script' ? 'error' : 'warning',
      `已移除${LABELS[finding]}（第 ${line} 行）`,
      range,
      {
        source: 'markdown',
        excerpt: excerpt(source.slice(offset, offset + 80)),
        detail:
          finding === 'script'
            ? '源文件中的该脚本不会被执行，也不会被渲染。原始内容仍完整保留在文件中。'
            : '该内容不会显示，但原始文本仍完整保留在文件中，保存时不会被修改。',
      },
    );
  }
}

/**
 * Reports reference-style links whose label is never defined.
 *
 * Only the unambiguous forms are checked — `[text][label]` and `[text][]` — because a
 * shortcut reference `[label]` is indistinguishable from ordinary brackets in prose. Without
 * a definition, markdown-it renders the markup as literal text, which is rarely what the
 * author intended and is exactly the silent failure this diagnostic exists to surface.
 */
function referenceLinkDiagnostics(
  source: string,
  references: Record<string, unknown> | undefined,
  om: RenderCollector,
  index: LineIndex,
): void {
  const defined = new Set(Object.keys(references ?? {}).map((key) => key.toLowerCase()));
  const pattern = /\]\[([^\]\n]*)\]/g;
  const reported = new Set<string>();

  let match = pattern.exec(source);
  while (match) {
    const label = match[1]!;
    const offset = match.index;
    match = pattern.exec(source);

    // `[text][]` collapses to `[text]`, so an empty label is not a dangling reference.
    if (label === '') continue;
    if (defined.has(label.toLowerCase())) continue;
    if (reported.has(label)) continue;
    reported.add(label);

    om.report(
      'dangling-reference-link',
      'warning',
      `Reference link \`${label}\` is never defined`,
      index.range(offset, offset + label.length + 4),
      {
        source: 'markdown',
        excerpt: excerpt(source.slice(offset, offset + 60)),
        detail: '该引用式链接没有对应的定义（`[label]: url`），因此会按普通文本显示。',
      },
    );
  }
}

/**
 * Blanks out fenced code blocks, preserving line numbering.
 *
 * Structural checks must not fire on examples of malformed markup that appear inside a code
 * block — a document *about* unclosed formulas should not itself be reported as containing
 * one. Replacing the bodies with spaces rather than deleting the lines keeps every offset and
 * line number valid for the diagnostics that use the result.
 */
function blankFencedCode(source: string): string {
  const lines = source.split('\n');
  let fence: string | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const match = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (match) {
      const marker = match[1]!;
      if (fence === null) fence = marker[0]!;
      else if (marker[0] === fence) fence = null;
      lines[i] = ' '.repeat(line.length);
      continue;
    }
    if (fence !== null) lines[i] = ' '.repeat(line.length);
  }
  return lines.join('\n');
}

/**
 * Reports an HTML comment that is opened and never closed.
 *
 * markdown-it treats the unterminated `<!--` as ordinary text, so the author's intent — to
 * hide a section — silently fails and their notes render as prose. That is worth saying out
 * loud, and it is cheap to detect.
 */
function unclosedCommentDiagnostics(source: string, om: RenderCollector, index: LineIndex): void {
  const text = blankFencedCode(source);
  const open = text.indexOf('<!--');
  if (open < 0) return;
  // A comment may only be closed by the next `-->`; anything after a second `<!--` belongs to
  // that one, so only the last unmatched opener matters.
  let cursor = open;
  let unmatched = -1;
  while (cursor >= 0) {
    const close = text.indexOf('-->', cursor + 4);
    if (close < 0) {
      unmatched = cursor;
      break;
    }
    cursor = text.indexOf('<!--', close + 3);
  }
  if (unmatched < 0) return;

  om.report('unclosed-html-comment', 'warning', 'HTML comment is never closed', index.range(unmatched, unmatched + 4), {
    source: 'markdown',
    excerpt: excerpt(source.slice(unmatched, unmatched + 60)),
    detail: '缺少 `-->`，因此注释内容会按普通文本渲染，而不是被隐藏。',
  });
}

/**
 * Reports footnote labels that are defined more than once.
 *
 * markdown-it keeps the last definition and drops the earlier one without a word, so a
 * document can lose content that the author believes is present.
 */
function duplicateFootnoteDiagnostics(source: string, om: RenderCollector, index: LineIndex): void {
  const text = blankFencedCode(source);
  const pattern = /^ {0,3}\[\^([^\]]+)\]:/gm;
  const seen = new Map<string, number>();
  let match = pattern.exec(text);
  let reported = 0;

  while (match && reported < 3) {
    const label = match[1]!;
    const offset = match.index;
    const previous = seen.get(label);
    if (previous === undefined) {
      seen.set(label, offset);
    } else {
      reported++;
      om.report('duplicate-footnote', 'warning', `Footnote \`${label}\` is defined more than once`, index.range(offset, offset + match[0].length), {
        source: 'markdown',
        excerpt: excerpt(match[0] + source.slice(offset + match[0].length, offset + match[0].length + 40), 70),
        detail: `同一标签在第 ${index.lineAt(previous)} 行已经定义过；渲染时只保留最后一次定义，前面的内容会丢失。`,
      });
    }
    match = pattern.exec(text);
  }
}

/**
 * Reports a setext underline under a line far too long to be a heading.
 *
 * `text\n---` is a level-two heading by specification. When the "text" is a paragraph-length
 * sentence, the author almost certainly meant a thematic break and typed one newline too few,
 * and the result is a giant bold line instead of a separator.
 */
function setextAmbiguityDiagnostics(source: string, om: RenderCollector, index: LineIndex): void {
  const lines = blankFencedCode(source).split('\n');
  const original = source.split('\n');
  let offset = 0;
  let reported = 0;

  for (let i = 1; i < lines.length && reported < 3; i++) {
    const lineStart = offset;
    offset += lines[i - 1]!.length + 1;

    const underline = /^ {0,3}(=+|-+)\s*$/.exec(lines[i]!);
    if (!underline) continue;
    // `---` after a blank line is a thematic break, not an underline; only a directly
    // adjacent line can become a heading.
    if (lines[i - 1]!.trim() === '') continue;
    if (original[i - 1]!.length <= 80) continue;

    reported++;
    om.report('setext-heading-ambiguity', 'info', 'Long line followed by an underline becomes a heading', index.range(lineStart, lineStart + lines[i - 1]!.length), {
      source: 'markdown',
      excerpt: excerpt(original[i - 1]!, 80),
      detail: '该行与下一行的下划线会被解析为一个二级标题。若本意是分隔线，请在两者之间保留一个空行。',
    });
  }
}

/**
 * Reports `\begin{env}` / `\end{env}` pairs that do not match inside one formula.
 *
 * Distinct from `math-unsupported-environment`, which flags an environment we do not
 * recognise at all: this is about a *pair* being malformed, which MathJax reports only as a
 * generic parse failure at render time.
 */
function unbalancedEnvironmentDiagnostic(om: RenderCollector, mathId: string, tex: string, range: DocRange): void {
  const begins = new Map<string, number>();
  const ends = new Map<string, number>();
  for (const match of tex.matchAll(/\\begin\{([a-zA-Z*]+)\}/g)) {
    begins.set(match[1]!, (begins.get(match[1]!) ?? 0) + 1);
  }
  for (const match of tex.matchAll(/\\end\{([a-zA-Z*]+)\}/g)) {
    ends.set(match[1]!, (ends.get(match[1]!) ?? 0) + 1);
  }

  for (const [env, count] of begins) {
    const closed = ends.get(env) ?? 0;
    if (closed === count) continue;
    om.report('math-unbalanced-environment', 'error', `Environment \`${env}\` is opened ${count} time(s) but closed ${closed}`, range, {
      source: 'math',
      mathId,
      excerpt: excerpt(tex),
      detail: '每个 `\\begin{...}` 都需要一个同名的 `\\end{...}`，否则整个公式无法渲染。',
    });
    return;
  }
  for (const [env, count] of ends) {
    if ((begins.get(env) ?? 0) === count) continue;
    om.report('math-unbalanced-environment', 'error', `Environment \`${env}\` is closed without being opened`, range, {
      source: 'math',
      mathId,
      excerpt: excerpt(tex),
      detail: '存在多余的 `\\end{...}`。',
    });
    return;
  }
}

/**
 * Reports list items inside one list that use different bullet characters.
 *
 * All three markers are individually valid, so this is a style diagnostic rather than an
 * error: the rendered list is correct either way. It is worth reporting because the
 * inconsistency is invisible in the rendered output and therefore survives review — and
 * because a formatter that silently rewrote the markers would be making a choice the author
 * never expressed.
 */
function inconsistentListMarkerDiagnostics(source: string, om: RenderCollector, index: LineIndex): void {
  const lines = blankFencedCode(source).split('\n');
  let previousIndent = -1;
  let previousMarker = '';
  let offset = 0;
  let reported = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const lineStart = offset;
    offset += line.length + 1;

    const match = /^(\s*)([-*+])[ \t]+\S/.exec(line);
    if (!match) {
      // A non-item line ends the sibling run; nested levels restart it.
      if (line.trim() !== '') {
        previousMarker = '';
        previousIndent = -1;
      }
      continue;
    }
    const indent = match[1]!.length;
    const marker = match[2]!;

    if (previousMarker !== '' && indent === previousIndent && marker !== previousMarker && reported < 3) {
      reported++;
      om.report('inconsistent-list-marker', 'info', 'Adjacent list items use different markers', index.range(lineStart, lineStart + line.length), {
        source: 'markdown',
        excerpt: excerpt(line.trim(), 80),
        detail: `同一层级的列表项混用了 \`${previousMarker}\` 与 \`${marker}\`。渲染结果不受影响，但建议统一。`,
      });
    }
    previousIndent = indent;
    previousMarker = marker;
  }
}

/**
 * Reports a `\(` or `\[` whose partner never appears.
 *
 * The tokenizer already falls back to literal text for an unmatched opener — which is the
 * right rendering — but the author usually *meant* a formula, so the situation is surfaced
 * rather than passed over in silence.
 */
function unmatchedParenDelimiterDiagnostics(source: string, om: RenderCollector, index: LineIndex): void {
  const text = blankFencedCode(source);
  const pairs: { open: string; close: string; label: string }[] = [
    { open: '\\(', close: '\\)', label: '\\( … \\)' },
    { open: '\\[', close: '\\]', label: '\\[ … \\]' },
  ];

  for (const pair of pairs) {
    const opens: number[] = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '\\') continue;
      // An escaped backslash (`\\\\(`) is not a delimiter opener.
      let backslashes = 0;
      for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) backslashes++;
      if (backslashes % 2 === 1) continue;
      const next = text[i + 1];
      if (next === pair.open[1]) opens.push(i);
      else if (next === pair.close[1] && opens.length > 0) opens.pop();
      i++;
    }
    if (opens.length === 0) continue;
    const at = opens[0]!;
    om.report('math-suspicious-delimiter', 'warning', `Unmatched \`${pair.label.split(' ')[0]}\` delimiter`, index.range(at, at + 2), {
      source: 'math',
      excerpt: excerpt(source.slice(at, at + 60)),
      detail: `开括号缺少与之配对的闭括号，因此该处按普通文本渲染。若本意是公式，请补上 \`${pair.close.replace('\\\\', '\\')}\`。`,
    });
  }
}

/**
 * Reports a `$` that looks like the start of a formula but never closes.
 *
 * Deliberately narrow: the line must contain a TeX command (`\command`) after the opening
 * `$` and no closing `$`. Requiring a backslash excludes ordinary prose about prices, which
 * is the false positive that would make this diagnostic noise.
 */
function suspiciousDollarDiagnostics(source: string, om: RenderCollector, index: LineIndex): void {
  const lines = source.split('\n');
  let offset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const found = /(?<![\\$])\$[^$\n]*\\[a-zA-Z]+[^$\n]*$/.exec(line);
    if (found) {
      om.report('math-suspicious-delimiter', 'warning', 'Possible unclosed inline formula', index.range(offset + found.index, offset + line.length), {
        source: 'math',
        excerpt: excerpt(line.trim(), 80),
        detail: '该行以 `$` 开头且包含 LaTeX 命令，但没有闭合的 `$`，可能无法按公式渲染。',
      });
    }
    offset += line.length + 1;
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

export interface ParseHooks {
  /** Injected so the sanitiser can live in the browser layer and stay testable. */
  sanitizeHtml?: (html: string) => { html: string; removed: SanitizeFinding[] };
  /**
   * Resolves an image reference to its availability.
   *
   * Optional because the real answer requires filesystem access and the parse is synchronous.
   * The application parses first for a fast first paint and runs the asset check afterwards
   * (see `parseDocument`'s caller); the corpus suite supplies a resolver so the checks are
   * exercised in the same code path.
   */
  resolveAsset?: (path: string) => AssetStatus;
}

/** Recognises an image reference in a raw HTML fragment. */
const RAW_IMAGE_PATTERN = /<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;

/**
 * Records `<img>` elements written as raw HTML.
 *
 * Authors mix markdown images and raw HTML freely, and a health check that only saw the
 * markdown form would report a clean document full of broken pictures.
 */
function collectRawImages(content: string, token: Token, om: RenderCollector, index: LineIndex): void {
  if (!content.includes('<img')) return;
  const blockRange = token.map ? index.spanForLines(token.map[0], token.map[1] - 1) : null;
  RAW_IMAGE_PATTERN.lastIndex = 0;
  let match = RAW_IMAGE_PATTERN.exec(content);
  while (match) {
    const path = match[1] ?? match[2] ?? match[3] ?? '';
    if (path !== '') {
      // Offset precision inside a raw HTML block is not worth a second scan; the block's own
      // range is exact and points the reader at the right place.
      om.addImage({
        path,
        alt: '',
        range: blockRange ? index.range(blockRange.from, blockRange.to) : emptyRange(),
      });
    }
    match = RAW_IMAGE_PATTERN.exec(content);
  }
}

/**
 * Renumbers task-list element ids deterministically, in document order.
 *
 * `markdown-it-task-lists` generates its ids with `Math.random()`, which makes the rendered
 * HTML differ between two parses of the same document. That breaks screenshot comparison,
 * reproducible HTML export, and any content-addressed caching — and the plugin's formula can
 * even produce negative ids. The ids are only used to associate a `<label>` with its
 * checkbox, so replacing them with a running counter preserves the behaviour exactly while
 * making the output stable.
 *
 * `startAt` lets the per-block renders share one numbering sequence with the whole-document
 * render: both walk the document in order, so both produce the same ids.
 */
function renumberTaskItemIds(html: string, startAt: number, prefix = 'task-item-'): { html: string; next: number } {
  const mapping = new Map<string, string>();
  let next = startAt;
  return {
    html: html.replace(/task-item--?\d+/g, (match) => {
      const existing = mapping.get(match);
      if (existing) return existing;
      const assigned = `${prefix}${next++}`;
      mapping.set(match, assigned);
      return assigned;
    }),
    next,
  };
}

/**
 * Splits the flat token stream into top-level blocks.
 *
 * A block is a maximal run of tokens that begins and ends at nesting depth zero — an
 * `*_open`/`*_close` pair, or a single self-contained token such as a fence or a rule.
 * Rendering each slice on its own is what allows instant rendering to replace one block
 * without touching the rest of the document.
 *
 * Every block's source range is derived from the token `map` values rather than from any
 * re-serialisation, which is why the editor can splice text back in without risk.
 */
function buildBlocks(
  tokens: Token[],
  engine: MarkdownItInstance,
  env: OpenmarkEnv,
  index: LineIndex,
  sanitize: ((html: string) => { html: string; removed: SanitizeFinding[] }) | undefined,
): SourceBlock[] {
  const groups: { start: number; end: number }[] = [];
  let depth = 0;
  let groupStart = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.nesting === 1) {
      if (depth === 0) groupStart = i;
      depth++;
    } else if (token.nesting === -1) {
      depth--;
      if (depth === 0) groups.push({ start: groupStart, end: i });
    } else if (depth === 0) {
      groups.push({ start: i, end: i });
    }
  }
  // An unbalanced tail (should not happen, but a plugin could produce one) is still a block.
  if (depth > 0) groups.push({ start: groupStart, end: tokens.length - 1 });

  const blocks: SourceBlock[] = [];
  for (const group of groups) {
    const slice = tokens.slice(group.start, group.end + 1);
    let startLine = Number.POSITIVE_INFINITY;
    let endLine = -1;
    for (const token of slice) {
      if (!token.map) continue;
      startLine = Math.min(startLine, token.map[0]);
      endLine = Math.max(endLine, token.map[1]);
    }
    if (endLine < 0) continue; // No position information: cannot be edited in place.

    const from = index.lineStart(startLine);
    const to = index.lineEnd(endLine - 1);
    const blockIndex = blocks.length;
    let cached: string | null = null;

    const block: SourceBlock = {
      id: `block-${blockIndex}`,
      index: blockIndex,
      range: index.range(from, to),
      source: index.text.slice(from, to),
      kind: classifyBlock(slice),
      html: '',
    };

    /*
     * Block HTML is rendered on first access, not up front.
     *
     * Rendering every block eagerly doubles the cost of opening a document, and the reading
     * view never touches block HTML at all — only instant mode does. On the widest stress
     * fixture that difference is hundreds of milliseconds on the critical path to first paint.
     * A plain property with a getter keeps the public shape (`html` is still a string) while
     * making the work happen only when something asks for it.
     */
    Object.defineProperty(block, 'html', {
      enumerable: true,
      configurable: true,
      get(): string {
        if (cached === null) {
          // Task-list ids are namespaced per block so they stay unique across the page
          // without needing a global counter, which is what allows this to be lazy.
          const rendered = engine.renderer.render(slice, engine.options, env);
          cached = renumberTaskItemIds(rendered, 1, `task-item-b${blockIndex}-`).html;
          if (sanitize) cached = sanitize(cached).html;
        }
        return cached;
      },
      set(value: string) {
        cached = value;
      },
    });

    blocks.push(block);
  }
  return blocks;
}

/** Maps a token slice to the coarse kind used for editor affordances. */
function classifyBlock(slice: Token[]): SourceBlockKind {
  for (const token of slice) {
    switch (token.type) {
      case 'om_frontmatter':
        return 'frontmatter';
      case 'heading_open':
        return 'heading';
      case 'paragraph_open':
        return 'paragraph';
      case 'bullet_list_open':
      case 'ordered_list_open':
        return 'list';
      case 'blockquote_open':
        return 'blockquote';
      case 'table_open':
        return 'table';
      case 'footnote_block_open':
        return 'footnotes';
      case 'hr':
        return 'rule';
      case 'html_block':
        return 'html';
      case 'math_block':
        return 'math';
      case 'code_block':
        return 'code';
      case 'fence': {
        const fence = (token.meta as { omFence?: string } | null)?.omFence;
        if (fence === 'mermaid') return 'diagram';
        if (fence === 'math') return 'math';
        return 'code';
      }
      default:
        break;
    }
  }
  return 'other';
}

/**
 * Parses a document to HTML plus the registries needed to finish rendering it.
 * Pure and synchronous: everything expensive (MathJax, Mermaid, Shiki) happens later.
 *
 * The source is parsed **once**, then rendered twice — once whole for the reading view and
 * once per block for instant rendering. Re-parsing for the second view would double the
 * cost of every edit.
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
  unclosedCommentDiagnostics(normalized, collector, index);
  duplicateFootnoteDiagnostics(normalized, collector, index);
  setextAmbiguityDiagnostics(normalized, collector, index);
  inconsistentListMarkerDiagnostics(normalized, collector, index);
  unmatchedParenDelimiterDiagnostics(normalized, collector, index);
  suspiciousDollarDiagnostics(normalized, collector, index);

  const tokens = engine.parse(normalized, env);
  referenceLinkDiagnostics(normalized, env.references as Record<string, unknown> | undefined, collector, index);
  const blocks = buildBlocks(tokens, engine, env, index, hooks.sanitizeHtml);
  // Stable ids before anything can observe the HTML.
  let html = renumberTaskItemIds(engine.renderer.render(tokens, engine.options, env), 1).html;

  if (hooks.sanitizeHtml) {
    const result = hooks.sanitizeHtml(html);
    html = result.html;
    reportSanitizerFindings(collector, result.removed, index, normalized);
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

  if (hooks.resolveAsset) {
    for (const diagnostic of assetDiagnostics(collector.images, hooks.resolveAsset)) {
      collector.addDiagnostic(diagnostic);
    }
  }

  return {
    html,
    blocks,
    images: collector.images,
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
