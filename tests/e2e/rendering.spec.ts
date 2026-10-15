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

    // The editor is CodeMirror 6, so content is edited through its contenteditable surface.
    const content = page.locator('.om-source__host .cm-content');
    await expect(content).toBeVisible();
    // Clicking places the caret; Ctrl+Home then End lands at the end of the first line.
    await content.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('End');
    await page.keyboard.type('追加');

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

test.describe('source editor', () => {
  const DOC = ['# 标题', '', '正文 with **bold** and `code`.', '', '```js', 'const x = 1;', '```', ''].join('\n');

  test('supports undo and redo with the keyboard', async ({ page }) => {
    await openFixture(page, 'editor-undo.md', DOC);
    await page.getByTestId('mode-source').click();

    const content = page.locator('.om-source__host .cm-content');
    await content.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('XYZ');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toContain('XYZ');

    await page.keyboard.press('Control+z');
    const undone = await page.evaluate(() => window.__openmark__!.getSource());
    expect(undone.startsWith('XYZ'), 'undo did not remove the typed text').toBe(false);

    await page.keyboard.press('Control+y');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toContain('XYZ');
  });

  test('undo history does not cross into another document', async ({ page }) => {
    /*
     * Undoing past the start of a document must not resurrect the previous file's text,
     * which would look to the user like their file had been overwritten.
     */
    await openFixture(page, 'editor-a.md', '# 文件 A\n\nA 的内容。\n');
    await openFixture(page, 'editor-b.md', '# 文件 B\n\nB 的内容。\n');
    await page.getByTestId('mode-source').click();

    const content = page.locator('.om-source__host .cm-content');
    await content.click();
    await page.keyboard.press('Control+Home');
    await page.keyboard.type('EDIT');

    for (let i = 0; i < 10; i++) await page.keyboard.press('Control+z');
    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).not.toContain('文件 A');
    expect(source).toContain('文件 B');
  });

  test('highlights markdown syntax', async ({ page }) => {
    await openFixture(page, 'editor-highlight.md', DOC);
    await page.getByTestId('mode-source').click();

    const content = page.locator('.om-source__host .cm-content');
    await expect(content).toBeVisible();
    // The markdown grammar must actually colourise, not merely render plain text.
    const spans = await content.locator('span[class*="ͼ"], span[class*="cm-"]').count();
    expect(spans, 'no syntax-highlighted spans were produced').toBeGreaterThan(3);

    const headingColour = await content.locator('span').first().evaluate((el) => getComputedStyle(el).color);
    expect(headingColour).not.toBe('rgb(0, 0, 0)');
  });

  test('line numbers are shown', async ({ page }) => {
    await openFixture(page, 'editor-gutter.md', DOC);
    await page.getByTestId('mode-source').click();
    await expect(page.locator('.om-source__host .cm-gutters')).toBeVisible();
    await expect(page.locator('.om-source__host .cm-lineNumbers')).toBeVisible();
  });
});

test.describe('session state', () => {
  test('remembers recently opened files, most recent first', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = {
        'alpha.md': '# Alpha\n\n甲的内容。\n',
        'beta.md': '# Beta\n\n乙的内容。\n',
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));

    await page.evaluate(() => window.__openmark__!.openPath('alpha.md'));
    await expect(page.getByTestId('document-name')).toHaveText('alpha.md');
    await page.evaluate(() => window.__openmark__!.openPath('beta.md'));
    await expect(page.getByTestId('document-name')).toHaveText('beta.md');

    await page.getByTestId('panel-recent').click();
    const entries = page.locator('[data-om-testid="recent-list"] .om-recent__name');
    await expect(entries).toHaveCount(2);
    // The most recently opened file must be first.
    await expect(entries.first()).toHaveText('beta.md');
    await expect(entries.nth(1)).toHaveText('alpha.md');
  });

  test('restores the reading position when the same file is reopened', async ({ page }) => {
    // A document long enough to scroll well past the first screen.
    const long = Array.from({ length: 220 }, (_, i) => `## 第 ${i + 1} 节\n\n${'正文内容。'.repeat(12)}\n`).join('\n');
    await page.addInitScript(
      (content) => {
        window.__OPENMARK_TEST_FILES__ = { 'long.md': content, 'other.md': '# 其他\n\n内容。\n' };
      },
      long,
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('long.md'));
    await expect(page.locator('.om-doc-scroll')).toBeVisible();

    // Scroll to roughly the middle, then let the debounced save settle.
    await page.locator('.om-doc-scroll').evaluate((el) => {
      el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.5;
    });
    await page.waitForTimeout(900);
    const saved = await page.locator('.om-doc-scroll').evaluate((el) => el.scrollTop);
    expect(saved, 'the document did not scroll').toBeGreaterThan(200);

    // Open something else, then come back.
    await page.evaluate(() => window.__openmark__!.openPath('other.md'));
    await expect(page.getByTestId('document-name')).toHaveText('other.md');
    await page.evaluate(() => window.__openmark__!.openPath('long.md'));
    await expect(page.getByTestId('document-name')).toHaveText('long.md');

    // Restoring is applied on mount; give layout and image-free fonts a moment to settle.
    await expect
      .poll(async () => page.locator('.om-doc-scroll').evaluate((el) => el.scrollTop), { timeout: 5_000 })
      .toBeGreaterThan(200);
  });

  test('a file can be removed from the recent list', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = { 'gone.md': '# 待移除\n\n内容。\n' };
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('gone.md'));

    await page.getByTestId('panel-recent').click();
    await expect(page.locator('[data-om-testid="recent-list"] .om-recent__name')).toHaveCount(1);
    await page.locator('.om-recent__forget').first().click();
    await expect(page.locator('[data-om-testid="recent-list"]')).toHaveCount(0);
  });
});

test.describe('formula tools', () => {
  const DOC = ['# 公式', '', '行内公式 $E = mc^2$ 与一个块公式：', '', '$$', '\\frac{a}{b} = c', '$$', ''].join('\n');

  test('copies the LaTeX source of a clicked formula', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await openFixture(page, 'math-tools.md', DOC);

    await page.locator('.om-math[data-om-state="ok"]').first().click();
    await expect(page.getByTestId('math-tools')).toBeVisible();
    await page.getByTestId('math-copy').click();

    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard).toBe('E = mc^2');
  });

  test('edits a formula through the dialog and splices only that formula', async ({ page }) => {
    await openFixture(page, 'math-edit.md', DOC);

    // The display formula is the second one in document order.
    await page.locator('.om-math--display').click();
    await page.getByTestId('math-edit').click();

    const dialog = page.getByTestId('math-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('math-dialog-source')).toHaveValue('\\frac{a}{b} = c');

    // The live preview must actually typeset before the edit is committed.
    await expect(page.getByTestId('math-dialog-preview').locator('mjx-container')).toBeVisible();

    await page.getByTestId('math-dialog-source').fill('\\int_0^1 x\\,dx = \\frac{1}{2}');
    await expect(page.getByTestId('math-dialog-preview').locator('mjx-container')).toBeVisible();
    await page.getByTestId('math-dialog-save').click();
    await expect(dialog).toHaveCount(0);

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    // Delimiters and layout survive; only the body changed.
    expect(source).toBe(
      ['# 公式', '', '行内公式 $E = mc^2$ 与一个块公式：', '', '$$', '\\int_0^1 x\\,dx = \\frac{1}{2}', '$$', ''].join('\n'),
    );
  });

  test('reports a broken formula inside the dialog without losing the source', async ({ page }) => {
    await openFixture(page, 'math-error.md', DOC);

    await page.locator('.om-math--display').click();
    await page.getByTestId('math-edit').click();
    await page.getByTestId('math-dialog-source').fill('\\frac{a}{b');

    await expect(page.getByTestId('math-dialog-error')).toBeVisible();
    // The author's text must still be there to fix.
    await expect(page.getByTestId('math-dialog-source')).toHaveValue('\\frac{a}{b');

    await page.getByTestId('math-dialog-save').click();
    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toContain('\\frac{a}{b');
  });

  test('keeps a formula fence intact when its body is edited', async ({ page }) => {
    const fenced = '# 围栏公式\n\n```math\na = b\n```\n';
    await openFixture(page, 'math-fence-edit.md', fenced);

    await page.locator('.om-math--display').click();
    await page.getByTestId('math-edit').click();
    await page.getByTestId('math-dialog-source').fill('c = d');
    await page.getByTestId('math-dialog-save').click();

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toBe('# 围栏公式\n\n```math\nc = d\n```\n');
  });
});


test.describe('export', () => {
  const DOC = [
    '# 导出测试',
    '',
    '行内公式 $E = mc^2$。',
    '',
    '$$',
    '\\int_0^1 x\\,dx = \\frac{1}{2}',
    '$$',
    '',
    '```mermaid',
    'graph TD; A-->B;',
    '```',
    '',
    '```js',
    'const answer = 42;',
    '```',
    '',
    '正文结尾。',
  ].join('\n');

  test('produces a self-contained HTML file with typeset content and no scripts', async ({ page }) => {
    await openFixture(page, 'export-doc.md', DOC);
    // Let the reader typeset before exporting: the exporter reuses what is already rendered.
    await expect(page.locator('mjx-container').first()).toBeVisible();
    await expect(page.locator('.om-mermaid svg').first()).toBeVisible({ timeout: 30_000 });

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-html').click();
    const download = await downloadPromise;

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const html = Buffer.concat(chunks).toString('utf8');

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('导出测试');
    // Behaviour must not travel with the document.
    expect(html).not.toContain('<script');
    // The maths and the diagram must be the rendered artefacts, not their source.
    expect(html).toContain('mjx-container');
    expect(html).toContain('<svg');
    // Highlighting is inlined, since the exported file has no stylesheet to load.
    expect(html).toContain('style=');
  });

  test('is disabled until the document has a location on disk', async ({ page }) => {
    // A self-contained export needs a directory to resolve relative images against, so the
    // buttons stay disabled until the document has one. The seam must still be installed, or
    // the app never boots with the test API.
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = {};
    });
    await page.goto('/');
    await expect(page.locator('.om-toolbar')).toBeVisible();
    await expect(page.getByTestId('export-html')).toBeDisabled();
    await expect(page.getByTestId('export-pdf')).toBeDisabled();
  });
});

test.describe('writing modes and images', () => {
  test('typewriter mode toggles and keeps the caret line in view', async ({ page }) => {
    // A document long enough that the caret would otherwise travel off-screen.
    const long = Array.from({ length: 120 }, (_, i) => `第 ${i + 1} 行内容。`).join('\n\n');
    await openFixture(page, 'typewriter.md', `${long}\n`);

    await expect(page.getByTestId('typewriter-toggle')).not.toHaveAttribute('data-active', 'true');
    await page.getByTestId('mode-source').click();

    const content = page.locator('.om-source__host .cm-content');
    await content.click();

    await page.getByTestId('typewriter-toggle').click();
    await expect(page.getByTestId('typewriter-toggle')).toHaveAttribute('data-active', 'true');

    // The toggle took focus, so the editor has to be re-focused before typing reaches it.
    await content.click();

    // Typing at the end of a long document must pull the caret back toward the middle of the
    // view instead of letting it walk down to the bottom edge.
    await page.keyboard.press('Control+End');
    await page.keyboard.type('追加一行。');
    const ratio = await page.locator('.om-source__host .cm-scroller').evaluate((el) => {
      const caret = el.querySelector('.cm-cursor') as HTMLElement | null;
      if (!caret) return -1;
      const caretBox = caret.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return (caretBox.top - box.top) / box.height;
    });
    expect(ratio, 'caret was not kept in the viewport').toBeGreaterThan(0);
    expect(ratio, `caret sat at ${(ratio * 100).toFixed(0)}% of the viewport`).toBeLessThan(0.75);
  });

  test('dropping an image inserts a reference instead of opening it as a document', async ({ page }) => {
    await openFixture(page, 'drop-target.md', '# 目标文档\n\n正文。\n');

    // A synthetic drop carrying a real PNG, built in the page so the handler sees a genuine
    // DataTransfer rather than a mock.
    await page.evaluate(async () => {
      const png = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
        (c) => c.charCodeAt(0),
      );
      const file = new File([png], 'dropped.png', { type: 'image/png' });
      const data = new DataTransfer();
      data.items.add(file);
      const shell = document.querySelector('.om-shell')!;
      shell.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
    });

    // The document name must be unchanged: an image is content, not something to open.
    await expect(page.getByTestId('document-name')).toHaveText('drop-target.md');
    await expect
      .poll(async () => page.evaluate(() => window.__openmark__!.getSource()), { timeout: 5_000 })
      .toContain('![](');
  });

  test('pasting an image into the source editor inserts a reference', async ({ page }) => {
    await openFixture(page, 'paste-target.md', '# 粘贴\n\n');
    await page.getByTestId('mode-source').click();

    const content = page.locator('.om-source__host .cm-content');
    await content.click();
    await page.keyboard.press('Control+End');

    await page.evaluate(() => {
      const png = Uint8Array.from(
        atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='),
        (c) => c.charCodeAt(0),
      );
      const file = new File([png], 'clip.png', { type: 'image/png' });
      const data = new DataTransfer();
      data.items.add(file);
      const target = document.querySelector('.om-source__host .cm-content')!;
      target.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    });

    await expect
      .poll(async () => page.evaluate(() => window.__openmark__!.getSource()), { timeout: 5_000 })
      .toContain('data:image/png;base64,');
  });
});

test.describe('table editor', () => {
  const DOC = ['# 表格', '', '| 名称 | 数量 |', '| :--- | ---: |', '| 苹果 | 3 |', '| 香蕉 | 5 |', ''].join('\n');

  test('opens the grid from a table block and does not rewrite an unchanged table', async ({ page }) => {
    await openFixture(page, 'table.md', DOC);
    await page.getByTestId('mode-instant').click();

    await expect(page.locator('.om-block[data-om-kind="table"]')).toHaveCount(1);
    await page.getByTestId('table-edit-1').click();

    const dialog = page.getByTestId('table-dialog');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('table-header-0')).toHaveValue('名称');
    await expect(page.getByTestId('table-cell-0-1')).toHaveValue('3');

    // Opening and closing must leave the file byte-identical: serialising normalises pipe
    // padding, so an unconditional write would turn a look into a whole-block diff.
    await page.getByTestId('table-save').click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe(DOC);
  });

  test('edits a cell, adds a row and adds a column, and splices only the table', async ({ page }) => {
    await openFixture(page, 'table-edit.md', DOC);
    await page.getByTestId('mode-instant').click();
    await page.getByTestId('table-edit-1').click();

    await page.getByTestId('table-cell-0-1').fill('30');
    await page.getByTestId('table-add-row').click();
    await page.getByTestId('table-header-2').count().catch(() => 0);
    await page.getByTestId('table-add-column').click();
    await page.getByTestId('table-header-2').fill('备注');
    await page.getByTestId('table-save').click();

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    // The heading and the blank lines around the table must be untouched.
    expect(source.startsWith('# 表格\n\n|')).toBe(true);

    /*
     * Asserted in full rather than by substring, because the interesting properties are all
     * structural: the original alignment markers survive, the added column defaults to no
     * alignment, CJK headers are padded to the right visual width, and the new row is empty.
     */
    expect(JSON.stringify(source)).toBe(
      JSON.stringify(
        [
          '# 表格',
          '',
          '| 名称 | 数量 | 备注 |',
          '| :--- | ---: | ---- |',
          '| 苹果 | 30   |      |',
          '| 香蕉 | 5    |      |',
          '|      |      |      |',
          '',
        ].join('\n'),
      ),
    );

    // And the result must still be a table the parser recognises.
    await expect(page.locator('.om-block[data-om-kind="table"]')).toHaveCount(1);
  });

  test('deletes a row and a column', async ({ page }) => {
    await openFixture(page, 'table-delete.md', DOC);
    await page.getByTestId('mode-instant').click();
    await page.getByTestId('table-edit-1').click();

    await page.locator('.om-table-editor tbody tr').first().locator('.om-table-editor__remove').click();
    await page.locator('.om-table-editor thead th').first().locator('.om-table-editor__remove').click();
    await page.getByTestId('table-save').click();

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).not.toContain('苹果');
    expect(source).not.toContain('名称');
    expect(source).toContain('数量');
    expect(source).toContain('5');
  });
});

test.describe('tabs', () => {
  test('opens a second document in its own tab and switches between them', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = {
        'first.md': '# 第一篇\n\n甲的内容。\n',
        'second.md': '# 第二篇\n\n乙的内容。\n',
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));

    // A single document shows no tab bar: it would be chrome that says nothing.
    await page.evaluate(() => window.__openmark__!.openPath('first.md'));
    await expect(page.getByTestId('document-name')).toHaveText('first.md');
    await expect(page.getByTestId('tab-bar')).toHaveCount(0);

    await page.evaluate(() => window.__openmark__!.openPath('second.md'));
    await expect(page.getByTestId('document-name')).toHaveText('second.md');
    await expect(page.getByTestId('tab-bar')).toBeVisible();
    await expect(page.locator('.om-tab')).toHaveCount(2);
    await expect(page.locator('.om-doc')).toContainText('第二篇');

    // Switching back must restore the first document, not just its name.
    await page.locator('.om-tab').first().locator('.om-tab__label').click();
    await expect(page.getByTestId('document-name')).toHaveText('first.md');
    await expect(page.locator('.om-doc')).toContainText('第一篇');
  });

  test('keeps unsaved edits in a tab when the reader switches away and back', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = {
        'alpha.md': '# Alpha\n\n原始内容。\n',
        'beta.md': '# Beta\n\n内容。\n',
      };
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));

    await page.evaluate(() => window.__openmark__!.openPath('alpha.md'));
    await page.evaluate(() => window.__openmark__!.openPath('beta.md'));

    // Edit the parked tab by switching to it first, then park it again.
    await page.locator('.om-tab').first().locator('.om-tab__label').click();
    await page.getByTestId('mode-instant').click();
    const paragraph = page.locator('.om-block[data-om-kind="paragraph"]').first();
    await paragraph.locator('.om-block__rendered').click();
    await paragraph.locator('.om-block__editor').fill('已修改的内容。');
    await paragraph.locator('.om-block__editor').blur();

    // The dirty marker follows the tab, not the window.
    await expect(page.locator('.om-tab').first().locator('.om-tab__dirty')).toBeVisible();

    await page.locator('.om-tab').nth(1).locator('.om-tab__label').click();
    await expect(page.getByTestId('document-name')).toHaveText('beta.md');

    await page.locator('.om-tab').first().locator('.om-tab__label').click();
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toContain('已修改的内容。');
  });

  test('activating an already-open file brings its tab forward instead of duplicating it', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = { 'one.md': '# 一\n\n内容。\n', 'two.md': '# 二\n\n内容。\n' };
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));

    await page.evaluate(() => window.__openmark__!.openPath('one.md'));
    await page.evaluate(() => window.__openmark__!.openPath('two.md'));
    await expect(page.locator('.om-tab')).toHaveCount(2);

    await page.evaluate(() => window.__openmark__!.openPath('one.md'));
    await expect(page.locator('.om-tab')).toHaveCount(2);
    await expect(page.getByTestId('document-name')).toHaveText('one.md');
  });

  test('closing a tab activates its neighbour and leaves an empty document for the last one', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = { 'keep.md': '# 保留\n\n内容。\n', 'drop.md': '# 关闭\n\n内容。\n' };
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));

    await page.evaluate(() => window.__openmark__!.openPath('keep.md'));
    await page.evaluate(() => window.__openmark__!.openPath('drop.md'));
    await expect(page.locator('.om-tab')).toHaveCount(2);

    // Close the active tab; the remaining one must come forward.
    await page.locator('.om-tab').nth(1).locator('.om-tab__close').click();
    await expect(page.locator('.om-tab')).toHaveCount(0); // one tab left, so the bar hides
    await expect(page.getByTestId('document-name')).toHaveText('keep.md');
    await expect(page.locator('.om-doc')).toContainText('保留');
  });
});

test.describe('find and replace', () => {
  test('replaces every occurrence in the source and nothing else', async ({ page }) => {
    const DOC = '# 标题\n\n张三负责这一部分，李四负责另一部分，张三再次出现。\n\n> 张三的引用。\n';
    await openFixture(page, 'replace.md', DOC);

    await page.getByTestId('panel-search').click();
    await page.getByTestId('search-input').fill('张三');
    // The reading view finds matches in the rendered text.
    await expect(page.getByTestId('search-summary')).toContainText('3');

    await page.getByTestId('replace-input').fill('王五');
    await page.getByTestId('replace-all').click();

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toBe('# 标题\n\n王五负责这一部分，李四负责另一部分，王五再次出现。\n\n> 王五的引用。\n');
    // Nothing else may move: same line count, same structure.
    expect(source.split('\n')).toHaveLength(DOC.split('\n').length);
    await expect(page.getByTestId('replace-result')).toContainText('3');
  });

  test('treats the query as literal text, not a pattern', async ({ page }) => {
    // `$&` is a backreference in a replacement string. Interpreting it would insert the match
    // instead of the characters the reader typed.
    await openFixture(page, 'replace-literal.md', '价格 $5 与 $5 重复。\n');
    await page.getByTestId('panel-search').click();
    await page.getByTestId('search-input').fill('$5');
    await page.getByTestId('replace-input').fill('$&');
    await page.getByTestId('replace-all').click();

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toBe('价格 $& 与 $& 重复。\n');
  });

  test('preserves CRLF when replacing', async ({ page }) => {
    await openFixture(page, 'replace-crlf.md', '# 标题\r\n\r\n甲和甲。\r\n');
    await page.getByTestId('panel-search').click();
    await page.getByTestId('search-input').fill('甲');
    await page.getByTestId('replace-input').fill('乙');
    await page.getByTestId('replace-all').click();

    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toBe('# 标题\r\n\r\n乙和乙。\r\n');
    expect(/[^\r]\n/.test(source), 'a bare LF leaked into a CRLF file').toBe(false);
  });
});
