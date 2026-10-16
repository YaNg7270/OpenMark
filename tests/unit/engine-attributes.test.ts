import { describe, expect, it } from 'vitest';
import { createEngine, parseDocument } from '@/core/markdown/engine';

const render = (source: string) => parseDocument(source, createEngine()).html;

describe('source line anchors', () => {
  it('tags each top-level block with its 1-based source line', () => {
    const html = render('# A\n\npara\n\n- item\n');
    expect(html).toMatch(/<h1[^>]* data-om-line="1"/);
    expect(html).toMatch(/<p[^>]* data-om-line="3"/);
    expect(html).toMatch(/<ul[^>]* data-om-line="5"/);
  });

  it('counts frontmatter lines, without tagging the frontmatter itself', () => {
    const html = render('---\ntitle: x\n---\n\n# A\n');
    expect(html).toMatch(/<h1[^>]* data-om-line="5"/);
    expect(html).not.toMatch(/<details[^>]*data-om-line/);
  });

  it('does not tag nested blocks', () => {
    expect(render('- item\n')).not.toMatch(/<li[^>]*data-om-line/);
  });
});

describe('standalone image paragraphs', () => {
  it('marks a paragraph that holds only an image, linked or not', () => {
    expect(render('![a](x.png)\n')).toContain('data-om-standalone-image');
    expect(render('[![a](x.png)](https://example.com)\n')).toContain('data-om-standalone-image');
  });

  it('does not mark an image inside a line of text', () => {
    expect(render('see ![a](x.png) here\n')).not.toContain('data-om-standalone-image');
    expect(render('![a](x.png) ![b](y.png)\n')).not.toContain('data-om-standalone-image');
  });
});
