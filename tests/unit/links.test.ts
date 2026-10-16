import { describe, expect, it } from 'vitest';
import { fragmentCandidates, resolveLink } from '@/core/markdown/links';

describe('resolveLink', () => {
  it('resolves a relative Markdown link against the document folder', () => {
    expect(resolveLink('C:\\notes\\guide\\intro.md', './setup.md')).toEqual({
      kind: 'document',
      path: 'C:\\notes\\guide\\setup.md',
      fragment: null,
    });
  });

  it('folds `..` and keeps a fragment, decoded', () => {
    expect(resolveLink('C:/notes/guide/intro.md', '../ref/api.markdown#%E5%AE%89%E8%A3%85')).toEqual({
      kind: 'document',
      path: 'C:/notes/ref/api.markdown',
      fragment: '安装',
    });
  });

  it('decodes percent-encoded path segments', () => {
    expect(resolveLink('/docs/a.md', 'my%20notes.md')).toMatchObject({ kind: 'document', path: '/docs/my notes.md' });
  });

  it('does not climb above the root', () => {
    expect(resolveLink('C:/a.md', '../../b.md')).toMatchObject({ path: 'C:/b.md' });
  });

  it('classifies fragments, web links and other schemes', () => {
    expect(resolveLink('C:/a.md', '#top')).toEqual({ kind: 'fragment', fragment: 'top' });
    expect(resolveLink('C:/a.md', 'https://example.com')).toEqual({ kind: 'external', url: 'https://example.com' });
    expect(resolveLink('C:/a.md', 'javascript:alert(1)')).toMatchObject({ kind: 'unsupported' });
    expect(resolveLink('C:/a.md', 'file:///C:/x.md')).toMatchObject({ kind: 'unsupported' });
  });

  /*
   * A link in a received document must not launch a program. Anything that is not Markdown is
   * reported as a plain file, which the app never opens.
   */
  it('never treats a non-Markdown file as a document', () => {
    expect(resolveLink('C:/a.md', './tool.exe')).toEqual({ kind: 'file', path: 'C:/tool.exe' });
    expect(resolveLink('C:/a.md', './b.md.exe')).toMatchObject({ kind: 'file' });
  });

  it('cannot resolve a relative link from an unsaved document', () => {
    expect(resolveLink(null, './b.md')).toMatchObject({ kind: 'unsupported' });
  });
});

describe('fragmentCandidates', () => {
  it('tries the id as written, then the heading id forms', () => {
    expect(fragmentCandidates('Getting Started')).toEqual(['Getting Started', 'om-h-Getting Started', 'om-h-getting-started']);
  });
});
