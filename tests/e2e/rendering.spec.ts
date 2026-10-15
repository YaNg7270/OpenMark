import { expect, test, type Page } from '@playwright/test';

/**
 * Rendering smoke suite.
 *
 * This suite exists to answer questions that "the page did not throw" cannot:
 *  - Did MathJax actually produce **glyphs**, or an empty container that merely looks fine?
 *  - Was the **network never touched**? The app must render fully offline, and MathJax's
 *    component loader silently falls back to a CDN when a font or extension path is wrong,
 *    so a request log is the only reliable detector.
 *  - Did a failing formula **keep its source** instead of vanishing?
 *
 * Fixtures are injected through the `__OPENMARK_TEST_FILES__` seam before any app script
 * runs, so the document is open by the time the first assertion executes.
 */

/** Any request to an origin other than the app itself is a defect. */
function trackExternalRequests(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (request) => {
    const url = request.url();
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost') || url.startsWith('data:')) return;
    external.push(url);
  });
  return external;
}

interface FixtureArgs {
  name: string;
  content: string;
}

async function openFixture(page: Page, name: string, content: string): Promise<void> {
  await page.addInitScript((args: FixtureArgs) => {
    window.__OPENMARK_TEST_FILES__ = { [args.name]: args.content };
  }, { name, content });

  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__openmark__));
  await page.evaluate((args: FixtureArgs) => window.__openmark__!.openPath(args.name), { name, content });
  await expect(page.getByTestId('document-name')).toHaveText(name);
}

test.describe('critical path', () => {
  test('app shell loads without touching the network', async ({ page }) => {
    const external = trackExternalRequests(page);
    await page.goto('/');
    await expect(page.locator('.om-toolbar')).toBeVisible();
    // All four view modes must be offered: read, instant, source, split.
    await expect(page.locator('.om-segmented__item')).toHaveCount(4);
    for (const mode of ['read', 'instant', 'source', 'split']) {
      await expect(page.getByTestId(`mode-${mode}`)).toBeVisible();
    }
    expect(external, `unexpected external requests: ${external.join(', ')}`).toEqual([]);
  });

  test('renders a mixed document: headings, GFM table, task list, footnote, code', async ({ page }) => {
    await openFixture(
      page,
      'mixed.md',
      [
        '---',
        'title: 混合文档',
        '---',
        '',
        '# 标题一',
        '',
        '段落 with **bold**, `inline code`, and a [link](https://example.com).',
        '',
        '## 表格',
        '',
        '| 列 A | 列 B |',
        '| :--- | ---: |',
        '| 1 | 2 |',
        '| 3 | 4 |',
        '',
        '- [x] 已完成',
        '- [ ] 未完成',
        '',
        '```js',
        'const answer = 42;',
        '```',
        '',
        '脚注引用[^1]。',
        '',
        '[^1]: 脚注内容。',
      ].join('\n'),
    );

    await expect(page.locator('.om-doc h1')).toHaveText('标题一');
    await expect(page.locator('.om-doc table')).toBeVisible();
    await expect(page.locator('.om-doc table thead th')).toHaveCount(2);
    await expect(page.locator('.om-doc li.task-list-item')).toHaveCount(2);
    await expect(page.locator('.om-doc li.task-list-item input:checked')).toHaveCount(1);
    await expect(page.locator('.om-doc .footnotes')).toContainText('脚注内容');
    await expect(page.locator('.om-frontmatter')).toHaveCount(1);

    // Code block is filled by the lazy highlighter; wait for the token spans.
    const code = page.locator('.om-code');
    await expect(code.locator('.shiki')).toBeVisible();
    await expect(code).toContainText('const answer = 42;');
  });

  test('typesets LaTeX and mhchem with real glyphs, offline', async ({ page }) => {
    const external = trackExternalRequests(page);
    await openFixture(
      page,
      'math.md',
      [
        '# 公式',
        '',
        '行内公式 $E = mc^2$ 与 $\\alpha_1^{\\beta_2}$。',
        '',
        '$$',
        '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
        '$$',
        '',
        '$$',
        '\\begin{aligned}',
        'a &= b + c \\\\',
        '  &= d',
        '\\end{aligned}',
        '$$',
        '',
        '$$\\ce{2H2 + O2 -> 2H2O}$$',
        '',
        '$$\\pu{123 kJ mol-1}$$',
      ].join('\n'),
    );

    // Every expression must be typeset, and each must be a real rendering.
    const containers = page.locator('mjx-container');
    await expect(containers).toHaveCount(6);

    for (let i = 0; i < 6; i++) {
      const node = containers.nth(i);
      // A MathJax SVG that carries no glyph paths rendered "successfully" but blankly.
      const glyphCount = await node.locator('svg use, svg path').count();
      expect(glyphCount, `expression #${i} produced ${glyphCount} glyph elements`).toBeGreaterThan(3);
    }

    // No expression may have failed.
    await expect(page.locator('merror')).toHaveCount(0);

    // The original TeX must survive into the DOM for copy-as-LaTeX.
    await expect(page.locator('[data-latex]').first()).toBeAttached();
    await expect(page.locator('.om-math')).toHaveCount(6);

    expect(external, `MathJax reached the network: ${external.join(', ')}`).toEqual([]);
  });

  test('a broken formula keeps its source and is reported', async ({ page }) => {
    await openFixture(
      page,
      'broken.md',
      ['# 错误公式', '', '未定义宏：$\\thisMacroDoesNotExist{1}$', '', '括号不匹配：$\\frac{a}{b$', ''].join('\n'),
    );

    const failed = page.locator('.om-math[data-om-state="error"]');
    await expect(failed.first()).toBeVisible();

    // The requirement is that a failure never makes the LaTeX disappear.
    await expect(failed.first()).toContainText('thisMacroDoesNotExist');

    // And that the failure is surfaced as an actionable diagnostic.
    await page.getByTestId('panel-diagnostics').click();
    await expect(page.getByTestId('diagnostics-summary')).toContainText('错误');
    await expect(page.locator('.om-diagnostic[data-code="math-render-error"]').first()).toBeVisible();
  });

  test('currency is not mistaken for math, and $ inside code is inert', async ({ page }) => {
    await openFixture(
      page,
      'ambiguity.md',
      [
        '# 歧义',
        '',
        '价格是 $20 和 $30，不是公式。',
        '',
        '转义：\\$100 也不是公式。',
        '',
        '`$notMath$`',
        '',
        '```sh',
        'echo "$HOME and $PATH"',
        '```',
        '',
        '真正的公式 $x^2$ 应当渲染。',
      ].join('\n'),
    );

    // Exactly one expression, the real one.
    await expect(page.locator('.om-math')).toHaveCount(1);
    await expect(page.locator('.om-math mjx-container')).toHaveCount(1);

    const body = await page.locator('.om-doc').innerText();
    expect(body).toContain('$20 和 $30');
    expect(body).toContain('$notMath$');
    expect(body).toContain('$HOME and $PATH');
  });

  test('renders a Mermaid diagram to SVG', async ({ page }) => {
    await openFixture(
      page,
      'diagram.md',
      ['# 图表', '', '```mermaid', 'graph TD', '  A[开始] --> B{判断}', '  B -->|是| C[结束]', '```', ''].join('\n'),
    );
    const figure = page.locator('.om-mermaid');
    await expect(figure.locator('svg')).toBeVisible({ timeout: 30_000 });
    await expect(figure.locator('svg')).toContainText('开始');
  });

  test('outline lists headings and navigation is wired', async ({ page }) => {
    await openFixture(
      page,
      'outline.md',
      ['# 第一章', '', '## 1.1 小节', '', '### 1.1.1 更深', '', '## 1.2 另一节', ''].join('\n'),
    );
    const links = page.locator('.om-outline__link');
    await expect(links).toHaveCount(4);
    await expect(links.first()).toContainText('第一章');
    // Indentation encodes nesting depth.
    await expect(links.nth(1)).toHaveAttribute('data-level', '1');
    await expect(links.nth(2)).toHaveAttribute('data-level', '2');
  });

  test('dangerous HTML is neutralised', async ({ page }) => {
    await openFixture(
      page,
      'hostile.md',
      [
        '# 安全',
        '',
        '<script>window.__pwned = true;</script>',
        '',
        '<img src=x onerror="window.__pwned = true">',
        '',
        '[链接](javascript:window.__pwned=true)',
        '',
        '<iframe src="https://example.invalid"></iframe>',
        '',
        '正常文本。',
      ].join('\n'),
    );

    await expect(page.locator('.om-doc')).toContainText('正常文本');
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await expect(page.locator('.om-doc script')).toHaveCount(0);
    await expect(page.locator('.om-doc iframe')).toHaveCount(0);

    /*
     * No anchor anywhere may carry a dangerous scheme.
     *
     * markdown-it's own link validator drops `javascript:` targets before the sanitiser even
     * runs, so the link may survive as plain text rather than as an `<a>`. Asserting on the
     * set of surviving hrefs covers both outcomes instead of assuming one.
     */
    const hrefs = await page.locator('.om-doc a[href]').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href') ?? ''),
    );
    for (const href of hrefs) {
      expect(href, `unsafe href survived: ${href}`).not.toMatch(/^\s*(?:javascript|vbscript|file):/i);
    }
  });

  test('reading settings change layout without re-parsing', async ({ page }) => {
    await openFixture(page, 'settings.md', ['# 设置', '', '一些正文内容。', ''].join('\n'));

    await page.getByTestId('panel-settings').click();
    const width = page.locator('.om-doc');
    const before = await width.evaluate((el) => getComputedStyle(el).maxWidth);

    // Page width is expressed as `--om-content-width` in rem; 60rem must exceed 46rem.
    await page.evaluate(() => {
      document.documentElement.style.setProperty('--om-content-width', '60rem');
    });
    const after = await width.evaluate((el) => getComputedStyle(el).maxWidth);
    expect(after).not.toBe(before);

    await expect(page.locator('.om-settings')).toBeVisible();
  });

  test('theme toggle switches the palette', async ({ page }) => {
    await openFixture(page, 'theme.md', '# 主题\n\n正文。\n');
    const html = page.locator('html');
    const initial = await html.getAttribute('data-om-theme');
    await page.getByTestId('theme-toggle').click();
    await expect(html).not.toHaveAttribute('data-om-theme', initial ?? 'light');
  });
});

test.describe('instant rendering', () => {
  const DOC = ['# 标题', '', '第一段原文。', '', '第二段原文。', '', '- 列表项', ''].join('\n');

  test('decomposes the document into blocks and edits one without touching the others', async ({ page }) => {
    await openFixture(page, 'instant.md', DOC);
    await page.getByTestId('mode-instant').click();

    const blocks = page.locator('.om-block');
    await expect(blocks).toHaveCount(4);
    await expect(page.locator('.om-block[data-om-kind="heading"]')).toHaveCount(1);
    await expect(page.locator('.om-block[data-om-kind="list"]')).toHaveCount(1);

    // Clicking a paragraph turns exactly that block into an editor.
    const paragraph = page.locator('.om-block[data-om-kind="paragraph"]').first();
    await paragraph.locator('.om-block__rendered').click();
    const editor = paragraph.locator('.om-block__editor');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveValue('第一段原文。');

    // Only one block may be editable at a time.
    await expect(page.locator('.om-block__editor')).toHaveCount(1);

    await editor.fill('第一段已经改写。');
    // The commit is debounced; leaving the field flushes immediately.
    await editor.blur();

    // The rendered block must show the new text, and the others must be untouched.
    await expect(page.locator('.om-block[data-om-kind="paragraph"]').first()).toContainText('第一段已经改写。');
    await expect(page.locator('.om-block[data-om-kind="paragraph"]').nth(1)).toContainText('第二段原文。');

    /*
     * The real assertion: the authoritative source must contain the edit and nothing else.
     * It is read through the `getSource` seam rather than the source textarea, because a
     * textarea normalises line endings and would hide exactly the corruption these tests
     * exist to catch.
     */
    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toBe(['# 标题', '', '第一段已经改写。', '', '第二段原文。', '', '- 列表项', ''].join('\n'));
  });

  test('an LF file stays LF after an edit', async ({ page }) => {
    const lf = '# 标题\n\n第一段原文。\n';
    await openFixture(page, 'instant-lf.md', lf);
    expect(await page.evaluate(() => window.__openmark__!.getEncoding())).toEqual({ bom: false, eol: 'lf' });

    await page.getByTestId('mode-instant').click();
    const paragraph = page.locator('.om-block[data-om-kind="paragraph"]').first();
    await paragraph.locator('.om-block__rendered').click();
    await paragraph.locator('.om-block__editor').fill('已替换。');
    await paragraph.locator('.om-block__editor').blur();

    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe('# 标题\n\n已替换。\n');
  });

  test('a CRLF file stays CRLF after an instant edit', async ({ page }) => {
    const crlf = '# 标题\r\n\r\n第一段原文。\r\n\r\n第二段原文。\r\n';
    await openFixture(page, 'instant-crlf.md', crlf);
    expect(await page.evaluate(() => window.__openmark__!.getEncoding())).toEqual({ bom: false, eol: 'crlf' });

    await page.getByTestId('mode-instant').click();
    const paragraph = page.locator('.om-block[data-om-kind="paragraph"]').first();
    await paragraph.locator('.om-block__rendered').click();
    await paragraph.locator('.om-block__editor').fill('已替换。');
    await paragraph.locator('.om-block__editor').blur();

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toBe('# 标题\r\n\r\n已替换。\r\n\r\n第二段原文。\r\n');
    expect(/[^\r]\n/.test(source), 'a bare LF leaked into a CRLF file').toBe(false);
  });

  test('a CRLF file stays CRLF after editing in source mode', async ({ page }) => {
    /*
     * Regression test for a data-loss defect.
     *
     * A textarea cannot hold CRLF — the HTML specification normalises line breaks in its
     * `value` IDL attribute — so an editor that committed `element.value` directly rewrote
     * every line ending in the file. The visible symptom was a whole-file diff after
     * changing one character.
     */
    await openFixture(page, 'source-crlf.md', '# 标题\r\n\r\n正文。\r\n');
    await page.getByTestId('mode-source').click();

    const area = page.locator('.om-source__area');
    await expect(area).toBeVisible();
    // Focus places the caret at offset 0, so `End` lands at the end of the first line.
    await area.focus();
    await area.press('End');
    await area.pressSequentially('追加');

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toContain('追加');
    expect(JSON.stringify(source), 'editing in source mode rewrote the line endings').toBe(
      JSON.stringify('# 标题追加\r\n\r\n正文。\r\n'),
    );
    expect(/[^\r]\n/.test(source), 'a bare LF leaked into a CRLF file').toBe(false);
  });

  test('Escape leaves the editor and keeps the committed text', async ({ page }) => {
    await openFixture(page, 'instant-escape.md', DOC);
    await page.getByTestId('mode-instant').click();

    const paragraph = page.locator('.om-block[data-om-kind="paragraph"]').first();
    await paragraph.locator('.om-block__rendered').click();
    await paragraph.locator('.om-block__editor').fill('通过 Escape 提交。');
    await paragraph.locator('.om-block__editor').press('Escape');

    await expect(page.locator('.om-block__editor')).toHaveCount(0);
    await expect(page.locator('.om-block[data-om-kind="paragraph"]').first()).toContainText('通过 Escape 提交。');
  });

  test('a read-only document refuses to enter edit mode', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem(
        'openmark.settings.v1',
        JSON.stringify({ version: 1, safety: { safeReadOnlyForComplexFiles: true, largeFileThresholdBytes: 100 } }),
      );
    });
    // A document larger than the 100-byte threshold opens read-only.
    await openFixture(page, 'instant-readonly.md', `${'正文内容，超过阈值。\n\n'.repeat(20)}\n`);
    await page.getByTestId('mode-instant').click();

    await page.locator('.om-block__rendered').first().click();
    await expect(page.locator('.om-block__editor')).toHaveCount(0);
  });
});
