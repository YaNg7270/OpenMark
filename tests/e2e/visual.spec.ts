import { expect, test, type Page } from '@playwright/test';

/**
 * Visual regression baselines.
 *
 * The other suites prove structure: that an element exists, that a formula produced glyphs, that
 * a diagnostic was reported. None of them can notice that the reading column became too narrow,
 * that a table lost its borders, or that a formula is set at the wrong baseline. That is what
 * these do.
 *
 * ## Baselines are environment-sensitive
 *
 * Text rendering depends on the installed fonts. The baselines committed here were generated on
 * the machine described in `docs/TEST_REPORT.md`, whose font set is listed in
 * `src/styles/tokens.css` (Cascadia Code, Segoe UI, Source Han / Noto CJK). A machine without
 * those fonts will differ, which is a property of screenshot testing and not a bug in the app.
 * Where that becomes a problem, generate fresh baselines with `pnpm test:e2e:update` in the
 * environment that will run them.
 *
 * ## What is deliberately excluded
 *
 * Anything whose appearance depends on timing — a formula mid-typeset, a diagram mid-render — is
 * awaited to a settled state first, and animations are disabled globally in
 * `playwright.config.ts`. The caret is hidden because its blink phase is not deterministic.
 */

/**
 * Parks the pointer in a corner.
 *
 * Reaching a control with the mouse leaves the pointer over it, and `:hover` styling is part of
 * what gets captured — so a screenshot taken right after a click differs from one taken after
 * the pointer moves away. That is a real source of flakiness rather than a rendering bug.
 */
async function parkPointer(page: Page): Promise<void> {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(120);
}

/** Waits for typesetting to finish so the capture is of a settled document, not a race. */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  /*
   * Fonts must be resolved before anything is measured or captured. The document uses a CJK
   * fallback chain, and a capture taken while that is still resolving renders a different
   * typeface than the baseline — which looks exactly like a regression.
   */
  await page.evaluate(() => document.fonts.ready);
  // Every placeholder the parser emitted must have been filled.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const pending = document.querySelectorAll('[data-om-math]:not([data-om-filled]), [data-om-code]:not([data-om-filled])');
          return pending.length;
        }),
      { timeout: 20_000 },
    )
    .toBe(0);
}

const MIXED = [
  '---',
  'title: 渲染基线',
  '---',
  '',
  '# 渲染基线文档',
  '',
  '一段包含 **粗体**、*斜体*、`行内代码` 与 [链接](https://example.com) 的正文。',
  '',
  '## 公式',
  '',
  '行内公式 $E = mc^2$，以及块级公式：',
  '',
  '$$',
  '\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}',
  '$$',
  '',
  '化学式 $\\ce{2H2 + O2 -> 2H2O}$。',
  '',
  '## 表格',
  '',
  '| 名称 | 数量 | 说明 |',
  '| :--- | ---: | :---: |',
  '| 苹果 | 3 | 新鲜 |',
  '| 香蕉 | 5 | 成熟 |',
  '',
  '## 列表与代码',
  '',
  '- 第一项',
  '- [x] 已完成的任务',
  '- [ ] 未完成的任务',
  '',
  '```js',
  'const answer = 42;',
  '```',
  '',
  '> 引用段落。',
  '',
].join('\n');

/*
 * A tolerance rather than an exact match.
 *
 * Text antialiasing differs by a pixel or two between runs even on one machine, so an exact
 * comparison is flaky by construction. One percent of pixels is far below what any real layout
 * change moves — a shifted column, a lost border or a wrong baseline all change several percent
 * of the image — and far above run-to-run noise.
 */
const TOLERANCE = { maxDiffPixelRatio: 0.01 };

test.describe('visual baselines', () => {
  test('reading mode', async ({ page }) => {
    await page.addInitScript(
      (content) => {
        window.__OPENMARK_TEST_FILES__ = { 'baseline.md': content };
      },
      MIXED,
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('baseline.md'));
    await settled(page);

    // The caret blink phase is not deterministic, so it must not be in the capture.
    await page.addStyleTag({ content: '.cm-cursor, .om-source__caret { visibility: hidden !important; }' });
    /*
     * The document element, not the page.
     *
     * `fullPage` captures nothing extra here: the page body does not scroll, the reading column
     * inside it does. A viewport capture therefore only ever sees the top of the document, and a
     * regression in the table or the code block would pass unnoticed — verified by deliberately
     * breaking the table borders and watching a viewport capture stay green.
     */
    await expect(page.locator('.om-doc')).toHaveScreenshot('reading-mode.png', TOLERANCE);
  });

  test('instant mode', async ({ page }) => {
    await page.addInitScript(
      (content) => {
        window.__OPENMARK_TEST_FILES__ = { 'baseline.md': content };
      },
      MIXED,
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('baseline.md'));
    await page.getByTestId('mode-instant').click();
    await settled(page);

    // Same reasoning as reading mode: capture the document, not the viewport.
    await expect(page.locator('.om-doc')).toHaveScreenshot('instant-mode.png', TOLERANCE);
  });

  test('source mode', async ({ page }) => {
    await page.addInitScript(
      (content) => {
        window.__OPENMARK_TEST_FILES__ = { 'baseline.md': content };
      },
      MIXED,
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('baseline.md'));
    await page.getByTestId('mode-source').click();
    await page.addStyleTag({ content: '.cm-cursor { visibility: hidden !important; }' });

    await expect(page).toHaveScreenshot('source-mode.png', { fullPage: false, ...TOLERANCE });
  });

  test('diagnostics panel', async ({ page }) => {
    const broken = ['# 诊断', '', '$$', 'a = b', '', '```js', '未闭合的围栏', ''].join('\n');
    await page.addInitScript(
      (content) => {
        window.__OPENMARK_TEST_FILES__ = { 'broken.md': content };
      },
      broken,
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('broken.md'));
    await page.getByTestId('panel-diagnostics').click();
    await settled(page);
    await parkPointer(page);

    await expect(page.locator('.om-sidebar')).toHaveScreenshot('diagnostics-panel.png', TOLERANCE);
  });

  test('formula dialog', async ({ page }) => {
    await page.addInitScript(
      (content) => {
        window.__OPENMARK_TEST_FILES__ = { 'baseline.md': content };
      },
      MIXED,
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('baseline.md'));
    await page.locator('.om-math--display').first().click();
    await page.getByTestId('math-edit').click();
    await expect(page.getByTestId('math-dialog-preview').locator('mjx-container')).toBeVisible();
    /*
     * The preview re-typesets on a debounce, so the first container to appear is not
     * necessarily the last. Waiting past the debounce window is what makes the capture stable;
     * without it the screenshot sometimes catches the preview mid-replacement.
     */
    await page.waitForTimeout(500);
    await parkPointer(page);

    await expect(page.getByTestId('math-dialog')).toHaveScreenshot('math-dialog.png', TOLERANCE);
  });

  test('table editor', async ({ page }) => {
    await page.addInitScript(
      (content) => {
        window.__OPENMARK_TEST_FILES__ = { 'baseline.md': content };
      },
      MIXED,
    );
    await page.goto('/');
    await page.waitForFunction(() => Boolean(window.__openmark__));
    await page.evaluate(() => window.__openmark__!.openPath('baseline.md'));
    await page.getByTestId('mode-instant').click();
    await page.locator('.om-block[data-om-kind="table"] .om-block__grid-button').click();
    await expect(page.getByTestId('table-dialog')).toBeVisible();
    await parkPointer(page);

    await expect(page.getByTestId('table-dialog')).toHaveScreenshot('table-editor.png', TOLERANCE);
  });
});
