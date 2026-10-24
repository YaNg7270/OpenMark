/**
 * OpenMark desktop E2E against the real Tauri binary.
 *
 * Everything asserted here is produced by the shipped code paths: `src/components/Toolbar.tsx`
 * for the shell, `src/components/SourceEditor.tsx` for source mode, and
 * `src/core/render/typesetter.ts` + MathJax 4 for the formulas. Nothing is mocked, and the
 * fixture is opened through the application's own "a file was opened by the OS" event.
 */

import { mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { $, $$, browser, expect } from '@wdio/globals';

// Mocha injects these as globals. The repository's tsconfig pins `types` to
// ["vite/client", "node"], and @types/mocha is only a transitive dependency, so the two
// signatures this file uses are declared here rather than by widening the shared tsconfig.
declare function describe(title: string, fn: () => void): void;
declare function it(title: string, fn: () => void | Promise<void>): void;
declare function before(fn: () => void | Promise<void>): void;

/** `withGlobalTauri: true` in tauri.conf.json exposes the Tauri API on `window`. */
interface TauriGlobal {
  event: { emit(name: string, payload: unknown): Promise<void> };
}

const FIXTURE_PATH = resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'math-render.md');

const TOOLBAR = '.om-mast';
const DOCUMENT_NAME = '[data-om-testid="document-name"]';
// The file commands (open, new, save as, export) sit behind this menu button.
const FILE_MENU = '[data-om-testid="file-menu"]';
const SAVE_BUTTON = '[data-om-testid="save-button"]';
const MODE_READ = '[data-om-testid="mode-read"]';
const MODE_SOURCE = '[data-om-testid="mode-source"]';
// Source mode hosts CodeMirror 6: the container is tagged `data-om-editor="source"` and the
// editable surface is the contenteditable `.cm-content` inside it.
const SOURCE_EDITOR = '[data-om-editor="source"]';
const SOURCE_CONTENT = '[data-om-editor="source"] .cm-content';
const DOC_ROOT = '.om-doc';
/** The external-change banner. Its absence is what these tests assert on. */
const CHANGE_BANNER = '.om-banner';
const FIXTURE_HEADING = '# OpenMark desktop fixture';

const LAUNCH_TIMEOUT_MS = 60_000;
const MOUNT_TIMEOUT_MS = 20_000;
const TYPESET_TIMEOUT_MS = 30_000;

/** Wait for a selector, with a failure message that names the selector. */
async function waitFor(selector: string, timeoutMsg: string, timeout = MOUNT_TIMEOUT_MS): Promise<void> {
  await browser.waitUntil(async () => (await $(selector)).isExisting(), {
    timeout,
    interval: 200,
    timeoutMsg: `${timeoutMsg} (${selector})`,
  });
}

/**
 * Opens a document the way the OS does.
 *
 * `src-tauri/src/lib.rs` delivers files handed to the process ("Open with", a shortcut, a
 * second instance) to the frontend as an `openmark://open-file` event, and `frontend_ready`
 * replays the ones that arrived before the bridge existed. A WebDriver session cannot use
 * that route on Windows: msedgedriver starts the WebView2 host process with a bare command
 * line, so `tauri:options.args` never reaches the app (verified — the live process command
 * line is just the executable path). Emitting the same event drives the identical handler —
 * `openPath()` → `read_text_file` IPC → parse → render — and is the only alternative to the
 * native file dialog, which WebDriver cannot operate.
 */
async function openFixture(path: string): Promise<void> {
  await browser.execute(
    (target: string) => {
      // The page under test is the app's own webview, where `withGlobalTauri: true`
      // guarantees this global; the cast only names what the page really exposes.
      const tauri = window as unknown as { __TAURI__: TauriGlobal };
      return tauri.__TAURI__.event.emit('openmark://open-file', target);
    },
    path,
  );
}

/**
 * Typesetting is lazy — a placeholder is only filled when it approaches the viewport — so a
 * formula must be scrolled into view before it can be asserted on.
 */
async function scrollTo(selector: string): Promise<void> {
  await browser.execute((sel: string) => {
    document.querySelector(sel)?.scrollIntoView({ block: 'center' });
  }, selector);
}

/**
 * Writes a document to a scratch file the test can also touch on disk.
 *
 * A copy rather than a committed fixture, because the point is to change its mtime from
 * outside the application and a fixture shared by other tests must not be mutated.
 */
function writeScratchDocument(name: string, content: string): string {
  const target = join(tmpdir(), `openmark-e2e-${name}`);
  writeFileSync(target, content, 'utf8');
  return target;
}

describe('external change detection', () => {
  before(async () => {
    const [handle] = await browser.getWindowHandles();
    if (handle) await browser.switchToWindow(handle);
  });

  /*
   * Regression test for a defect that made the banner appear on every document, seconds after
   * opening it, without anything editing the file.
   *
   * The Rust response structs serialised snake_case (`mtime_ms`, `is_dir`) while the TypeScript
   * layer declared camelCase, so the stat probe compared a real timestamp against `undefined`
   * and always concluded the file had changed. The same mismatch silently disabled the clobber
   * guard after the first save, because the mtime returned by the write was `undefined` and was
   * then sent back as the expected value.
   */
  it('does not report an external change when nothing has touched the file', async () => {
    const path = writeScratchDocument('quiet.md', '# Quiet\n\nNothing is editing this file.\n');
    await openFixture(path);

    // The poll interval is 2.5 s; three intervals is long enough for a spurious banner to have
    // appeared several times over.
    await browser.pause(8_000);
    expect(await $(CHANGE_BANNER).isExisting()).toBe(false);
  });

  it('reports an external change once the file is actually touched', async () => {
    const path = writeScratchDocument('touched.md', '# Touched\n\nThis file will change.\n');
    await openFixture(path);
    await browser.pause(3_000);
    // Still quiet, or the first test's condition was not actually fixed.
    expect(await $(CHANGE_BANNER).isExisting()).toBe(false);

    // Push the mtime forward far enough that no clock rounding can hide it.
    const future = new Date(Date.now() + 5_000);
    utimesSync(path, future, future);

    await browser.waitUntil(async () => (await $(CHANGE_BANNER)).isExisting(), {
      timeout: 15_000,
      interval: 500,
      timeoutMsg: 'the external-change banner never appeared after the file was touched',
    });
  });
});

describe('local images', () => {
  before(async () => {
    const [handle] = await browser.getWindowHandles();
    if (handle) await browser.switchToWindow(handle);
  });

  /*
   * Regression test for a defect that no unit test could see.
   *
   * `resolve_asset_url` takes `path`, but both call sites in `fileService.ts` invoke it with
   * `{ documentPath, relativePath }`. Tauri refuses to deserialise a command whose required
   * argument is absent, so the call rejected, `resolveLocalImages` caught it and marked the
   * image missing — every relative image in every document rendered as a broken placeholder,
   * and the health check called it absent.
   *
   * `tests/unit/dom/images.test.ts` could not catch it: its stub reads `args['relativePath']`
   * and returns a path it computes itself, so it agrees with the caller about a contract the
   * real command does not share. Only the real binary can disagree.
   */
  it('resolves a relative image reference through the real command', async () => {
    const dir = join(tmpdir(), 'openmark-e2e-images');
    mkdirSync(dir, { recursive: true });
    // A 1x1 PNG: the bytes never matter, only that the file exists and is an image.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    writeFileSync(join(dir, 'pixel.png'), png);
    const docPath = join(dir, 'figure.md');
    writeFileSync(docPath, '# Figure\n\n![a pixel](./pixel.png)\n', 'utf8');

    await openFixture(docPath);
    await waitFor('.om-doc img', 'the document never rendered an image');

    await browser.waitUntil(
      async () => {
        const src = await browser.execute(
          () => document.querySelector('.om-doc img')?.getAttribute('src') ?? '',
        );
        return /^https?:\/\/asset\.localhost\//.test(src);
      },
      {
        timeout: 20_000,
        interval: 500,
        timeoutMsg:
          'the relative image was never rewritten to an asset URL — resolve_asset_url likely rejected the call',
      },
    );

    // And it must not have been declared missing, which is what the failing path does.
    const missing = await browser.execute(
      () => document.querySelector('.om-doc img')?.hasAttribute('data-om-missing') ?? false,
    );
    expect(missing).toBe(false);
  });
});

describe('OpenMark desktop shell', () => {
  before(async () => {
    // `$`, `getTitle` and `click` each make the service re-resolve the active window, which
    // needs `@wdio/tauri-plugin` in the frontend; without it every command spends ~7 s on a
    // failed probe. An explicit switch to the app's only window suppresses that probe for the
    // rest of the session (`userSwitchedWindowCache` in @wdio/tauri-service).
    const [handle] = await browser.getWindowHandles();
    if (handle) await browser.switchToWindow(handle);
  });

  it('launches the real binary and renders the application shell', async () => {
    await waitFor(TOOLBAR, 'the OpenMark shell never mounted', LAUNCH_TIMEOUT_MS);

    const url = await browser.getUrl();
    console.log(`[desktop-e2e] url=${url} title=${await browser.getTitle()}`);

    // The window must be the embedded frontend, not an unbuilt dev-server URL.
    expect(url).toMatch(/tauri\.localhost|^tauri:\/\//);
    expect(await browser.getTitle()).toContain('OpenMark');
  });

  it('renders the masthead with its document name element', async () => {
    await waitFor(DOCUMENT_NAME, 'the document name element is missing');

    await expect($(FILE_MENU)).toExist();
    await expect($(SAVE_BUTTON)).toExist();

    // Empty start: the shell names the placeholder document before a file is opened.
    expect((await $(DOCUMENT_NAME).getText()).length).toBeGreaterThan(0);
  });

  it('opens the fixture through the shell open-file event', async () => {
    await openFixture(FIXTURE_PATH);

    await browser.waitUntil(async () => (await $(DOCUMENT_NAME).getText()).includes('math-render'), {
      timeout: MOUNT_TIMEOUT_MS,
      timeoutMsg: `the fixture was never opened (${FIXTURE_PATH})`,
    });

    console.log(`[desktop-e2e] document-name=${await $(DOCUMENT_NAME).getText()}`);
  });

  it('switches to source mode and shows the raw markdown', async () => {
    await $(MODE_SOURCE).click();

    await waitFor(SOURCE_EDITOR, 'the source editor never mounted');
    await waitFor(SOURCE_CONTENT, 'the CodeMirror content surface never appeared');
    await browser.waitUntil(async () => (await $(SOURCE_CONTENT)).isDisplayed(), {
      timeout: MOUNT_TIMEOUT_MS,
      timeoutMsg: 'the source editor stayed hidden',
    });

    expect(await $(SOURCE_CONTENT).getText()).toContain(FIXTURE_HEADING);
    expect(await $(MODE_SOURCE).getAttribute('aria-selected')).toBe('true');

    // Back to reading, so the math assertions run against the reading surface.
    await $(MODE_READ).click();
    await waitFor(DOC_ROOT, 'the reading surface did not come back');
  });

  it('typesets a display formula into real MathJax glyphs', async () => {
    const formula = `${DOC_ROOT} .om-math--display`;
    await waitFor(formula, 'the display formula placeholder never rendered');
    await scrollTo(formula);

    const glyphSelector = `${formula} mjx-container svg use, ${formula} mjx-container svg path`;

    await browser.waitUntil(
      async () => browser.execute((sel: string) => document.querySelectorAll(sel).length, glyphSelector),
      {
        timeout: TYPESET_TIMEOUT_MS,
        interval: 250,
        timeoutMsg: 'MathJax never filled the display formula',
      },
    );

    // A container with no glyphs "renders" but is blank, so count real glyph references.
    const glyphs = await browser.execute(
      (sel: string) => document.querySelectorAll(sel).length,
      glyphSelector,
    );
    expect(glyphs).toBeGreaterThan(3);
  });

  it('flags a broken formula as an error without losing its source', async () => {
    const errors = `${DOC_ROOT} .om-math[data-om-state="error"]`;
    await waitFor(errors, 'the broken formula was never reported as an error', TYPESET_TIMEOUT_MS);
    await scrollTo(errors);

    const errorNodes = await browser.execute(
      (sel: string) => document.querySelectorAll(sel).length,
      errors,
    );
    expect(errorNodes).toBeGreaterThan(0);

    // The failure must keep the offending TeX visible rather than blanking the node.
    const rendered = await browser.execute(
      (sel: string) =>
        Array.from(document.querySelectorAll(sel))
          .map((node) => (node as HTMLElement).innerText)
          .join('\n'),
      errors,
    );
    expect(rendered).toContain('thisMacroDoesNotExist');

    console.log(`[desktop-e2e] error nodes=${errorNodes}`);
  });
});

/*
 * Fullscreen and zoom have a desktop path the browser suite cannot reach: the native window's
 * fullscreen and WebView2's zoom factor, each behind its own capability grant. The keys are
 * dispatched in the page (their routing is covered by Playwright); what is asserted here is the
 * native result.
 */
describe('auto-pairing', () => {
  /*
   * The browser suite already proves the rules and the adapters. This runs the same keystrokes
   * through the packaged binary, which is the only place the WebView2 build of CodeMirror and
   * the real focus path are exercised — the two defects this feature had (a synthetic-event
   * guard reading `undefined`, and a caret left outside the pair) were both invisible to the
   * unit tests and only showed up when characters were actually typed.
   */
  it('closes a single asterisk and keeps the caret between the halves', async () => {
    const target = writeScratchDocument('auto-pair.md', 'hello world\n');
    // Opened once, then waited for: re-emitting inside a retry loop restarts the load each
    // time, so the document name never settles.
    await openFixture(target);
    // `writeScratchDocument` prefixes the name, so the tab shows
    // `openmark-e2e-auto-pair.md`; match the distinctive part like every other test here.
    await browser.waitUntil(
      async () => (await $(DOCUMENT_NAME).getText()).includes('auto-pair'),
      { timeout: 15_000, timeoutMsg: 'the fixture never opened' },
    );

    await $('[data-om-testid="mode-source"]').click();
    const content = await $('.om-source__host .cm-content');
    await content.waitForDisplayed({ timeout: 10_000 });
    await content.click();
    // End of the first line: inside the paragraph, not at the start of an empty one.
    await browser.keys(['Control', 'Home']);
    await browser.keys(['End']);
    await browser.keys(['*']);

    // Both halves present...
    await browser.waitUntil(async () => (await content.getText()).includes('hello world**'), {
      timeout: 5_000,
      timeoutMsg: `expected a closed pair, got: ${await content.getText()}`,
    });

    // ...and the caret is between them, which only shows when the next key lands inside.
    await browser.keys(['i', 't']);
    await expect(content).toHaveText(expect.stringContaining('hello world*it*'));
  });
});

describe('window controls', () => {
  const press = (init: KeyboardEventInit) =>
    browser.execute((options: KeyboardEventInit) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...options }));
    }, init);

  const nativeFullscreen = () =>
    browser.execute(() => {
      const tauri = window as unknown as { __TAURI__: { window: { getCurrentWindow(): { isFullscreen(): Promise<boolean> } } } };
      return tauri.__TAURI__.window.getCurrentWindow().isFullscreen();
    });

  it('F11 puts the native window into fullscreen and back', async () => {
    await waitFor(TOOLBAR, 'the OpenMark shell never mounted', LAUNCH_TIMEOUT_MS);
    await press({ key: 'F11', code: 'F11' });
    await browser.waitUntil(async () => (await nativeFullscreen()) === true, {
      timeout: MOUNT_TIMEOUT_MS,
      timeoutMsg: 'F11 did not make the window fullscreen',
    });
    await press({ key: 'F11', code: 'F11' });
    await browser.waitUntil(async () => (await nativeFullscreen()) === false, {
      timeout: MOUNT_TIMEOUT_MS,
      timeoutMsg: 'F11 did not leave fullscreen',
    });
  });

  it('Ctrl+Shift+= zooms the WebView2 page and Ctrl+Shift+0 restores it', async () => {
    const ratio = () => browser.execute(() => window.devicePixelRatio);
    const before = await ratio();
    await press({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true });
    await press({ key: '+', code: 'Equal', ctrlKey: true, shiftKey: true });
    await browser.waitUntil(async () => (await ratio()) > before * 1.15, {
      timeout: MOUNT_TIMEOUT_MS,
      timeoutMsg: `the webview zoom did not change (devicePixelRatio stayed ${before})`,
    });
    await press({ key: ')', code: 'Digit0', ctrlKey: true, shiftKey: true });
    await browser.waitUntil(async () => Math.abs((await ratio()) - before) < 0.01, {
      timeout: MOUNT_TIMEOUT_MS,
      timeoutMsg: 'Ctrl+Shift+0 did not restore 100%',
    });
  });
});

/*
 * Version history reads the real `.openmark-backups` folder that `write_text_file_atomic`
 * fills, so only the real binary can show the two halves agree: the backup naming in Rust and
 * the listing and restore in the frontend.
 */
describe('version history', () => {
  it('lists the backups taken by saves and loads an earlier version', async () => {
    const dir = join(tmpdir(), `openmark-e2e-history-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, 'history.md');
    writeFileSync(path, '# 第一版\n', 'utf8');
    await openFixture(path);
    await browser.waitUntil(async () => (await $(DOCUMENT_NAME).getText()).includes('history'), {
      timeout: MOUNT_TIMEOUT_MS,
      timeoutMsg: 'the history fixture never opened',
    });

    await $(MODE_SOURCE).click();
    for (const addition of ['第二版', '第三版']) {
      await $(SOURCE_CONTENT).click();
      await browser.keys(['Control', 'End']);
      await browser.keys(addition.split(''));
      await $(SAVE_BUTTON).click();
      // Each save backs up what was on disk before it; give the write time to land.
      await browser.pause(400);
    }

    await $('[data-om-testid="panel-recent"]').click();
    await browser.waitUntil(async () => (await $$('[data-om-testid="version-item"]').length) >= 2, {
      timeout: MOUNT_TIMEOUT_MS,
      timeoutMsg: 'the backups taken by the two saves were not listed',
    });

    // Newest first, so the last entry is the file as it was before the first save.
    const restoreButtons = await $$('[data-om-testid="version-restore"]').getElements();
    await restoreButtons[restoreButtons.length - 1]!.click();
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => document.querySelector('.cm-content')?.textContent ?? '');
        return text.includes('第一版') && !text.includes('第二版');
      },
      { timeout: MOUNT_TIMEOUT_MS, timeoutMsg: 'loading the oldest version did not bring back the original text' },
    );
  });
});

/*
 * Spoken formulas start MathJax's speech worker from a `blob:` URL and load its rules from the
 * vendored `sre/` folder. Under the app's own origin and header CSP that is a different setting
 * from the browser suite, so it is checked here. The setting is read when MathJax boots, hence
 * the reload.
 */
describe('spoken formulas', () => {
  it('names a formula by its speech when the experimental setting is on', async () => {
    await browser.execute(() => {
      localStorage.setItem('openmark.settings.v1', JSON.stringify({ version: 1, reading: { mathSpeech: true } }));
      location.reload();
    });
    await waitFor(TOOLBAR, 'the shell did not come back after the reload', LAUNCH_TIMEOUT_MS);
    // The reloaded frontend registers its open-file listener after the toolbar mounts, so an
    // event sent too early is lost; send it until the document is open.
    await browser.waitUntil(
      async () => {
        await openFixture(FIXTURE_PATH);
        await browser.pause(500);
        return (await $(DOCUMENT_NAME).getText()).includes('math-render');
      },
      { timeout: MOUNT_TIMEOUT_MS, timeoutMsg: 'the fixture did not open after the reload' },
    );
    await $(MODE_READ).click();
    try {
      await browser.waitUntil(
        async () =>
          browser.execute(() =>
            Array.from(document.querySelectorAll('.om-math[data-om-state="ok"]')).some((node) =>
              /equals|plus|squared|over/.test(node.getAttribute('aria-label') ?? ''),
            ),
          ),
        { timeout: LAUNCH_TIMEOUT_MS, timeoutMsg: 'no formula was named by a spoken description' },
      );
    } catch (error) {
      const state = await browser.execute(() => ({
        stored: localStorage.getItem('openmark.settings.v1'),
        speech: (window as unknown as { MathJax?: { config?: { options?: Record<string, unknown> } } }).MathJax?.config?.options?.['enableSpeech'],
        worker: (window as unknown as { MathJax?: { config?: { options?: Record<string, unknown> } } }).MathJax?.config?.options?.['worker'],
        formulas: Array.from(document.querySelectorAll('.om-math')).slice(0, 3).map((n) => `${n.getAttribute('data-om-state')} | ${n.getAttribute('aria-label')} | ${(n as HTMLElement).title}`),
        resources: performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /sre|worker|mathmaps/.test(n)),
      }));
      console.log(`[desktop-e2e] speech diagnostics ${JSON.stringify(state)}`);
      throw error;
    } finally {
      await browser.execute(() => {
        localStorage.removeItem('openmark.settings.v1');
        location.reload();
      });
      await waitFor(TOOLBAR, 'the shell did not come back after resetting the setting', LAUNCH_TIMEOUT_MS);
    }
  });
});
