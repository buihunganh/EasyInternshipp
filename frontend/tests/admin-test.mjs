// Admin console on real data: login rules, password toggle, collapsed sidebar, every tab, filters,
// search, HTML escaping of user-submitted report text (XSS), audit log, mobile, logout.
// Read-only apart from one report it creates and deletes.
import { chromium, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { ready } from './session.mjs';
import { service } from './e2e/helpers.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1313, height: 927 } });
const errors = []; page.on('pageerror', error => errors.push(error.message));
page.on('dialog', d => d.dismiss());
const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const marker = `XSS-${Date.now()}`;
let reportId = null;
try {
  // A guest report whose text contains HTML; the admin panel must show it as text
  const { data: job } = await service.from('jobs').select('id').eq('status', 'active').limit(1).single();
  const { data: report, error } = await service.from('reports')
    .insert({ target_type: 'job', target_id: job.id, reason: 'spam', details: `${marker} <img src=x onerror=alert(1)>` }).select('id').single();
  if (error) throw error;
  reportId = report.id;

  await page.goto(base + '/pages/admin/');
  await page.waitForURL('**/pages/admin-login/');
  await page.locator('#admin-email').fill('admin@demo.internships.io');
  await page.locator('#admin-password').fill('wrong-password');
  await page.locator('button[type=submit]').click();
  await expect(page.locator('#admin-login-error')).toBeVisible();
  await expect(page.locator('#admin-login-error')).toContainText('Email hoặc mật khẩu không đúng');
  await page.locator('#admin-password').fill('Demo@2026');
  await page.locator('#admin-show-password').click();
  await expect(page.locator('#admin-password')).toHaveAttribute('type', 'text');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/pages/admin/'); await ready(page);

  await page.mouse.move(600, 500);
  await expect(page.locator('.admin-sidebar')).toHaveCSS('width', '72px');
  await page.locator('.admin-sidebar').hover();
  await expect(page.locator('.admin-sidebar')).toHaveCSS('width', '240px');
  await page.mouse.move(800, 500);

  // Overview stats come from admin_overview
  await expect(page.locator('#admin-stats .admin-stat')).toHaveCount(4);

  // Jobs: pending queue by default, filters, search empty state
  await page.locator('[data-tab=jobs]').click();
  await expect(page.locator('#admin-filter')).toHaveValue('pending_approval');
  await page.locator('#admin-filter').selectOption('active');
  await expect(page.locator('#admin-panel tr').first()).toBeVisible();
  await expect(page.locator('#admin-panel')).toContainText('Đang tuyển');
  await page.locator('#admin-search').fill('no-such-job');
  await expect(page.locator('.admin-empty')).toBeVisible();

  // Companies, accounts
  await page.locator('[data-tab=companies]').click();
  await page.locator('#admin-filter').selectOption('verified');
  await expect(page.locator('#admin-panel')).toContainText('TechNova Solutions');
  await page.locator('[data-tab=users]').click();
  await expect(page.locator('#admin-panel')).toContainText('student@demo.internships.io');

  // Reports: user text is escaped, never rendered as HTML
  await page.locator('[data-tab=reports]').click();
  await expect(page.locator('#admin-panel')).toContainText(marker);
  await expect(page.locator('#admin-panel img')).toHaveCount(0);

  // Audit log lists earlier admin decisions
  await page.locator('[data-tab=audit]').click();
  await expect(page.locator('.admin-table tbody tr').first()).toBeVisible();

  await page.screenshot({ path: 'test-results/admin-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: 'test-results/admin-mobile.png', fullPage: true });
  await page.locator('#exit-admin').click(); await page.waitForURL('**/pages/admin-login/');
  await page.goto(base + '/pages/admin/'); await page.waitForURL('**/pages/admin-login/');
  assert.deepEqual(errors, []);
  console.log('Admin: login rules, sidebar, overview, job/company/account/report/audit tabs, filters, escaping, mobile and logout passed.');
} finally {
  if (reportId) await service.from('reports').delete().eq('id', reportId);
  await browser.close();
}
