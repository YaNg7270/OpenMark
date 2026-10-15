/**
 * Shiki dual-theme resolution for export.
 *
 * The reader tokenises a code block **once** for both palettes: Shiki writes the light and
 * dark colour of every token as CSS custom properties on the element's `style` attribute
 * (`--shiki-light: #005cc5; --shiki-dark: #79b8ff`), and `document.css` picks one with
 * `color: var(--shiki-light)`. Switching theme is then a style recalculation, with no
 * re-highlight and no flash.
 *
 * An exported file has no theme switcher, and its CSS must not depend on the app's, so the
 * variables are resolved here into one concrete `color` (and `background-color`) per
 * element. That is a lossy step by design: the export is a snapshot of one theme.
 */

import type { ExportTheme } from './types';

const SHIKI_PREFIX = '--shiki-';

interface Declaration {
  property: string;
  value: string;
}

/**
 * Rewrites every Shiki-styled element under `root` to concrete colours for `theme`.
 *
 * Backgrounds are only emitted for elements *outside* a code block: the reader overrides
 * Shiki's own `<pre>` background with `background: none !important` so the surrounding
 * `.om-code` chrome supplies it, and an inline `background-color` would win over that.
 */
export function resolveCodeTheme(root: ParentNode, theme: ExportTheme): void {
  const styled = Array.from(root.querySelectorAll<HTMLElement>('[style*="--shiki-"]'));
  for (const element of styled) {
    const declarations = parseDeclarations(element.getAttribute('style') ?? '');
    const variables = new Map<string, string>();
    for (const declaration of declarations) {
      if (declaration.property.startsWith(SHIKI_PREFIX)) {
        variables.set(declaration.property, declaration.value);
      }
    }
    if (variables.size === 0) continue;

    const color = variables.get(`${SHIKI_PREFIX}${theme}`);
    const background = variables.get(`${SHIKI_PREFIX}${theme}-bg`);
    const keepBackground = background !== undefined && element.closest('.om-code') === null;

    const resolved: Declaration[] = [];
    if (color !== undefined) resolved.push({ property: 'color', value: color });
    if (keepBackground) resolved.push({ property: 'background-color', value: background });
    for (const declaration of declarations) {
      if (declaration.property.startsWith(SHIKI_PREFIX)) continue;
      resolved.push({
        property: declaration.property,
        value: substituteVariables(declaration.value, variables, theme),
      });
    }

    const style = serializeDeclarations(resolved);
    if (style === '') element.removeAttribute('style');
    else element.setAttribute('style', style);
  }
}

/** Replaces `var(--shiki-light)`-style references with the resolved value for `theme`. */
function substituteVariables(value: string, variables: Map<string, string>, theme: ExportTheme): string {
  const fallback = theme === 'dark' ? 'light' : 'dark';
  return value.replace(/var\(\s*(--shiki-[a-z-]+)\s*\)/g, (match, name: string) => {
    const resolved = variables.get(name.includes(`-${theme}`) ? name : name.replace(`-${fallback}`, `-${theme}`));
    return resolved ?? variables.get(name) ?? match;
  });
}

function parseDeclarations(style: string): Declaration[] {
  const declarations: Declaration[] = [];
  for (const part of style.split(';')) {
    const separator = part.indexOf(':');
    if (separator <= 0) continue;
    const property = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (property && value) declarations.push({ property, value });
  }
  return declarations;
}

function serializeDeclarations(declarations: readonly Declaration[]): string {
  return declarations.map(({ property, value }) => `${property}: ${value}`).join('; ');
}
