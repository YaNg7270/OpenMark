#!/usr/bin/env node
/**
 * Diagnostic probe: loads the built app in Edge and reports console output, page errors and
 * the rendered HTML. Used when a Playwright failure only says "element not found" and the
 * real cause is an exception during boot.
 *
 * Usage: node scripts/probe-page.mjs [url]
 */
import { chromium } from '@playwright/test';

const url = process.argv[2] ?? 'http://127.0.0.1:4173/';

const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage();

const console_ = [];
page.on('console', (msg) => console_.push(`[${msg.type()}] ${msg.text()}`));
page.on('pageerror', (err) => console_.push(`[pageerror] ${err.message}\n${err.stack ?? ''}`));
page.on('requestfailed', (req) => console_.push(`[requestfailed] ${req.url()} :: ${req.failure()?.errorText ?? ''}`));

const response = await page.goto(url, { waitUntil: 'networkidle' });
console.log('status:', response?.status());
await page.waitForTimeout(1500);

console.log('\n=== console / errors ===');
console.log(console_.length === 0 ? '(none)' : console_.join('\n'));

console.log('\n=== #root innerHTML (first 1200 chars) ===');
console.log((await page.locator('#root').innerHTML()).slice(0, 1200));

console.log('\n=== document.title ===');
console.log(await page.title());

await browser.close();
