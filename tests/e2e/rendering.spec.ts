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

  /*
   * Formulas are converted synchronously, but `autoload` fetches an extension asynchronously the
   * first time one of its macros is seen. MathJax signals that with a "MathJax retry" error, and
   * the converter used to report it as a render failure — so the first `\bbox` or `\bra` in a
   * session showed as broken, and only a later render (after the extension had quietly loaded)
   * came out right. One render is the whole point of this test.
   */
  test('autoloaded macros render on the first attempt', async ({ page }) => {
    await openFixture(
      page,
      'autoload.md',
      ['# 自动加载', '', '$\\bbox[red]{x}$', '', '$\\enclose{circle}{y}$', '', '$\\bra{\\psi}$', ''].join('\n'),
    );

    const math = page.locator('.om-math');
    await expect(math).toHaveCount(3);
    await expect(page.locator('.om-math[data-om-state]')).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const node = math.nth(i);
      await expect(node, `expression #${i}: ${await node.getAttribute('title')}`).toHaveAttribute('data-om-state', 'ok');
      expect(await node.locator('svg use, svg path').count()).toBeGreaterThan(0);
    }
  });

  /*
   * Automatic AMS numbering. `setEquationNumbering` used to set `tags: 'ams'` on the TeX input
   * jax's options after startup, but MathJax builds its tag handler from that option once, when
   * the jax is constructed — so the switch did nothing and no `equation` was ever numbered,
   * while explicit `\tag{…}` (which needs no counter) kept working and hid the fault.
   *
   * Numbers are read from the SVG glyph codes: `(` is 28, `1` is 31, `2` is 32, `)` is 29.
   * The document is opened twice to prove the counter restarts instead of continuing at (3).
   */
  test('numbers equations in document order and restarts on reopen', async ({ page }) => {
    const source = [
      '# 编号',
      '',
      '$$\\begin{equation}a \\label{eq:a}\\end{equation}$$',
      '',
      '$$\\begin{equation}b\\end{equation}$$',
      '',
      '$$c = \\eqref{eq:a}$$',
    ].join('\n');
    await page.addInitScript((content: string) => {
      window.__OPENMARK_TEST_FILES__ = { 'numbered.md': content, 'numbered-2.md': `${content}\n` };
    }, source);
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));

    const glyphs = () =>
      page.locator('.om-math').evaluateAll((nodes) =>
        nodes.map((node) =>
          Array.from(node.querySelectorAll('[data-c]'))
            .map((glyph) => glyph.getAttribute('data-c'))
            .join(','),
        ),
      );

    for (const name of ['numbered.md', 'numbered-2.md']) {
      await page.evaluate((path) => window.__openmark__!.openPath(path), name);
      await expect(page.getByTestId('document-name')).toHaveText(name);
      await expect(page.locator('.om-math[data-om-state="ok"]')).toHaveCount(3);
      const [first, second, reference] = await glyphs();
      expect(first, `${name}: first equation`).toContain('28,31,29');
      expect(second, `${name}: second equation`).toContain('28,32,29');
      expect(second, `${name}: numbering continued from the previous document`).not.toContain('28,34,29');
      expect(reference, `${name}: \\eqref{eq:a}`).toContain('31');
    }
  });

  test('an \\eqref written before its \\label still resolves', async ({ page }) => {
    await openFixture(
      page,
      'forward-ref.md',
      [
        '# 前向引用',
        '',
        '见 $\\eqref{eq:late}$。',
        '',
        '$$\\begin{equation}a\\end{equation}$$',
        '',
        '$$\\begin{equation}b \\label{eq:late}\\end{equation}$$',
      ].join('\n'),
    );
    await expect(page.locator('.om-math[data-om-state="ok"]')).toHaveCount(3);
    const glyphs = () =>
      page.locator('.om-math').evaluateAll((nodes) =>
        nodes.map((node) => Array.from(node.querySelectorAll('[data-c]')).map((g) => g.getAttribute('data-c')).join(',')),
      );
    // `?` is 3F: the reference must not be left as (???), and must name equation (2).
    await expect.poll(async () => (await glyphs())[0]).toContain('32');
    expect((await glyphs())[0]).not.toContain('3F');
    // Re-rendering the reference must not renumber the equations themselves.
    const [, first, second] = await glyphs();
    expect(first).toContain('28,31,29');
    expect(second).toContain('28,32,29');
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

  /*
   * MathJax output is written into the page *after* DOMPurify has run, so whatever a formula
   * can emit bypasses the sanitiser entirely. Autoload maps `\href`, `\cssId`, `\class` and
   * `\style` to MathJax's `html` extension, which honours any URL, id, class or CSS unless the
   * `ui/safe` component is loaded. A `javascript:` link then reached both the reader (where
   * only the CSP stood in the way) and the exported HTML (which has no CSP at all).
   *
   * The document is rendered twice on purpose. Before the fix, the first render of an
   * autoloaded macro failed with "MathJax retry" while the extension loaded in the background,
   * and the *second* render emitted the payload — so a single render would have passed.
   */
  test('formulas cannot inject dangerous links, ids, classes or styles', async ({ page }) => {
    const hostile = [
      '# 公式安全',
      '',
      '$\\href{javascript:window.__pwned=true}{a}$',
      '',
      '$\\href{file:///C:/Windows/win.ini}{b}$',
      '',
      '$\\href{https://example.com/}{c}$',
      '',
      '$\\cssId{om-hijacked}{d}$',
      '',
      '$\\class{om-flash}{e}$',
      '',
      '$\\style{position:fixed;top:0;left:0;width:100vw;height:100vh}{f}$',
    ].join('\n');
    await page.addInitScript((content: string) => {
      window.__OPENMARK_TEST_FILES__ = { 'hostile-math.md': content, 'hostile-math-2.md': `${content}\n` };
    }, hostile);
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('hostile-math.md'));
    await expect(page.locator('.om-math[data-om-state]')).toHaveCount(6);
    await page.evaluate(() => window.__openmark__!.openPath('hostile-math-2.md'));
    await expect(page.getByTestId('document-name')).toHaveText('hostile-math-2.md');

    // Each formula still typesets: the guard strips the dangerous part, not the formula.
    await expect(page.locator('.om-math[data-om-state="ok"]')).toHaveCount(6);

    const math = page.locator('.om-math');
    const hrefs = await math.locator('a').evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('href') ?? node.getAttribute('xlink:href') ?? ''),
    );
    for (const href of hrefs) {
      expect(href, `unsafe href survived in a formula: ${href}`).not.toMatch(/^\s*(?:javascript|vbscript|file|data):/i);
    }
    // An ordinary web link is kept: the fix must not simply delete every `\href`.
    expect(hrefs).toContain('https://example.com/');

    await expect(page.locator('#om-hijacked')).toHaveCount(0);
    await expect(math.locator('.om-flash')).toHaveCount(0);
    const fixed = await math.locator('[style]').evaluateAll((nodes) =>
      nodes.filter((node) => /position\s*:\s*fixed/i.test(node.getAttribute('style') ?? '')).length,
    );
    expect(fixed, 'a formula set position:fixed').toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
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

  test('zoom follows Ctrl+Shift+= / - / 0 and Ctrl+wheel, and the window still fits', async ({ page }) => {
    await openFixture(page, 'zoom.md', '# 缩放\n\n正文。\n');
    const zoom = () => page.evaluate(() => document.documentElement.dataset['omZoom']);

    await page.keyboard.press('Control+Shift+Equal');
    await page.keyboard.press('Control+Shift+Equal');
    await expect.poll(zoom).toBe('1.2');
    await page.keyboard.press('Control+Shift+Minus');
    await expect.poll(zoom).toBe('1.1');

    // The chrome really grew, and the status bar is still on screen: zoom rescales the window
    // rather than overflowing it. (Client rects are already in zoomed coordinates.)
    const layout = await page.evaluate(() => ({
      toolbar: document.querySelector('.om-toolbar')!.getBoundingClientRect().height,
      bar: document.querySelector('.om-statusbar')!.getBoundingClientRect().bottom,
      inner: window.innerHeight,
    }));
    expect(layout.toolbar).toBeGreaterThan(42 * 1.05);
    expect(layout.bar, 'zoomed layout overflows the window').toBeLessThanOrEqual(layout.inner + 1);

    await page.mouse.move(400, 300);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -120);
    await page.keyboard.up('Control');
    await expect.poll(zoom).toBe('1.2');

    await page.keyboard.press('Control+Shift+Digit0');
    await expect.poll(zoom).toBe('1');
  });

  test('F8 toggles focus mode and F11 toggles real fullscreen', async ({ page }) => {
    await openFixture(page, 'keys.md', '# 键\n');
    await page.keyboard.press('F8');
    await expect(page.locator('html')).toHaveAttribute('data-om-focus', 'on');
    await page.keyboard.press('F8');
    await expect(page.locator('html')).toHaveAttribute('data-om-focus', 'off');

    // F11 used to be bound to focus mode; it is now the window's fullscreen.
    await page.keyboard.press('F11');
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
    await expect(page.locator('html')).toHaveAttribute('data-om-focus', 'off');
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => Boolean(document.fullscreenElement))).toBe(false);
  });

  test('a standalone image follows the alignment setting; an inline one does not', async ({ page }) => {
    const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await openFixture(page, 'align.md', `# 图\n\n![独立](${pixel})\n\n文字中的 ![行内](${pixel}) 图片。\n`);
    await page.getByTestId('panel-settings').click();
    await page.getByLabel('独立图片对齐').selectOption('center');

    const align = (selector: string) =>
      page.locator(selector).first().evaluate((el) => getComputedStyle(el).textAlign);
    await expect.poll(() => align('.om-doc p[data-om-standalone-image]')).toBe('center');
    expect(await align('.om-doc p:not([data-om-standalone-image])')).not.toBe('center');
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

  test('the code block language can be changed without touching the code', async ({ page }) => {
    const source = ['# 代码', '', '```js title="a.js"', 'const x = 1;', '```', ''].join('\n');
    await openFixture(page, 'instant-code.md', source);
    await page.getByTestId('mode-instant').click();

    await page.locator('.om-block[data-om-kind="code"] .om-block__rendered').click();
    const language = page.getByTestId('code-language');
    await expect(language).toHaveValue('js');
    await language.fill('python');
    await expect(page.locator('.om-block__editor')).toHaveValue('```python title="a.js"\nconst x = 1;\n```');
    await language.press('Enter');
    await page.locator('.om-block__editor').press('Escape');

    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe(
      ['# 代码', '', '```python title="a.js"', 'const x = 1;', '```', ''].join('\n'),
    );
  });

  test('lists continue on Enter and nest on Tab in the block editor', async ({ page }) => {
    await openFixture(page, 'instant-lists.md', DOC);
    await page.getByTestId('mode-instant').click();

    await page.locator('.om-block[data-om-kind="list"] .om-block__rendered').click();
    const editor = page.locator('.om-block__editor');
    await editor.press('Control+End');
    await editor.press('Enter');
    await editor.pressSequentially('新项');
    await expect(editor).toHaveValue('- 列表项\n- 新项');

    // Tab nests the item instead of moving focus out of the textarea.
    await editor.press('Tab');
    await expect(editor).toHaveValue('- 列表项\n  - 新项');
    await expect(editor).toBeFocused();
    await editor.press('Shift+Tab');
    await expect(editor).toHaveValue('- 列表项\n- 新项');

    // Enter on an empty item leaves the list.
    await editor.press('Enter');
    await editor.press('Enter');
    await expect(editor).toHaveValue('- 列表项\n- 新项\n');
  });

  test('formatting shortcuts work in the block editor without switching mode', async ({ page }) => {
    await openFixture(page, 'instant-shortcuts.md', DOC);
    await page.getByTestId('mode-instant').click();

    const paragraph = page.locator('.om-block[data-om-kind="paragraph"]').first();
    await paragraph.locator('.om-block__rendered').click();
    const editor = page.locator('.om-block__editor');
    await editor.press('Control+a');
    await editor.press('Control+b');
    await editor.press('Control+1');
    await expect(editor).toHaveValue('# **第一段原文。**');
    await expect(page.getByTestId('mode-instant')).toHaveAttribute('aria-selected', 'true');

    // The textarea's own undo still works, because the edit went through `insertText`.
    await editor.press('Control+z');
    await expect(editor).toHaveValue('**第一段原文。**');

    await editor.blur();
    const source = await page.evaluate(() => window.__openmark__!.getSource());
    expect(source).toBe(['# 标题', '', '**第一段原文。**', '', '第二段原文。', '', '- 列表项', ''].join('\n'));
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

  /*
   * The command logic is unit-tested in `tests/unit/edit-commands.test.ts`. What only a browser
   * can show is that the keys reach it: CodeMirror's own defaults claim some of them (`Ctrl+I`,
   * `Ctrl+Shift+K`), and the window claims `Ctrl+1..4` for switching view modes.
   */
  test('formatting shortcuts edit the text and stay inside the editor', async ({ page }) => {
    await openFixture(page, 'editor-shortcuts.md', '');
    await page.getByTestId('mode-source').click();

    await page.locator('.om-source__host .cm-content').click();
    await page.keyboard.type('word');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press('Control+b');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe('**word**');

    await page.keyboard.press('Control+i');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe('***word***');
    await page.keyboard.press('Control+i');

    await page.keyboard.press('Control+2');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe('## **word**');
    // Ctrl+2 is also "instant mode" for the window; inside the editor it must only format.
    await expect(page.getByTestId('mode-source')).toHaveAttribute('aria-selected', 'true');

    // Each shortcut is one undo step.
    await page.keyboard.press('Control+z');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe('**word**');
  });

  test('Tab nests an ordered list item and renumbers the list', async ({ page }) => {
    await openFixture(page, 'editor-lists.md', '');
    await page.getByTestId('mode-source').click();
    await page.locator('.om-source__host .cm-content').click();

    // CodeMirror's own Markdown keymap continues the list on Enter.
    await page.keyboard.type('1. a');
    await page.keyboard.press('Enter');
    await page.keyboard.type('b');
    await page.keyboard.press('Enter');
    await page.keyboard.type('c');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe('1. a\n2. b\n3. c');

    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe('1. a\n   1. b\n2. c');
    await page.keyboard.press('Shift+Tab');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe('1. a\n2. b\n3. c');

    // Outside a list, Tab still indents as before.
    await page.keyboard.press('Control+End');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('plain');
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toMatch(/\n[ \t]+plain$/);
  });

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
  /*
   * A crash is simulated by reloading the page *after* the journal has been written, which is
   * checked directly in storage first: the `beforeunload` flush that a reload also triggers is
   * not available after a real crash, so the test must not depend on it.
   */
  test('offers back unsaved work after a crash, and restores it as unsaved changes', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = { 'crash.md': '# 原文\n' };
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('crash.md'));
    await page.getByTestId('mode-source').click();
    await page.locator('.om-source__host .cm-content').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type('\n还没保存的一段。');
    const edited = await page.evaluate(() => window.__openmark__!.getSource());

    await page.waitForFunction(
      (text) => (localStorage.getItem('openmark.drafts.v1') ?? '').includes(JSON.stringify(text).slice(1, -1)),
      edited,
    );
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__openmark__));

    const recovery = page.getByTestId('draft-recovery');
    await expect(recovery).toBeVisible();
    await expect(recovery.getByTestId('draft-item')).toHaveCount(1);
    await expect(recovery).toContainText('crash.md');

    await recovery.getByTestId('draft-restore').click();
    await expect(page.getByTestId('draft-recovery')).toHaveCount(0);
    await expect(page.getByTestId('document-name')).toHaveText('crash.md');
    expect(await page.evaluate(() => window.__openmark__!.getSource())).toBe(edited);
    // Restored text is unsaved work, not something already on disk.
    await expect(page).toHaveTitle(/^• crash\.md/);
  });

  test('a discarded draft is gone for good', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = { 'discard.md': '# 原文\n' };
    });
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('discard.md'));
    await page.getByTestId('mode-source').click();
    await page.locator('.om-source__host .cm-content').click();
    await page.keyboard.type('x');
    await page.waitForFunction(() => (localStorage.getItem('openmark.drafts.v1') ?? '').includes('discard.md'));
    await page.reload();

    await page.getByTestId('draft-discard').click();
    await expect(page.getByTestId('draft-recovery')).toHaveCount(0);
    await page.waitForFunction(() => localStorage.getItem('openmark.drafts.v1') === null);
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await expect(page.getByTestId('draft-recovery')).toHaveCount(0);
  });

  /*
   * Each view unmounts on a mode switch. Before, each one started at its own top (or at the
   * per-file reading position), so switching to source mode to fix a typo lost the reader's
   * place. The views now hand over the source line at the top of the viewport.
   */
  test('a mode switch keeps the same part of the document on screen', async ({ page }) => {
    // Section k starts on line 4(k-1)+1: heading, blank, text, blank.
    const long = Array.from({ length: 200 }, (_, i) => `## 第 ${i + 1} 节\n\n${'正文内容。'.repeat(12)}\n`).join('\n');
    await page.addInitScript((content) => {
      window.__OPENMARK_TEST_FILES__ = { 'modes.md': content };
    }, long);
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('modes.md'));
    await expect(page.locator('.om-doc-scroll')).toBeVisible();

    const sectionLine = (k: number) => 4 * (k - 1) + 1;
    /** Line of the first source-tagged block still visible at the top of a rendered view. */
    const renderedTopLine = () =>
      page.locator('.om-doc-scroll').evaluate((scroller) => {
        const top = scroller.getBoundingClientRect().top;
        const block = Array.from(scroller.querySelectorAll('[data-om-line]')).find(
          (el) => el.getBoundingClientRect().bottom > top + 1,
        );
        return Number(block?.getAttribute('data-om-line') ?? 0);
      });

    await page.locator('#第-120-节, [id*="120"]').first().evaluate((heading) => heading.scrollIntoView({ block: 'start' }));
    await expect.poll(renderedTopLine).toBeGreaterThanOrEqual(sectionLine(120) - 4);
    const readLine = await renderedTopLine();

    await page.getByTestId('mode-source').click();
    // The caret is placed on the handed-over line, and that line is at the top of the editor.
    await expect(page.getByTestId('source-caret')).toHaveText(`${readLine}:1`);
    const firstVisible = await page.locator('.om-source__host').evaluate((host) => {
      const scroller = host.querySelector('.cm-scroller')!;
      const top = scroller.getBoundingClientRect().top;
      const line = Array.from(host.querySelectorAll('.cm-line')).find((el) => el.getBoundingClientRect().bottom > top + 14);
      return line?.textContent ?? '';
    });
    expect(firstVisible).toContain('第 120 节');

    await page.getByTestId('mode-instant').click();
    await expect.poll(renderedTopLine).toBeGreaterThanOrEqual(sectionLine(120) - 4);
    expect(await renderedTopLine()).toBeLessThanOrEqual(sectionLine(121));
  });

  test('local links open the Markdown file they point to, at the linked heading', async ({ page }) => {
    const filler = Array.from({ length: 60 }, (_, i) => `段落 ${i + 1}。`).join('\n\n');
    await page.addInitScript(
      (files) => {
        window.__OPENMARK_TEST_FILES__ = files;
      },
      {
        'notes/a.md': `# 甲\n\n[下一篇](./b.md#第二节)\n\n[去结尾](#结尾)\n\n[程序](./tool.exe)\n\n[缺失](./gone.md)\n\n${filler}\n\n## 结尾\n`,
        'notes/b.md': `# 乙\n\n${filler}\n\n## 第二节\n\n这里。\n`,
      },
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('notes/a.md'));

    // Visible in the viewport — the last heading of a document cannot scroll to the very top.
    const headingAtTop = (id: string) =>
      page.evaluate((target) => {
        const scroller = document.querySelector('.om-doc-scroll')!;
        const heading = document.getElementById(target);
        if (!heading) return false;
        const offset = heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
        return offset > -5 && offset < scroller.clientHeight - 20 && scroller.scrollTop > 0;
      }, id);

    // An in-document fragment written GitHub-style reaches the `om-h-` heading id.
    await page.locator('.om-doc a', { hasText: '去结尾' }).click();
    await expect.poll(() => headingAtTop('om-h-结尾')).toBe(true);

    // A non-Markdown file is never launched, only reported.
    await page.locator('.om-doc a', { hasText: '程序' }).click();
    await expect(page.locator('.om-toast')).toContainText('tool.exe');
    await page.locator('.om-doc a', { hasText: '缺失' }).click();
    await expect(page.locator('.om-toast')).toContainText('gone.md');
    await expect(page.getByTestId('document-name')).toHaveText('a.md');

    await page.locator('.om-doc a', { hasText: '下一篇' }).click();
    await expect(page.getByTestId('document-name')).toHaveText('b.md');
    await expect.poll(() => headingAtTop('om-h-第二节')).toBe(true);
  });

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

test.describe('file commands', () => {
  test('New opens an empty document in a new tab and leaves the current one intact', async ({ page }) => {
    await openFixture(page, 'existing.md', '# 已有文档\n\n内容。\n');
    await expect(page.getByTestId('document-name')).toHaveText('existing.md');

    await page.getByTestId('new-button').click();
    await expect(page.getByTestId('document-name')).toHaveText('untitled.md');
    // An empty document offers the recent list rather than a blank page.
    await expect(page.locator('.om-doc')).toContainText('打开一个 Markdown 文件');
    await expect(page.getByTestId('tab-bar')).toBeVisible();
    await expect(page.locator('.om-tab')).toHaveCount(2);

    // The original must still be there, unchanged.
    await page.locator('.om-tab').first().locator('.om-tab__label').click();
    await expect(page.getByTestId('document-name')).toHaveText('existing.md');
  });

  test('save is disabled without a path but save-as stays available', async ({ page }) => {
    await page.addInitScript(() => {
      window.__OPENMARK_TEST_FILES__ = {};
    });
    await page.goto('/');
    await expect(page.locator('.om-toolbar')).toBeVisible();

    // Nothing open: both are inert because there is nothing to write.
    await expect(page.getByTestId('save-button')).toBeDisabled();
    await expect(page.getByTestId('save-as-button')).toBeDisabled();

    await page.getByTestId('new-button').click();
    await page.getByTestId('mode-source').click();
    await page.locator('.om-source__host .cm-content').click();
    await page.keyboard.type('# 无标题草稿');

    // A never-saved document has no path; save must defer to save-as rather than fail.
    await expect(page.getByTestId('save-button')).toBeDisabled();
    await expect(page.getByTestId('save-as-button')).toBeEnabled();
  });

  test('Ctrl+N and Ctrl+Shift+S are wired', async ({ page }) => {
    await openFixture(page, 'shortcuts.md', '# 快捷键\n\n内容。\n');

    await page.locator('.om-doc-scroll').click();
    await page.keyboard.press('Control+n');
    await expect(page.getByTestId('document-name')).toHaveText('untitled.md');
    await expect(page.locator('.om-tab')).toHaveCount(2);

    // Ctrl+Shift+S must not be swallowed by the plain Ctrl+S handler.
    await page.keyboard.press('Control+Shift+s');
    await expect(page.getByTestId('tab-bar')).toBeVisible();
  });
});

test.describe('split view', () => {
  test('keeps both panes on the same part of the document', async ({ page }) => {
    // Long enough that both panes actually scroll.
    const long = Array.from({ length: 160 }, (_, i) => `## 第 ${i + 1} 节\n\n${'正文内容。'.repeat(10)}\n`).join('\n');
    await page.addInitScript(
      (content) => {
        window.__OPENMARK_TEST_FILES__ = { 'split.md': content };
      },
      long,
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('split.md'));
    await page.getByTestId('mode-split').click();

    const panes = page.locator('.om-main__pane');
    await expect(panes).toHaveCount(2);
    const source = page.locator('.om-main__pane--source .cm-scroller');
    const reader = page.locator('.om-main__pane--reader .om-doc-scroll');
    await expect(source).toBeVisible();
    await expect(reader).toBeVisible();

    // Scrolling the rendered side must move the source side by the same proportion.
    await reader.evaluate((el) => {
      el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.5;
    });
    await expect
      .poll(
        async () =>
          source.evaluate((el) => {
            const max = el.scrollHeight - el.clientHeight;
            return max <= 0 ? 0 : el.scrollTop / max;
          }),
        { timeout: 5_000 },
      )
      .toBeGreaterThan(0.3);

    // And the other direction, which is the half a one-way sync would miss.
    await source.evaluate((el) => {
      el.scrollTop = (el.scrollHeight - el.clientHeight) * 0.8;
    });
    await expect
      .poll(
        async () =>
          reader.evaluate((el) => {
            const max = el.scrollHeight - el.clientHeight;
            return max <= 0 ? 0 : el.scrollTop / max;
          }),
        { timeout: 5_000 },
      )
      .toBeGreaterThan(0.5);
  });
});
