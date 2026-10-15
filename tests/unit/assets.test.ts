import { describe, expect, it } from 'vitest';
import {
  assetDirectoryFor,
  extensionForMime,
  imageMarkdown,
  sanitizeAssetName,
} from '@/core/fs/assets';

/**
 * Image asset naming and placement.
 *
 * These are the decisions that decide where a pasted screenshot ends up and what it is called,
 * and both are hard to change later: the path is written into the document, so getting it
 * wrong means every reference the user has already made becomes wrong too.
 */

describe('assetDirectoryFor', () => {
  it('names the folder after the document, beside it', () => {
    // A shared `assets/` folder would collide when a directory holds several documents.
    expect(assetDirectoryFor('/docs/chapter-1.md')).toBe('/docs/chapter-1.assets');
  });

  it('handles Windows separators', () => {
    expect(assetDirectoryFor('C:\\notes\\report.md')).toBe('C:\\notes\\report.assets');
  });

  it('handles a bare file name with no directory', () => {
    expect(assetDirectoryFor('notes.md')).toBe('notes.assets');
  });

  it('keeps only the last extension', () => {
    expect(assetDirectoryFor('/a/b/spec.v2.md')).toBe('/a/b/spec.v2.assets');
  });

  it('falls back for a file with no extension', () => {
    expect(assetDirectoryFor('/a/README')).toBe('/a/README.assets');
  });

  it('does not lose the directory for a dotted path', () => {
    // Naive splitting on '.' would produce a directory named after the parent folder.
    expect(assetDirectoryFor('/home/user.name/doc.md')).toBe('/home/user.name/doc.assets');
  });
});

describe('sanitizeAssetName', () => {
  it('keeps a descriptive name, because it is documentation', () => {
    expect(sanitizeAssetName('screen-shot-of-the-error.png', 'png')).toBe('screen-shot-of-the-error.png');
  });

  it('replaces characters that break a path or a markdown link', () => {
    const sanitized = sanitizeAssetName('a<b>c:d"e|f?g*h.png', 'png');
    for (const unsafe of ['<', '>', ':', '"', '|', '?', '*']) {
      expect(sanitized, `${unsafe} survived`).not.toContain(unsafe);
    }
  });

  it('collapses whitespace into single dashes', () => {
    expect(sanitizeAssetName('my   image   name.png', 'png')).toBe('my-image-name.png');
  });

  it('strips a leading dot so the file is not hidden', () => {
    expect(sanitizeAssetName('.hidden.png', 'png')).toBe('hidden.png');
  });

  it('appends the extension when the name has none', () => {
    expect(sanitizeAssetName('screenshot', 'png')).toBe('screenshot.png');
  });

  it('generates a usable name from nothing', () => {
    const generated = sanitizeAssetName('   ', 'png');
    expect(generated).toMatch(/^image-\d+\.png$/);
  });

  it('never produces an empty name', () => {
    for (const input of ['', '  ', '...', '///', '???']) {
      expect(sanitizeAssetName(input, 'png').length, `empty result for ${JSON.stringify(input)}`).toBeGreaterThan(0);
    }
  });
});

describe('extensionForMime', () => {
  it('maps the image types a paste can produce', () => {
    expect(extensionForMime('image/png')).toBe('png');
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/webp')).toBe('webp');
    expect(extensionForMime('image/svg+xml')).toBe('svg');
  });

  it('is case-insensitive', () => {
    expect(extensionForMime('IMAGE/PNG')).toBe('png');
  });

  it('falls back to png for an unknown type rather than producing no extension', () => {
    expect(extensionForMime('application/octet-stream')).toBe('png');
    expect(extensionForMime('')).toBe('png');
  });
});

describe('imageMarkdown', () => {
  it('produces a relative reference', () => {
    const markdown = imageMarkdown({ relativePath: './doc.assets/fig-1.png', absolutePath: null, size: 10 });
    expect(markdown).toBe('![](./doc.assets/fig-1.png)');
  });

  it('leaves alt text empty rather than inventing it from the file name', () => {
    // Fabricated alt text is worse for a screen reader than an empty alt, which is skipped.
    const markdown = imageMarkdown(
      { relativePath: './doc.assets/3f9a2b.png', absolutePath: null, size: 10 },
      '',
    );
    expect(markdown).toBe('![](./doc.assets/3f9a2b.png)');
  });

  it('passes through alt text when the caller supplies it', () => {
    expect(imageMarkdown({ relativePath: './a.png', absolutePath: null, size: 1 }, '架构图')).toBe('![架构图](./a.png)');
  });

  it('accepts a data URI, which is what the browser backend produces', () => {
    const markdown = imageMarkdown({ relativePath: 'data:image/png;base64,AAAA', absolutePath: null, size: 3 });
    expect(markdown).toBe('![](data:image/png;base64,AAAA)');
  });
});
