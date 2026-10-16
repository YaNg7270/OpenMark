import type { MathRenderError } from '../markdown/types';

/**
 * MathJax 4 integration.
 *
 * ## Why each expression is converted individually
 *
 * MathJax's usual mode of operation is to scan a page for `$…$` and typeset whatever it
 * finds. OpenMark cannot use that: the pipeline already decided where the math is (see
 * `math-plugin.ts`), and the diagnostics feature needs to attribute a failure to a
 * *specific* expression with its own source range. So we drive the conversion API
 * directly, one expression at a time, and read the result back.
 *
 * ## Why MathJax runs only in the browser
 *
 * MathJax 4's Node component loader builds bare Windows paths (`D:/…`) and hands them to
 * `import()`, which requires a `file://` URL — so `MathJax.init()` fails outright on
 * Windows Node. Everything here is therefore browser-only and lazily loaded; the parser
 * in `core/markdown` never touches it, which also keeps unit tests fast.
 *
 * ## Error handling
 *
 * A failed expression must never vanish. MathJax's own `formatError` emits the original
 * TeX inside `<merror data-mjx-error="…">`, which we detect and surface, and we
 * additionally keep the raw source in the expression registry for the edit dialog. If
 * MathJax itself fails to load, `renderExpression` still returns the source so the UI can
 * degrade to showing plain LaTeX.
 */

/** Packages beyond MathJax's default set. All are vendored, so none need the network. */
const EXTRA_PACKAGES = [
  'mhchem', // \ce{} and \pu{} — chemistry and physical units
  'ams', // align/gather/cases/… and equation numbering
  'mathtools', // amsmath extensions: \coloneqq, \DeclarePairedDelimiter, …
  'boldsymbol', // \boldsymbol, \bm
  'cancel', // \cancel, \bcancel, \xcancel
  'color', // \color, \textcolor inside math
  'unicode', // Unicode-aware tokenisation for non-Latin text in formulas
  'textmacros', // \text{} with nested macros
  'html', // \href, \cssId, \class, \style — filtered by `ui/safe`, see `configure`
  'autoload', // lazy-load any remaining package a user's macro needs
];

/**
 * Where the vendored MathJax lives, relative to the app root.
 *
 * MathJax's loader builds component and font URLs from these values itself, so they are
 * **directories, not files**, and must match the layout `scripts/prepare-mathjax.mjs`
 * produces. Getting them wrong does not throw: the loader falls back to the CDN, which
 * works on a developer machine and fails silently in the packaged offline app.
 */
const MATHJAX_DIR = withBase('mathjax/v4');
/** MathJax resolves a font as `<fonts>/<fontName>/svg.js`, so the package names matter. */
const FONTS_DIR = withBase('mathjax-fonts');

function withBase(relative: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  const joined = `${base}/${relative}`;
  return joined.replace(/\/{2,}/g, '/').replace(/\/$/, '');
}

/**
 * The object MathJax exposes once it has booted. Distinct from the config we write before
 * loading the bundle: the config is a partial the loader fills in, so conflating the two
 * would force every config literal to restate runtime-only fields.
 */
interface MathJaxGlobal {
  version: string;
  startup: {
    document: MathJaxDocument;
    adaptor: { outerHTML(node: unknown): string };
    promise: Promise<unknown>;
    typeset?: boolean;
  };
  /** MathJax's module tree; only the tag factory is reached into, see `setEquationNumbering`. */
  _?: { input?: { tex?: { Tags?: { TagsFactory?: { create(name: string): TexTags } } } } };
  /** Conversion that waits for every asynchronous action, the speech worker included. */
  tex2svgPromise?: (tex: string, options: Record<string, unknown>) => Promise<HTMLElement>;
}

/**
 * Spoken descriptions of formulas (MathJax semantic enrichment + speech), off by default.
 *
 * Read once, when MathJax is first configured: the bundle reads its options at boot, so a
 * change after that takes effect on the next launch. The speech rules and the worker are
 * vendored under `mathjax/v4/sre/`, so this needs no network either.
 */
let speechEnabled = false;

/** Returns false when MathJax has already booted with the other setting (restart needed). */
export function setMathSpeech(enabled: boolean): boolean {
  if (runtime() && enabled !== speechEnabled) return false;
  speechEnabled = enabled;
  return true;
}

export function isMathSpeechEnabled(): boolean {
  return speechEnabled;
}

/** A TeX tag handler: owns the equation counter and the label table. */
interface TexTags {
  configuration: unknown;
}

/** Shape accepted by `window.MathJax` before the bundle loads. */
interface MathJaxConfig {
  loader?: Record<string, unknown>;
  tex?: Record<string, unknown>;
  svg?: Record<string, unknown>;
  options?: Record<string, unknown>;
  startup?: { typeset?: boolean } & Record<string, unknown>;
  [key: string]: unknown;
}

/** The subset of MathJax's internal document we drive. */
interface MathJaxDocument {
  convert(tex: string, options: Record<string, unknown>): HTMLElement;
  clear(): void;
  /** Present at runtime; the TeX input jax carries the `tags` option. */
  inputJax?: { name?: string; parseOptions?: { tags: TexTags } }[];
}

declare global {
  interface Window {
    MathJax?: MathJaxConfig;
  }
}

/** The live runtime object, or null before the bundle has booted. */
function runtime(): MathJaxGlobal | null {
  const mj = window.MathJax as MathJaxGlobal | undefined;
  return mj?.startup?.document ? mj : null;
}

let loadPromise: Promise<MathJaxGlobal> | null = null;

/**
 * Injects the MathJax configuration global. Must run before `tex-svg.js` executes,
 * because the bundle reads `window.MathJax` during boot.
 */
function configure(): void {
  const existing = window.MathJax ?? {};
  window.MathJax = {
    ...existing,
    loader: {
      /*
       * `[tex]/html` (`\href`, `\cssId`, `\class`, `\style`, `\data`) is loaded up front rather
       * than left to autoload, so the extension `ui/safe` filters is present from the first
       * render instead of arriving mid-document.
       *
       * `ui/safe` is what makes that output acceptable. MathJax's SVG is written into the page
       * *after* DOMPurify has run, so it is the only filter between a formula and the DOM: it
       * keeps http(s)/mailto links, drops `javascript:`, `data:` and (see `safeOptions`) `file:`,
       * limits ids and classes to `mjx-*`, and reduces `\style` to a short list of harmless
       * properties.
       */
      load: ['[tex]/mhchem', '[tex]/html', 'ui/safe'],
      // Vendored, so no component or glyph ever comes from the network.
      paths: { mathjax: MATHJAX_DIR, fonts: FONTS_DIR },
    },
    tex: {
      // We pass full expressions to the conversion API, so MathJax must NOT scan the
      // document for delimiters — the pipeline already decided what is math.
      //
      // `noundefined` is removed deliberately: by default MathJax renders an unknown macro
      // as literal red text and reports no error at all, which would make the diagnostics
      // panel silently blind to exactly the mistake authors most often make. Without it,
      // `\thisMacroDoesNotExist{1}` becomes a real, locatable `merror`.
      packages: { '[+]': EXTRA_PACKAGES, '[-]': ['noundefined'] },
      processEscapes: true,
      processEnvironments: true,
      // `ams` numbering is switched on per-render; see `setEquationNumbering`.
      tags: 'none',
      macros: {},
    },
    svg: {
      // 'local' inlines the glyph <defs> into every <svg>, which is what makes the
      // output self-contained for HTML/PDF export. 'global' would make images depend
      // on page-level styles.
      fontCache: 'local',
      // `href` instead of `xlink:href`: valid in HTML5 and survives serialisation for
      // export, where the XLink namespace declaration would otherwise be dropped.
      useXlink: false,
    },
    /*
     * Accessibility features are off by default.
     *
     * MathJax 4 enables semantic enrichment, speech and Braille out of the box, which spins
     * up an SRE web worker and fetches the mathmaps on every document. That work races with
     * typesetting and made rendering non-deterministic in testing — an unacceptable
     * trade for a reader that must be reliable. The SRE payload is still vendored, so these
     * can be turned on from settings once the worker lifecycle is handled explicitly.
     * Basic accessibility is unaffected: the SVG output keeps MathJax's structure and our
     * placeholders carry `role="math"`.
     */
    options: {
      // `ui/safe` allows `file:` links by default; a document must not link into the disk.
      safeOptions: {
        safeProtocols: { http: true, https: true, mailto: true, file: false, javascript: false, data: false },
      },
      enableMenu: true,
      enableAssistiveMml: false,
      enableSpeech: speechEnabled,
      enableBraille: false,
      enableEnrichment: speechEnabled,
      menuOptions: {
        settings: {
          assistiveMml: false,
          speech: speechEnabled,
          braille: false,
          enrich: speechEnabled,
          zoom: 'None',
        },
      },
      /*
       * The speech worker is started from a `blob:` URL, against which a relative path does not
       * resolve — the worker then waits for its rules forever. Absolute URLs on the app's own
       * origin keep it working offline (CSP `worker-src 'self' blob:`).
       */
      worker: {
        path: new URL(`${MATHJAX_DIR}/sre`, globalThis.location?.href ?? 'http://localhost/').href,
        maps: new URL(`${MATHJAX_DIR}/sre/mathmaps`, globalThis.location?.href ?? 'http://localhost/').href,
      },
    },
    startup: {
      typeset: false,
    },
  };
}

/** Loads MathJax once and resolves when the component loader is ready. */
export function ensureMathJax(): Promise<MathJaxGlobal> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<MathJaxGlobal>((resolve, reject) => {
    const ready = () => {
      const boot = (window.MathJax as MathJaxGlobal | undefined)?.startup?.promise ?? Promise.resolve();
      boot
        .then(() => {
          const mj = runtime();
          if (!mj) {
            reject(new Error('MathJax booted without a startup document'));
            return;
          }
          resolve(mj);
        })
        .catch(reject);
    };

    const existing = document.querySelector<HTMLScriptElement>('script[data-openmark-mathjax]');
    if (existing) {
      if (runtime()) ready();
      else existing.addEventListener('load', ready, { once: true });
      return;
    }

    configure();
    const script = document.createElement('script');
    script.src = `${MATHJAX_DIR}/tex-svg.js`;
    script.async = true;
    script.dataset.openmarkMathjax = '1';
    script.addEventListener('load', ready, { once: true });
    script.addEventListener(
      'error',
      () => reject(new Error(`Failed to load MathJax from ${script.src}`)),
      { once: true },
    );
    document.head.appendChild(script);
  });

  return loadPromise;
}

export type MathRenderOutcome =
  | { ok: true; html: string; error: null }
  | { ok: false; html: string; error: MathRenderError };

const MERROR_REGEX = /data-mjx-error="([^"]*)"/;

/**
 * Renders one LaTeX body to SVG.
 *
 * `containerWidth` is passed so MathJax can break over-wide display equations instead
 * of overflowing the reading column.
 */
export async function renderExpression(
  tex: string,
  opts: { display: boolean; containerWidth?: number; scale?: number },
): Promise<MathRenderOutcome> {
  let mj: MathJaxGlobal;
  try {
    mj = await ensureMathJax();
  } catch (err) {
    // MathJax unavailable: degrade to showing the source rather than losing it.
    return {
      ok: false,
      html: '',
      error: {
        name: 'MathJaxUnavailable',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const convertOptions: Record<string, unknown> = {
    display: opts.display,
    em: 16 * (opts.scale ?? 1),
    ex: 8 * (opts.scale ?? 1),
    containerWidth: opts.containerWidth ?? 80 * 16,
  };

  try {
    // With speech on, only the promise API waits for the worker to attach the description.
    const node =
      speechEnabled && mj.tex2svgPromise
        ? await mj.tex2svgPromise(tex, convertOptions)
        : await convertWithRetries(mj, tex, convertOptions);
    const html = mj.startup.adaptor.outerHTML(node);
    const errorMatch = MERROR_REGEX.exec(html);
    if (errorMatch) {
      return {
        ok: false,
        html,
        error: {
          name: 'TeXError',
          message: decodeAttr(errorMatch[1] ?? 'Unknown TeX error'),
        },
      };
    }
    return { ok: true, html, error: null };
  } catch (err) {
    return {
      ok: false,
      html: '',
      error: {
        name: 'ConversionError',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

/** Bound on retries for one expression; each retry is one extension load, so a handful is plenty. */
const MAX_CONVERT_RETRIES = 10;

/**
 * `convert`, but waiting out MathJax's asynchronous loads.
 *
 * The first time a document uses a macro from an extension that is not loaded yet (`\bbox`,
 * `\enclose`, `\bra`, …), `autoload` starts fetching it and `convert` throws a "MathJax retry"
 * error whose `retry` property is a promise for that load. Treating that as a render failure
 * showed the first such formula as broken, and only a later render — after the extension had
 * quietly arrived — came out right. Waiting for the promise and converting again is MathJax's
 * own retry protocol (`mathjax.handleRetriesFor`), done here so the call stays per-expression.
 */
async function convertWithRetries(
  mj: MathJaxGlobal,
  tex: string,
  options: Record<string, unknown>,
): Promise<HTMLElement> {
  for (let attempt = 0; ; attempt++) {
    try {
      return mj.startup.document.convert(tex, options);
    } catch (err) {
      const retry = (err as { retry?: unknown } | null)?.retry;
      if (!(retry instanceof Promise) || attempt >= MAX_CONVERT_RETRIES) throw err;
      await retry;
    }
  }
}

function decodeAttr(value: string): string {
  // MathJax escapes its error text; attribute values are already HTML-entity encoded.
  return value
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

/**
 * Switches AMS equation numbering on or off and clears the tag/label counters, so a
 * re-render of the same document produces identical numbers.
 *
 * Numbering is only correct when expressions are converted in document order — a
 * lazily-rendered subset would receive numbers in viewport order. The renderer
 * therefore only turns numbering on when the document actually contains tags or labels.
 *
 * The switch replaces the TeX parser's tag handler. Setting `tex.tags` — on the config global
 * or on the input jax's options — does nothing once the jax exists: MathJax reads it once, at
 * construction, to build the handler. That is how numbering silently never worked while
 * explicit `\tag{…}` (which needs no counter) did. A fresh handler also starts its counter and
 * label table at zero, which is what makes a re-render number identically.
 *
 * Enabling waits for MathJax to boot: the typesetter calls this before the first formula is
 * converted, so on a cold start there is no runtime yet to switch. Disabling does not — a
 * runtime that has not booted will start with numbering off.
 */
export async function setEquationNumbering(enable: boolean): Promise<void> {
  let mj = runtime();
  if (!mj) {
    if (!enable) return;
    try {
      mj = await ensureMathJax();
    } catch {
      // MathJax unavailable: every formula will degrade to its source anyway.
      return;
    }
  }
  const factory = mj._?.input?.tex?.Tags?.TagsFactory;
  for (const jax of mj.startup.document.inputJax ?? []) {
    if (!factory || !jax.parseOptions) continue;
    const tags = factory.create(enable ? 'ams' : 'none');
    tags.configuration = jax.parseOptions;
    jax.parseOptions.tags = tags;
  }
  mj.startup.document.clear();
}

/** True when a document uses equation tags, labels or cross-references. */
export function needsNumbering(texSources: readonly string[]): boolean {
  return texSources.some((t) => /\\(label|tag|ref|eqref)\b|\{align\}|\{equation\}|\{gather\}|\{multline\}|\{eqnarray\}/.test(t));
}

/** Clears MathJax's document so labels/tags from a previous file do not leak. */
export function resetMathDocument(): void {
  runtime()?.startup.document.clear();
}
