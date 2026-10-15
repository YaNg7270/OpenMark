import type { MermaidDiagram } from '../markdown/types';

/**
 * Mermaid integration.
 *
 * Rendering is lazy and cached by diagram source, because a textbook chapter can carry
 * dozens of diagrams and re-parsing identical ones wastes tens of milliseconds each.
 *
 * Security notes, all of which matter because diagram source is untrusted document text:
 *  - `securityLevel: 'strict'` (Mermaid's default) sanitises labels and blocks script
 *    execution and `javascript:` URLs.
 *  - `htmlLabels: false` avoids HTML label injection entirely and, per Mermaid's own
 *    guidance, keeps output portable to HTML/PDF export.
 *  - `suppressErrorRendering: true` stops Mermaid from injecting its own red
 *    "syntax error" diagram, so we can render a diagnostic in our own UI instead.
 */

type MermaidApi = {
  initialize(config: Record<string, unknown>): void;
  parse(text: string, options?: { suppressErrors?: boolean }): Promise<unknown>;
  render(
    id: string,
    text: string,
    container?: Element,
  ): Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
};

let mermaidPromise: Promise<MermaidApi> | null = null;
let currentTheme: 'light' | 'dark' | null = null;

/** Loads Mermaid once. It is ~6 MB of chunks, so it never enters the initial bundle. */
async function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((mod) => {
      const api = (mod.default ?? mod) as unknown as MermaidApi;
      return api;
    });
  }
  return mermaidPromise;
}

function themeVariables(dark: boolean): Record<string, unknown> {
  return dark
    ? {
        background: 'transparent',
        primaryColor: '#21252d',
        primaryTextColor: '#dfe3e9',
        primaryBorderColor: '#3a414d',
        lineColor: '#6c757f',
        secondaryColor: '#1c1f26',
        tertiaryColor: '#1c1f26',
        fontFamily: 'var(--om-font-ui)',
        fontSize: '14px',
      }
    : {
        background: 'transparent',
        primaryColor: '#ffffff',
        primaryTextColor: '#1f2328',
        primaryBorderColor: '#cdd3db',
        lineColor: '#5a6169',
        secondaryColor: '#f7f8fa',
        tertiaryColor: '#f7f8fa',
        fontFamily: 'var(--om-font-ui)',
        fontSize: '14px',
      };
}

async function configure(dark: boolean): Promise<MermaidApi> {
  const api = await loadMermaid();
  if (currentTheme === (dark ? 'dark' : 'light')) return api;
  api.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    htmlLabels: false,
    theme: dark ? 'dark' : 'neutral',
    themeVariables: themeVariables(dark),
    fontFamily: 'var(--om-font-ui)',
    flowchart: { htmlLabels: false, useMaxWidth: true },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
    // Mermaid's own guards against pathological input.
    maxTextSize: 200_000,
    maxEdges: 1_000,
  });
  currentTheme = dark ? 'dark' : 'light';
  return api;
}

export interface MermaidOutcome {
  ok: boolean;
  svg: string;
  error: string | null;
}

/** Parses without rendering — used to feed the diagnostics panel cheaply. */
export async function validateDiagram(code: string, dark: boolean): Promise<string | null> {
  try {
    const api = await configure(dark);
    await api.parse(code);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

const renderCache = new Map<string, string>();

/**
 * Renders one diagram to an SVG string.
 *
 * The cache key is `theme + source`, so switching themes re-renders but switching
 * documents back and forth does not.
 */
export async function renderDiagram(diagram: MermaidDiagram, dark: boolean): Promise<MermaidOutcome> {
  const key = `${dark ? 'd' : 'l'}:${diagram.code}`;
  const cached = renderCache.get(key);
  if (cached) return { ok: true, svg: cached, error: null };

  try {
    const api = await configure(dark);
    // Mermaid requires a DOM-unique id containing no characters that break CSS selectors.
    const id = `om-mermaid-${Math.random().toString(36).slice(2, 10)}`;
    const { svg } = await api.render(id, diagram.code);
    renderCache.set(key, svg);
    // Bound the cache so a huge document cannot grow memory without limit.
    if (renderCache.size > 200) {
      const oldest = renderCache.keys().next().value;
      if (oldest !== undefined) renderCache.delete(oldest);
    }
    return { ok: true, svg, error: null };
  } catch (err) {
    return { ok: false, svg: '', error: err instanceof Error ? err.message : String(err) };
  }
}

export function clearDiagramCache(): void {
  renderCache.clear();
}
