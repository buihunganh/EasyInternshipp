// Every page in the manifest loads (as the right role), has no broken images, no mobile overflow,
// then a few real-data interactions as a throwaway student.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { cleanup, demoSession, ready, roleFor, setSession, throwawayStudent } from './session.mjs';

const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const manifest = JSON.parse(await fs.readFile(new URL('../src/design-manifest.json', import.meta.url), 'utf8'));
await fs.mkdir('test-results', { recursive: true });
const errors = []; page.on('pageerror', error => errors.push(`${page.url()}: ${error.message}`));
const results = [];
try {
  const sessions = { student: await demoSession('student'), employer: await demoSession('employer') };
  await page.goto(base + '/');
  for (const entry of manifest) {
    const role = roleFor(entry.slug);
    await setSession(page, role ? sessions[role] : null);
    const response = await page.goto(base + entry.url, { waitUntil: 'networkidle' });
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(response.status(), 200, entry.slug);
    assert.equal(await page.locator('body').getAttribute('data-page'), entry.slug);
    const broken = await page.locator('img').evaluateAll(images => images.filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src));
    assert.equal(broken.length, 0, `${entry.slug}: broken images ${broken.join(', ')}`);
    await page.screenshot({ path: `test-results/${entry.slug}-desktop.png`, fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `test-results/${entry.slug}-mobile.png`, fullPage: true });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    assert.equal(overflow, false, `${entry.slug}: mobile horizontal overflow`);
    results.push({ page: entry.slug, role: role ?? 'guest', status: response.status(), brokenImages: broken.length, mobileOverflow: overflow });
    await page.setViewportSize({ width: 1280, height: 900 });
  }
  assert.deepEqual(errors, [], 'browser runtime errors');

  // Interactions as a throwaway student
  await setSession(page, await throwawayStudent());
  await page.goto(base + '/'); await ready(page);
  await page.locator('#job-results article').first().waitFor();
  await page.locator('button[title="Lưu công việc"]').first().click();
  await page.waitForFunction(() => document.querySelector('button[title="Lưu công việc"]')?.getAttribute('aria-pressed') === 'true');
  await page.reload(); await ready(page);
  await page.waitForFunction(() => document.querySelector('button[title="Lưu công việc"]')?.getAttribute('aria-pressed') === 'true');
  await page.locator('form input').first().fill('no-such-position');
  await page.locator('form button[type=submit]').click();
  await page.locator('#job-results .app-state-empty').waitFor();

  // Pages still on local demo data keep working
  await page.goto(base + '/pages/messages/'); await ready(page);
  await page.locator('input[placeholder^="Nhập tin nhắn"]').fill('Xin chào, tôi muốn tìm hiểu vị trí thực tập.');
  await page.locator('input[placeholder^="Nhập tin nhắn"]').press('Enter');
  assert.equal(await page.locator('.app-chat-message').count(), 1);
  await page.reload(); await ready(page); assert.equal(await page.locator('.app-chat-message').count(), 1);
  await page.goto(base + '/pages/cv-builder/'); await ready(page);
  await page.locator('#input-fullname').fill('Nguyễn Văn An');
  await page.getByRole('button', { name: /Lưu & Cập nhật/ }).click();
  await page.waitForFunction(() => /Đã tạo CV|Đã lưu CV/.test(document.getElementById('app-feedback')?.textContent || ''));
  await page.waitForURL(/[?&]id=/);   // saved to Supabase; the URL now points at the CV
  await page.reload(); await ready(page); assert.equal(await page.locator('#input-fullname').inputValue(), 'Nguyễn Văn An');
  assert.equal(await page.locator('#preview-name').textContent(), 'NGUYỄN VĂN AN');

  // Unknown job id → not found state; real login lands on the home page
  await page.goto(base + '/pages/job-detail/'); await ready(page);
  assert.match(await page.textContent('main'), /không tồn tại/);
  await setSession(page, null);
  await page.goto(base + '/pages/login/'); await ready(page);
  await page.locator('#email').fill('student@demo.internships.io');
  await page.locator('#password').fill('Demo@2026');
  await Promise.all([page.waitForURL(base + '/'), page.locator('form button[type=submit]').click()]);
  assert.deepEqual(errors, [], 'interaction runtime errors');
  await fs.writeFile('test-results/report.json', JSON.stringify({ pages: results, interactions: 'passed', errors }, null, 2));
  console.log(JSON.stringify({ pages: results, interactions: 'passed', errors }, null, 2));
} finally { await browser.close(); await cleanup(); }
