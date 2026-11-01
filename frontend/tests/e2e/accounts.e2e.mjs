// Phase 2–3 (BR-01 … BR-06): real sign-up, login, role guards, logout, admin login.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { APP, DEMO_PASSWORD, cleanup, demo, login, logout, ready, track, trackErrors, uniqueEmail } from './helpers.mjs';

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = trackErrors(page);
const step = name => console.log('  ✓', name);

try {
  // BR-06 + guard: guests are sent to login with a safe `next`
  await page.goto(`${APP}/pages/profile/`);
  await page.waitForURL('**/pages/login/?next=*');
  assert.match(page.url(), /next=%2Fpages%2Fprofile%2F/);
  step('guest opening a private page is sent to login with next');

  // Wrong password shows a Vietnamese error, stays on the page
  await ready(page);
  await page.fill('#email', demo('student'));
  await page.fill('#password', 'wrong-password');
  await page.click('form button[type=submit]');
  await page.waitForSelector('.app-form-error:not([hidden])');
  assert.match(await page.textContent('.app-form-error'), /Email hoặc mật khẩu không đúng/);
  step('wrong password shows an error');

  // Student logs in and returns to `next`; header shows the real profile
  await page.fill('#password', DEMO_PASSWORD);
  await Promise.all([page.waitForURL('**/pages/profile/'), page.click('form button[type=submit]')]);
  await ready(page);
  assert.match(await page.textContent('.site-header-account'), /Nguyễn Minh Thư/);
  assert.match(await page.textContent('.site-header-account'), /Sinh viên/);
  step('student login returns to next and shows the profile name');

  // Role guard: a student opening an employer page is redirected home with a message
  await page.goto(`${APP}/pages/employer/`);
  await page.waitForURL(url => url.pathname === '/');
  await ready(page);
  assert.match(await page.textContent('#app-feedback'), /vai trò/);
  step('student is blocked from employer pages');

  // Logout through the account menu
  await page.click('.site-header-account');
  await page.click('.app-menu-item:has-text("Đăng xuất")');
  await Promise.all([page.waitForURL('**/pages/login/'), page.click('dialog .app-primary')]);
  await ready(page);
  assert.match(await page.textContent('#app-feedback'), /đăng xuất/i);
  assert.equal(await page.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('auth-token'))), false);
  step('logout signs out and shows a message');

  // Employer lands on the employer dashboard
  await login(page, demo('employer'));
  assert.equal(new URL(page.url()).pathname, '/pages/employer/');
  assert.match(await page.textContent('.site-header-account'), /Mai Phương/);
  step('employer login lands on /pages/employer/');
  await logout(page);

  // Register: password rules are enforced in the browser (BR-05)
  await page.goto(`${APP}/pages/register/`);
  await ready(page);
  const options = await page.$$eval('#university option', o => o.map(x => x.textContent));
  assert.ok(options.some(o => /Bách khoa/.test(o)), 'universities come from the database');
  await page.fill('#fullname', 'Kiểm Thử');
  await page.fill('#phone', '0912345678');
  const studentEmail = uniqueEmail('e2e-student');
  await page.fill('#email', studentEmail);
  await page.selectOption('#university', { index: 1 });
  await page.fill('#password', 'short');
  await page.fill('#confirm-password', 'short');
  await page.check('form input[type=checkbox][required]');
  await page.click('#submit-btn');
  assert.equal(await page.$eval('#password', el => el.validationMessage), 'Mật khẩu cần ít nhất 8 ký tự.');
  step('register rejects passwords shorter than 8');

  // Student sign-up creates the account and signs in (BR-01)
  await page.fill('#password', 'Matkhau@123');
  await page.fill('#confirm-password', 'Matkhau@123');
  await page.fill('#student-code', `E2E${Date.now() % 100000}`);
  track(studentEmail);
  await Promise.all([page.waitForURL(url => url.pathname === '/'), page.click('#submit-btn')]);
  await ready(page);
  assert.match(await page.textContent('.site-header-account'), /Kiểm Thử/);
  step('student sign-up signs in and lands on the home page');
  await logout(page);

  // Employer sign-up goes to company settings
  await page.goto(`${APP}/pages/register/`);
  await ready(page);
  await page.click('[data-role="employer"]');
  assert.equal(await page.isHidden('#university'), true, 'no university for employers');
  const employerEmail = uniqueEmail('e2e-employer');
  track(employerEmail);
  await page.fill('#fullname', 'Nhà Tuyển Dụng Thử');
  await page.fill('#phone', '0912345679');
  await page.fill('#email', employerEmail);
  await page.fill('#password', 'Matkhau@123');
  await page.fill('#confirm-password', 'Matkhau@123');
  await page.check('form input[type=checkbox][required]');
  await Promise.all([page.waitForURL('**/pages/company-settings/'), page.click('#submit-btn')]);
  step('employer sign-up lands on company settings');
  await logout(page);

  // Officer sign-up is pending until an admin activates it (BR-02)
  await page.goto(`${APP}/pages/register/`);
  await ready(page);
  await page.click('[data-role="university"]');
  const officerEmail = uniqueEmail('e2e-officer');
  track(officerEmail);
  await page.fill('#fullname', 'Cán Bộ Thử');
  await page.fill('#phone', '0912345670');
  await page.fill('#email', officerEmail);
  await page.selectOption('#university', { index: 1 });
  await page.fill('#password', 'Matkhau@123');
  await page.fill('#confirm-password', 'Matkhau@123');
  await page.check('form input[type=checkbox][required]');
  await Promise.all([page.waitForURL('**/pages/login/'), page.click('#submit-btn')]);
  await ready(page);
  assert.match(await page.textContent('#app-feedback'), /chờ quản trị viên kích hoạt/);
  await page.fill('#email', officerEmail);
  await page.fill('#password', 'Matkhau@123');
  await page.click('form button[type=submit]');
  await page.waitForSelector('.app-form-error:not([hidden])');
  assert.match(await page.textContent('.app-form-error'), /chờ quản trị viên kích hoạt/);
  step('officer sign-up stays pending and cannot log in yet');

  // Admin login rejects non-admins and accepts the admin
  await page.goto(`${APP}/pages/admin-login/`);
  await page.fill('#admin-email', demo('student'));
  await page.fill('#admin-password', DEMO_PASSWORD);
  await page.click('#admin-login-form button[type=submit]');
  await page.waitForSelector('#admin-login-error:not([hidden])');
  assert.match(await page.textContent('#admin-login-error'), /không có quyền quản trị/);
  await page.fill('#admin-email', demo('admin'));
  await Promise.all([page.waitForURL('**/pages/admin/'), page.click('#admin-login-form button[type=submit]')]);
  await ready(page);
  assert.match(await page.textContent('#admin-name'), /Quản trị viên/);
  step('admin login rejects students and admits the admin');

  // The pending officer shows up for activation
  await page.goto(`${APP}/pages/admin/#users`);
  await page.selectOption('#admin-filter', 'pending_verification');
  await page.waitForSelector(`#admin-panel tr:has-text("${officerEmail}")`);
  step('pending officer appears in the admin accounts tab');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('Accounts E2E passed.');
} finally {
  await browser.close();
  await cleanup();
}
