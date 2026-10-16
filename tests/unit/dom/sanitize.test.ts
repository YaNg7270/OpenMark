import { describe, expect, it } from 'vitest';
import { createEngine, parseDocument } from '@/core/markdown/engine';
import { sanitizeHtml } from '@/core/markdown/sanitize';

/**
 * Sanitiser and end-to-end parse tests.
 *
 * These live in the jsdom project because DOMPurify needs a document. They are the direct
 * tests of a security boundary, so they assert on the produced HTML rather than trusting
 * that the browser suite would have caught a regression.
 */

const engine = createEngine();

function render(source: string): { html: string; removed: string[] } {
  const sanitized = sanitizeHtml(engine.render(source));
  return { html: sanitized.html, removed: sanitized.removed };
}

describe('sanitizeHtml: hostile input', () => {
  it('removes script elements and their bodies', () => {
    const { html } = render('<p>before</p><script>window.__pwned = true;</script><p>after</p>');
    expect(html).toContain('before');
    expect(html).toContain('after');
    expect(html).not.toContain('<script');
    // The body must go too, or the payload would render as visible source text.
    expect(html).not.toContain('__pwned');
  });

  it('strips event-handler attributes', () => {
    const { html } = render('<img src="x.png" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('alert(1)');
  });

  it('strips javascript: and file: URLs from links', () => {
    const { html } = render('<a href="javascript:alert(1)">x</a><a href="file:///C:/Windows/win.ini">y</a>');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('file:');
  });

  it('removes iframe, object, embed and form', () => {
    const { html } = render(
      '<iframe src="https://evil.invalid"></iframe><object data="x"></object><embed src="y"><form action="z"></form>',
    );
    for (const tag of ['iframe', 'object', 'embed', 'form']) {
      expect(html, `${tag} survived sanitisation`).not.toContain(`<${tag}`);
    }
  });

  it('reports what it removed so the diagnostics panel can explain it', () => {
    // Categories, not tag names: the useful distinction for a reader is what KIND of thing was
    // dangerous. A removed script is a different statement from a removed frame.
    const { removed } = render('<script>x</script><iframe src="y"></iframe>');
    expect(removed).toContain('script');
    expect(removed).toContain('frame');
  });

  it('reports attribute-level removals that leave the element in place', () => {
    /*
     * DOMPurify keeps the anchor and strips only its `href`. Without this check the sanitiser
     * would report nothing at all, and the reader would be told the document was fine while a
     * link silently stopped working.
     */
    expect(render('<a href="javascript:alert(1)">x</a>').removed).toContain('unsafe-url');
    expect(render('<img src=x onerror="alert(1)">').removed).toContain('event-handler');
    expect(render('<svg><rect/></svg>').removed).toContain('svg');
  });
});

describe('sanitizeHtml: legitimate markdown must survive', () => {
  /*
   * This block exists because of a real defect. Setting `KEEP_CONTENT: false` on DOMPurify
   * deleted every text node in the document while leaving the element structure intact, so
   * the page rendered as a set of empty paragraphs and looked like a CSS failure. These
   * assertions pin the behaviour that was broken.
   */
  it('keeps text inside allowed elements', () => {
    const { html } = render('# 标题\n\n价格是 $20 和 $30。\n');
    expect(html).toContain('标题');
    expect(html).toContain('价格是');
  });

  it('keeps CJK, emoji and combining marks intact', () => {
    const { html } = render('中文 English 😀 é 组合\u0301\n');
    expect(html).toContain('中文 English 😀');
    expect(html).toContain('组合\u0301');
  });

  it('keeps inline HTML that authors legitimately use', () => {
    const { html } = render('a <kbd>Ctrl</kbd> <sub>1</sub> <mark>hi</mark> b\n');
    expect(html).toContain('<kbd>Ctrl</kbd>');
    expect(html).toContain('<sub>1</sub>');
    expect(html).toContain('<mark>hi</mark>');
  });

  it('keeps the placeholder elements the renderer depends on', () => {
    const { html } = render('inline $x^2$ and a table:\n\n$$a=b$$\n');
    expect(html).toContain('data-om-math');
  });

  it('keeps task-list checkboxes and their checked state', () => {
    // Assert on the raw render first, so a failure here blames the parser rather than the
    // sanitiser (or vice versa) instead of leaving one opaque diff.
    const raw = engine.render('- [x] done\n- [ ] todo\n');
    expect(raw, 'parser output').toContain('type="checkbox"');
    expect(raw, 'parser output').toContain('checked');

    const { html } = render('- [x] done\n- [ ] todo\n');
    expect(html, 'sanitised output').toContain('type="checkbox"');
    // `checked` must survive: the reading view shows progress state from it.
    expect(html).toMatch(/checked/);
    expect(html).toContain('disabled');
  });

  it('keeps GFM tables with every part of the structure', () => {
    const { html } = render('| A | B |\n| :-- | --: |\n| 1 | 2 |\n');
    // `<table` rather than `<table>`: top-level blocks carry `data-om-line`.
    for (const fragment of ['<table', '<thead>', '<tbody>', '<th', '<td']) {
      expect(html, `missing ${fragment}`).toContain(fragment);
    }
  });

  /*
   * These pin a defect that was found by testing rather than by reasoning.
   *
   * `ALLOWED_URI_REGEXP` was narrowed to a simple anchored scheme list, which reads as
   * stricter but is in fact destructive: DOMPurify applies that pattern to every URI-valued
   * attribute, and the pattern's relative-URL alternative is what permits ordinary paths.
   * The result was a document whose images and internal links had all been silently
   * deleted — and, bizarrely, whose checkboxes had lost `type="checkbox"`, because a
   * `type` attribute is validated the same way.
   */
  describe('URL values', () => {
    const URL_CASES: { name: string; source: string; expectPresent: string }[] = [
      { name: 'relative link', source: '[next](./chapter-2.md)', expectPresent: 'href="./chapter-2.md"' },
      { name: 'parent-relative link', source: '[up](../notes/x.md)', expectPresent: 'href="../notes/x.md"' },
      { name: 'relative image', source: '![fig](img/figure-1.png)', expectPresent: 'src="img/figure-1.png"' },
      { name: 'same-document anchor', source: '[top](#section)', expectPresent: 'href="#section"' },
      { name: 'absolute https link', source: '[e](https://example.com/a)', expectPresent: 'href="https://example.com/a"' },
      { name: 'mailto link', source: '[m](mailto:a@b.example)', expectPresent: 'href="mailto:a@b.example"' },
    ];

    for (const testCase of URL_CASES) {
      it(`preserves a ${testCase.name}`, () => {
        const { html } = render(`${testCase.source}\n`);
        expect(html).toContain(testCase.expectPresent);
      });
    }

    it('permits the asset: scheme used for local files in the desktop webview', () => {
      const { html } = render('<img src="asset://localhost/C:/pictures/figure.png" alt="f">\n');
      expect(html).toContain('src="asset://localhost/C:/pictures/figure.png"');
    });

    it('blocks dangerous schemes while preserving the element', () => {
      const { html } = render('<a href="vbscript:msgbox(1)">x</a>\n');
      expect(html).not.toContain('vbscript:');
      expect(html).toContain('x');
    });
  });
});

describe('parseDocument integration', () => {
  it('produces the registry entries the typesetter needs', () => {
    const parsed = parseDocument(
      ['# T', '', 'inline $a$', '', '$$b$$', '', '```js', 'x()', '```', '', '```mermaid', 'graph TD; A-->B', '```', ''].join('\n'),
      engine,
      { sanitizeHtml },
    );
    expect(parsed.math).toHaveLength(2);
    expect(parsed.code).toHaveLength(1);
    expect(parsed.mermaid).toHaveLength(1);
    expect(parsed.html).toContain('data-om-code');
    expect(parsed.html).toContain('data-om-mermaid');
  });

  it('assigns each placeholder an id that appears in the HTML', () => {
    const parsed = parseDocument('$a$ and $b$\n', engine, { sanitizeHtml });
    for (const expr of parsed.math) {
      expect(parsed.html).toContain(`data-om-math="${expr.id}"`);
    }
  });

  it('never emits a placeholder id that is missing from a registry', () => {
    const parsed = parseDocument('$a$\n\n```js\nx\n```\n', engine, { sanitizeHtml });
    const ids = new Set([...parsed.math.map((m) => m.id), ...parsed.code.map((c) => c.id)]);
    const referenced = [...parsed.html.matchAll(/data-om-(?:math|code)="([^"]+)"/g)].map((m) => m[1]!);
    expect(referenced.length).toBeGreaterThan(0);
    for (const id of referenced) expect(ids.has(id), `orphan placeholder ${id}`).toBe(true);
  });
});
