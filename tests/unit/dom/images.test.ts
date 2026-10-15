import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveLocalImages } from '@/core/render/images';

/**
 * Local image resolution.
 *
 * This pass exists because of a defect: the resolver had been written but nothing ever called
 * it, so every relative image in every document rendered as a broken icon. A test that only
 * checked "the function works" would not have caught that — the caller was the bug. These tests
 * therefore drive the pass the way the views do, through a stubbed Tauri bridge, and assert on
 * the DOM that results.
 */

const invokes: { cmd: string; args: Record<string, unknown> }[] = [];

/** Installs a fake Tauri bridge so the desktop branch of the file service is taken. */
function stubDesktop(resolve: (path: string) => string | null): void {
  (globalThis as unknown as { window: Record<string, unknown> }).window['__TAURI_INTERNALS__'] = {
    invoke: async (cmd: string, args: Record<string, unknown>) => {
      invokes.push({ cmd, args });
      if (cmd === 'resolve_asset_url') {
        const resolved = resolve(String(args['relativePath'] ?? ''));
        if (resolved === null) throw new Error('not found');
        return resolved;
      }
      return null;
    },
    convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
  };
}

function makeRoot(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

beforeEach(() => {
  invokes.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as unknown as { window: Record<string, unknown> }).window['__TAURI_INTERNALS__'];
  document.body.innerHTML = '';
});

describe('resolveLocalImages', () => {
  it('rewrites a relative source into a loadable asset URL', async () => {
    stubDesktop((path) => `C:/docs/${path.replace('./', '')}`);
    const root = makeRoot('<img src="./img/figure-1.png" alt="图 1">');

    const report = await resolveLocalImages(root, 'C:/docs/notes.md');

    expect(report.rewritten).toBe(1);
    expect(report.missing).toBe(0);
    const image = root.querySelector('img')!;
    expect(image.getAttribute('src')).toContain('asset://localhost/');
    expect(image.getAttribute('src')).toContain('figure-1.png');
  });

  it('leaves absolute URLs and data URIs alone', async () => {
    stubDesktop((path) => `C:/docs/${path}`);
    const root = makeRoot(
      '<img src="https://example.com/a.png"><img src="data:image/png;base64,AAAA"><img src="asset://localhost/x.png">',
    );

    const report = await resolveLocalImages(root, 'C:/docs/notes.md');

    expect(report.rewritten).toBe(0);
    // Fetching a remote image is a decision the document already made; rewriting it would break it.
    expect(invokes.filter((call) => call.cmd === 'resolve_asset_url')).toHaveLength(0);
    expect(root.querySelector('img')!.getAttribute('src')).toBe('https://example.com/a.png');
  });

  it('refuses a path that climbs out of the document directory, without touching the filesystem', async () => {
    stubDesktop((path) => `C:/docs/${path}`);
    const root = makeRoot('<img src="../../../../etc/passwd">');

    const report = await resolveLocalImages(root, 'C:/docs/notes.md');

    expect(report.missing).toBe(1);
    expect(invokes, 'the filesystem was consulted for a traversal attempt').toHaveLength(0);
    expect(root.querySelector('img')!.dataset['omMissing']).toBe('true');
  });

  it('marks an image that does not exist rather than leaving a blank space', async () => {
    stubDesktop(() => null);
    const root = makeRoot('<img src="./img/gone.png">');

    const report = await resolveLocalImages(root, 'C:/docs/notes.md');

    expect(report.missing).toBe(1);
    expect(report.missingPaths).toEqual(['./img/gone.png']);
    const image = root.querySelector('img')!;
    expect(image.dataset['omMissing']).toBe('true');
    // The path becomes the alt text, so a clipped figure still says what it was.
    expect(image.alt).toBe('./img/gone.png');
  });

  it('decodes a percent-encoded reference before resolving it', async () => {
    stubDesktop((path) => `C:/docs/${path}`);
    const root = makeRoot('<img src="./img/%E4%B8%AD%E6%96%87.png">');

    await resolveLocalImages(root, 'C:/docs/notes.md');

    const call = invokes.find((entry) => entry.cmd === 'resolve_asset_url');
    // A file on disk is named with real characters; passing the encoded form would miss it.
    expect(String(call?.args['relativePath'])).toBe('./img/中文.png');
  });

  it('does nothing when there is no document path to resolve against', async () => {
    stubDesktop((path) => `C:/docs/${path}`);
    const root = makeRoot('<img src="./img/a.png">');

    const report = await resolveLocalImages(root, null);

    expect(report.rewritten).toBe(0);
    expect(invokes).toHaveLength(0);
  });

  it('handles a document with no images', async () => {
    stubDesktop((path) => `C:/docs/${path}`);
    const root = makeRoot('<p>没有图片。</p>');

    const report = await resolveLocalImages(root, 'C:/docs/notes.md');

    expect(report).toEqual({ rewritten: 0, missing: 0, missingPaths: [] });
  });
});
