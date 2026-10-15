import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Accessibility audit.
 *
 * Runs the axe-core ruleset against every surface a reader actually meets, and fails on any
 * violation. This is a real audit rather than a checklist: the rules are enforced, so a control
 * added without an accessible name or a colour that drops below the contrast threshold fails
 * the suite.
 *
 * ## What is deliberately excluded
 *
 * `region` is disabled. The application is a single-window desktop shell, not a web page: its
 * chrome is outside a `<main>` landmark by design, and forcing a landmark structure onto a
 * native-feeling app would produce rules-compliance rather than usability.
 *
 * ## Animations
 *
 * Disabled globally in `playwright.config.ts`, so the audit never measures a colour mid-fade.
 */

const MIXED = [
  '# 无障碍审计',
  '',
  '一段正文，含 **粗体**、`行内代码` 与 [链接](https://example.com)。',
  '',
  '$$',
  'E = mc^2',
  '$$',
  '',
  '| 名称 | 数量 |',
  '| --- | ---: |',
  '| 苹果 | 3 |',
  '',
  '- [x] 已完成',
  '- [ ] 未完成',
  '',
  '```js',
  'const x = 1;',
  '```',
  '',
].join('\n');

async function openFixture(page: Page): Promise<void> {
  await page.addInitScript((content) => {
    window.__OPENMARK_TEST_FILES__ = { 'a11y.md': content };
  }, MIXED);
  await page.goto('/');
  await page.waitForFunction(() => Boolean(window.__openmark__));
  await page.evaluate(() => window.__openmark__!.openPath('a11y.md'));
}

function audit(page: Page) {
  return new AxeBuilder({ page }).disableRules(['region']);
}

test.describe('accessibility', () => {
  test('the shell and an open document have no violations', async ({ page }) => {
    await openFixture(page);
    const results = await audit(page).analyze();
    expect(format(results.violations)).toBe('no violations');
  });

  test('source mode has no violations', async ({ page }) => {
    await openFixture(page);
    await page.getByTestId('mode-source').click();
    await expect(page.locator('.om-source__host .cm-content')).toBeVisible();

    const results = await audit(page).analyze();
    expect(format(results.violations)).toBe('no violations');
  });

  test('instant mode has no violations', async ({ page }) => {
    await openFixture(page);
    await page.getByTestId('mode-instant').click();
    await expect(page.locator('.om-block').first()).toBeVisible();

    const results = await audit(page).analyze();
    expect(format(results.violations)).toBe('no violations');
  });

  test('the side panels have no violations', async ({ page }) => {
    await openFixture(page);

    for (const panel of ['panel-diagnostics', 'panel-search', 'panel-settings', 'panel-recent']) {
      await page.getByTestId(panel).click();
      const results = await audit(page).analyze();
      expect(format(results.violations), `violations with ${panel} open`).toBe('no violations');
    }
  });

  test('the formula dialog has no violations', async ({ page }) => {
    // The dialog typesets live, so it needs a formula present in the fixture.
    await openFixture(page);
    await page.locator('.om-math--display').click();
    await page.getByTestId('math-edit').click();
    await expect(page.getByTestId('math-dialog')).toBeVisible();
    // The preview re-typesets on a debounce, so auditing immediately can catch it mid-replace.
    await expect(page.getByTestId('math-dialog-preview').locator('mjx-container')).toBeVisible();
    await page.waitForTimeout(500);

    const results = await audit(page).analyze();
    expect(format(results.violations)).toBe('no violations');
  });

  test('the table editor has no violations', async ({ page }) => {
    await openFixture(page);
    await page.getByTestId('mode-instant').click();
    await page.locator('.om-block[data-om-kind="table"] .om-block__grid-button').click();
    await expect(page.getByTestId('table-dialog')).toBeVisible();

    const results = await audit(page).analyze();
    expect(format(results.violations)).toBe('no violations');
  });
});

interface AxeViolation {
  id: string;
  impact?: string | null;
  help: string;
  nodes: { target: unknown[]; failureSummary?: string }[];
}

/**
 * Renders violations so a failure names the rule, the element and why.
 *
 * axe's default output is a deep object that Playwright truncates into something unreadable,
 * and a violation nobody can locate is a violation nobody fixes.
 */
function format(violations: AxeViolation[]): string {
  if (violations.length === 0) return 'no violations';
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => `      ${node.target.join(' ')}\n        ${(node.failureSummary ?? '').split('\n').join('\n        ')}`)
        .join('\n');
      return `  [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}\n${nodes}`;
    })
    .join('\n');
}
