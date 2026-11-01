// Design tokens on every page (as the right role): body colours, primary buttons, no overflow at 390px.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { demoSession, ready, roleFor, setSession } from './session.mjs';

const base = 'http://127.0.0.1:5173';
const browser = await chromium.launch(); const page = await browser.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
const slugs = ['jobs', ...fs.readdirSync(new URL('../pages', import.meta.url))];
const sessions = { student: await demoSession('student'), employer: await demoSession('employer'), admin: await demoSession('admin') };
await page.goto(base + '/');
for (const slug of slugs) {
  const path = slug === 'jobs' ? '/' : `/pages/${slug}/`;
  const role = roleFor(slug);
  await setSession(page, role ? sessions[role] : null);
  await page.setViewportSize({ width: 1313, height: 927 }); await page.goto(base + path);
  if (slug !== 'admin-login') await ready(page);
  assert.equal(new URL(page.url()).pathname, path, `Expected ${path}, not a redirect`);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(246, 248, 251)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(36, 49, 87)');
  const button = page.locator('button.bg-primary:not(.rounded-full),.admin-primary').first(); if (await button.count()) {
    await expect(button).toHaveCSS('background-color', 'rgb(63, 91, 170)'); await expect(button).toHaveCSS('border-radius', '8px');
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, path + ' overflow');
  console.log(path, 'passed');
}
assert.deepEqual(errors, []); await browser.close();
