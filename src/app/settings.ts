/**
 * User settings: defaults, persistence and CSS projection.
 *
 * Settings are stored in `localStorage`, which WebView2 keeps in the app's own user-data
 * folder — so they persist across restarts in the packaged app while the same code works
 * unchanged in a browser, where it lets the Playwright suite drive appearance.
 *
 * Appearance settings are applied by writing CSS custom properties on `<html>`. Nothing
 * in the component tree reads a setting to decide styling, so changing page width or
 * formula scale never re-renders a document.
 */

import { setPageZoom } from '@/core/util/window';
import { setMathSpeech } from '@/core/math/mathjax';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ContentFont = 'serif' | 'sans' | 'system';
export type ImageAlign = 'left' | 'center' | 'right';

export interface ReadingSettings {
  theme: ThemePreference;
  fontSize: number;
  lineHeight: number;
  /** Reading column width, in `rem`. */
  contentWidth: number;
  /** Vertical rhythm multiplier; 1 is the default spacing. */
  density: number;
  mathScale: number;
  imageScale: number;
  fontFamily: ContentFont;
  justify: boolean;
  hyphenate: boolean;
  /** Shrink the sidebar and dim chrome while reading. */
  focusMode: boolean;
  /** Keep the caret line vertically centred while typing. */
  typewriterMode: boolean;
  showReadingProgress: boolean;
  showOutline: boolean;
  /** Number headings automatically in the rendered output. */
  autoNumberHeadings: boolean;
  /** Whole-window zoom factor (Ctrl+Shift+= / Ctrl+Shift+- / Ctrl+wheel). */
  zoom: number;
  /** Alignment of an image that stands alone in its paragraph. */
  imageAlign: ImageAlign;
  /**
   * Experimental: MathJax semantic enrichment and speech, so a screen reader hears
   * "E equals m c squared" instead of the LaTeX. Takes effect on the next launch.
   */
  mathSpeech: boolean;
}

export interface EditorSettings {
  autoSave: boolean;
  autoSaveDelayMs: number;
  tabSize: number;
  showLineNumbers: boolean;
}

export interface SafetySettings {
  /**
   * Open documents read-only by default when they look untrusted or unusually complex,
   * so that merely looking at a file can never modify it.
   */
  safeReadOnlyForComplexFiles: boolean;
  /** Byte size above which a document is considered "large" for the above check. */
  largeFileThresholdBytes: number;
  /** Keep a rotating backup next to the original on every save. */
  keepBackups: boolean;
}

export interface AppSettings {
  version: 1;
  language: 'zh' | 'en';
  reading: ReadingSettings;
  editor: EditorSettings;
  safety: SafetySettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  language: 'zh',
  reading: {
    theme: 'system',
    fontSize: 16,
    lineHeight: 1.75,
    contentWidth: 46,
    density: 1,
    mathScale: 1,
    imageScale: 1,
    fontFamily: 'system',
    justify: false,
    hyphenate: false,
    focusMode: false,
    typewriterMode: false,
    showReadingProgress: true,
    showOutline: true,
    autoNumberHeadings: false,
    zoom: 1,
    imageAlign: 'left',
    mathSpeech: false,
  },
  editor: {
    // On by default (PRD R-C-8). Autosaves take a backup at most every ten minutes, so the
    // rotating backup set still spans real history; see `save` in store.ts.
    autoSave: true,
    autoSaveDelayMs: 4000,
    tabSize: 2,
    showLineNumbers: false,
  },
  safety: {
    safeReadOnlyForComplexFiles: true,
    largeFileThresholdBytes: 512 * 1024,
    keepBackups: true,
  },
};

const STORAGE_KEY = 'openmark.settings.v1';

/**
 * Merges persisted settings over the defaults, one level deep per section.
 * A stored value of the wrong type is discarded rather than trusted, so a corrupted or
 * hand-edited entry cannot put the UI into an unrenderable state.
 */
export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      version: 1,
      language: parsed.language === 'en' ? 'en' : DEFAULT_SETTINGS.language,
      reading: sanitizeReading({ ...DEFAULT_SETTINGS.reading, ...pickNumbers(parsed.reading, DEFAULT_SETTINGS.reading) }),
      editor: { ...DEFAULT_SETTINGS.editor, ...pickNumbers(parsed.editor, DEFAULT_SETTINGS.editor) },
      safety: { ...DEFAULT_SETTINGS.safety, ...pickNumbers(parsed.safety, DEFAULT_SETTINGS.safety) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;

/** Clamps a zoom factor to the supported range, on a 10% grid so repeated steps stay exact. */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value)) * 10) / 10;
}

/** Values that pass the type check but are still out of range or not one of the choices. */
function sanitizeReading(reading: ReadingSettings): ReadingSettings {
  const align: readonly string[] = ['left', 'center', 'right'];
  return {
    ...reading,
    zoom: clampZoom(reading.zoom),
    imageAlign: align.includes(reading.imageAlign) ? reading.imageAlign : DEFAULT_SETTINGS.reading.imageAlign,
  };
}

/**
 * Keeps only entries whose runtime type matches the default's, which rejects both
 * corrupted JSON and values of a plausible-but-wrong type (a string where a number
 * belongs would otherwise end up in a CSS calc).
 */
function pickNumbers<T extends object>(source: unknown, defaults: T): Partial<T> {
  if (!source || typeof source !== 'object') return {};
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    const expected = (defaults as Record<string, unknown>)[key];
    if (expected === undefined) continue;
    if (typeof value === typeof expected) {
      (out as Record<string, unknown>)[key] = value;
    } else if (Array.isArray(expected) && Array.isArray(value)) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private mode / quota). Losing preferences is
    // preferable to blocking the app, so this is intentionally swallowed.
  }
}

/** `system` resolves against the OS preference, live. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const FONT_STACKS: Record<ContentFont, string> = {
  serif: 'var(--om-font-content)',
  sans: 'var(--om-font-sans-content)',
  system: 'var(--om-font-ui)',
};

/**
 * Projects settings onto CSS custom properties. This is the only place settings touch the
 * DOM, which is what keeps appearance changes O(1) instead of a full re-render.
 */
export function applySettingsToDocument(settings: AppSettings): void {
  const root = document.documentElement;
  const { reading } = settings;

  root.dataset['omTheme'] = resolveTheme(reading.theme);
  root.dataset['omFont'] = reading.fontFamily;
  root.dataset['omJustify'] = reading.justify ? 'on' : 'off';
  root.dataset['omHyphenate'] = reading.hyphenate ? 'on' : 'off';
  root.dataset['omFocus'] = reading.focusMode ? 'on' : 'off';
  // Heading numbering is a CSS-counter feature, so this is a pure style toggle.
  root.dataset['omNumbered'] = reading.autoNumberHeadings ? 'on' : 'off';
  root.dataset['omImageAlign'] = reading.imageAlign;

  root.style.setProperty('--om-font-size', `${reading.fontSize}px`);
  root.style.setProperty('--om-line-height', String(reading.lineHeight));
  root.style.setProperty('--om-content-width', `${reading.contentWidth}rem`);
  root.style.setProperty('--om-density', String(reading.density));
  root.style.setProperty('--om-math-scale', String(reading.mathScale));
  root.style.setProperty('--om-image-scale', String(reading.imageScale));
  root.style.setProperty('--om-content-font', FONT_STACKS[reading.fontFamily]);
  // Padding grows as the column narrows, so a narrow column still reads as a book page.
  root.style.setProperty('--om-content-padding', `${Math.max(1.5, 4 + (46 - reading.contentWidth) * 0.12)}rem`);
  void setPageZoom(clampZoom(reading.zoom));
  // Only effective before MathJax first boots; the setting says so in the panel.
  setMathSpeech(reading.mathSpeech);
}
