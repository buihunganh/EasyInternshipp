// Account menu on every signed-in page, notification preferences and saved jobs (real data, throwaway
// student), mobile menu, logout keeps local drafts, contextual menus on pages still on demo data.
import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { STORAGE_KEY, cleanup, demoSession, ready, roleFor, setSession, throwawayStudent } from './session.mjs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
const base = 'http://127.0.0.1:5173';
const manifest = JSON.parse(await fs.readFile(new URL('../src/design-manifest.json', import.meta.url), 'utf8'));
const menu = () => page.getByRole('button', { name: 'Mở menu tài khoản', exact: true });
try {
  const sessions = { student: await throwawayStudent(), employer: await demoSession('employer') };
  await page.goto(base + '/');
  for (const entry of manifest.filter(entry => roleFor(entry.slug))) {
    await setSession(page, sessions[roleFor(entry.slug)]);
    await page.goto(base + entry.url, { waitUntil: 'networkidle' }); await ready(page);
    const trigger = menu();
    assert.equal(await trigger.count(), 1, entry.slug + ' account trigger');
    await trigger.click(); await page.getByRole('menu').waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    await page.keyboard.press('Escape'); assert.equal(await page.getByRole('menu').count(), 0);
    await trigger.focus(); await page.keyboard.press('Enter'); await page.getByRole('menu').waitFor();
    await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click();
    await page.getByRole('dialog', { name: 'Đăng xuất tài khoản' }).waitFor();
    await page.getByRole('button', { name: 'Hủy', exact: true }).click(); assert.equal(page.url(), base + entry.url);
    console.log(entry.slug, 'account menu + cancel passed');
  }

  await setSession(page, sessions.student);
  await page.goto(base + '/'); await ready(page);
  await menu().click();
  await page.screenshot({ path: 'test-results/account-menu-desktop.png', animations: 'disabled' });
  await page.mouse.click(300, 400); assert.equal(await page.getByRole('menu').count(), 0);
  await menu().click(); await page.getByRole('menuitem', { name: 'Xem hồ sơ cá nhân' }).click(); await page.waitForURL(base + '/pages/profile/'); await ready(page);
  await menu().click(); await page.getByRole('menuitem', { name: 'Chỉnh sửa hồ sơ / CV' }).click(); await page.waitForURL(base + '/pages/cv-builder/'); await ready(page);

  // Notification preferences are stored in notification_preferences
  await menu().click(); await page.getByRole('menuitem', { name: 'Cài đặt thông báo' }).click();
  await page.locator('dialog input[name=email_job_alerts]').uncheck(); await page.getByRole('button', { name: 'Lưu cài đặt' }).click();
  await page.waitForFunction(() => /Đã lưu cài đặt/.test(document.getElementById('app-feedback')?.textContent || ''));
  await page.reload(); await ready(page);
  await menu().click(); await page.getByRole('menuitem', { name: 'Cài đặt thông báo' }).click();
  await page.locator('dialog input[name=email_job_alerts]').waitFor();
  assert.equal(await page.locator('dialog input[name=email_job_alerts]').isChecked(), false); await page.keyboard.press('Escape');

  // Saved jobs (saved_jobs table) through the account menu
  await page.goto(base + '/'); await ready(page);
  await page.locator('#job-results [title="Lưu công việc"]').first().click();
  await page.waitForFunction(() => document.querySelector('#job-results [title="Lưu công việc"]')?.getAttribute('aria-pressed') === 'true');
  await menu().click(); await page.getByRole('menuitem', { name: 'Việc làm đã lưu' }).click();
  await page.locator('.app-remove-saved').first().click();
  await page.locator('.app-saved-list .app-muted').waitFor();
  await page.keyboard.press('Escape');

  // Mobile menu fits the screen; logout keeps local drafts
  await page.setViewportSize({ width: 390, height: 844 }); await menu().click();
  const rect = await page.getByRole('menu').boundingBox(); assert(rect.x >= 0 && rect.x + rect.width <= 390); await page.screenshot({ path: 'test-results/account-menu-mobile.png', animations: 'disabled' });
  await page.keyboard.press('End'); assert.equal(await page.locator(':focus').textContent(), 'logoutĐăng xuất');
  await page.getByRole('menuitem', { name: 'Đăng xuất', exact: true }).click(); await page.screenshot({ path: 'test-results/logout-modal-mobile.png', animations: 'disabled' });
  await page.evaluate(() => localStorage.setItem('internships:form:cv-builder', JSON.stringify({ name: 'Keep me' })));
  await page.getByRole('dialog').getByRole('button', { name: 'Đăng xuất', exact: true }).click(); await page.waitForURL(base + '/pages/login/');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), STORAGE_KEY), null);
  assert.notEqual(await page.evaluate(() => localStorage.getItem('internships:form:cv-builder')), null);
  await page.setViewportSize({ width: 1280, height: 900 });

  // Contextual menus on pages still using demo data
  await setSession(page, sessions.student);
  await page.goto(base + '/pages/messages/'); await ready(page);
  await page.getByRole('button', { name: 'Tùy chọn cuộc trò chuyện' }).click(); await page.getByRole('menuitem', { name: 'Tắt thông báo cuộc trò chuyện' }).click(); await page.reload(); await ready(page);
  assert.match(await page.locator('#conversation-status').textContent(), /Đã tắt thông báo/);
  await page.goto(base + '/pages/community/'); await ready(page);
  await page.getByRole('button', { name: 'Tùy chọn bài viết' }).first().click(); await page.getByRole('menuitem', { name: 'Báo cáo bài viết' }).click(); await page.getByRole('dialog', { name: 'Báo cáo nội dung' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Profile navigation, preferences, saved jobs, mobile menus, logout, contextual menus passed.');
} finally { await browser.close(); await cleanup(); }
