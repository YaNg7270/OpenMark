#!/usr/bin/env node
/**
 * Diagnostic probe for a single fixture: dumps the rendered HTML plus the computed styles
 * that decide whether the prose is visible at all.
 *
 * Usage: node scripts/probe-fixture.mjs [url]
 */
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';

const FIXTURE = [
  '# 标题',
  '',
  '价格是 $20 和 $30，不是公式。',
  '',
  '真正的公式 $x^2$ 应当渲染。',
  '',
  '普通段落。',
  '',
  '```sh',
  'echo "$HOME"',
  '```',
  '',
].join('\n');

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => {
  if (m.type() === 'error') console.log('[console.error]', m.text());
});

await page.addInitScript((content) => {
  window.__OPENMARK_TEST_FILES__ = { 'probe.md': content };
}, FIXTURE);

await page.goto(url);
await page.waitForFunction(() => Boolean(window.__openmark__));
await page.evaluate(() => window.__openmark__.openPath('probe.md'));
await page.waitForTimeout(2500);

const report = await page.evaluate(() => {
  const doc = document.querySelector('.om-doc');
  if (!doc) return { error: 'no .om-doc' };
  const html = doc.innerHTML;
  const styleOf = (sel) => {
    const el = doc.querySelector(sel);
    if (!el) return `${sel}: MISSING`;
    const cs = getComputedStyle(el);
    return `${sel}: display=${cs.display} visibility=${cs.visibility} opacity=${cs.opacity} color=${cs.color} height=${el.getBoundingClientRect().height}`;
  };
  return {
    htmlLength: html.length,
    htmlHead: html.slice(0, 900),
    styles: ['.om-doc p', 'h1', '.om-code', '.om-math'].map(styleOf),
    innerText: doc.innerText.slice(0, 200),
    textContent: doc.textContent?.slice(0, 200),
    bodyClass: document.documentElement.getAttribute('data-om-theme'),
  };
});

console.log(JSON.stringify(report, null, 2));
await browser.close();
