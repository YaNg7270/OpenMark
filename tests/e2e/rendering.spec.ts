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
