import { getCurrentWebview } from '@tauri-apps/api/webview';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Window-level controls: real fullscreen and page zoom.
 *
 * Both have a desktop path (the Tauri window and webview) and a browser path, which is what the
 * Playwright suite drives. The two are not equivalent on purpose: the desktop path changes the
 * native window and the WebView2 zoom factor, which is what the user expects from F11 and
 * Ctrl+Shift+=; the browser path uses the Fullscreen API and CSS `zoom` on the root element.
 */

function isDesktop(): boolean {
  return Boolean(globalThis.window?.__TAURI_INTERNALS__);
}

export async function isFullscreen(): Promise<boolean> {
  if (isDesktop()) {
    try {
      return await getCurrentWindow().isFullscreen();
    } catch {
      return false;
    }
  }
  return Boolean(globalThis.document?.fullscreenElement);
}

/** Toggles real fullscreen — the window, not the reading-focus mode. Resolves to the new state. */
export async function toggleFullscreen(): Promise<boolean> {
  const next = !(await isFullscreen());
  await setFullscreen(next);
  return next;
}

export async function setFullscreen(on: boolean): Promise<void> {
  if (isDesktop()) {
    await getCurrentWindow().setFullscreen(on);
    return;
  }
  const doc = globalThis.document;
  if (!doc) return;
  if (on && !doc.fullscreenElement) await doc.documentElement.requestFullscreen?.();
  if (!on && doc.fullscreenElement) await doc.exitFullscreen?.();
}

/**
 * Sets the page zoom factor (1 = 100%).
 *
 * On the desktop this is WebView2's own zoom, which rescales layout and the viewport together,
 * exactly like browser zoom. In a browser it falls back to CSS `zoom` on `<html>`, recorded in
 * `data-om-zoom` so a test can read the factor that was applied.
 */
export async function setPageZoom(factor: number): Promise<void> {
  const root = globalThis.document?.documentElement;
  if (root) root.dataset['omZoom'] = String(factor);
  if (isDesktop()) {
    try {
      await getCurrentWebview().setZoom(factor);
    } catch {
      // A webview that refuses zoom keeps working at 100%; nothing else depends on it.
    }
    return;
  }
  if (root) root.style.setProperty('zoom', factor === 1 ? '' : String(factor));
}
