// Phase 5 "posting" (BR-07 … BR-16): employer registers → creates company → uploads GPKD → admin verifies →
// employer posts → admin rejects (reason shown) → edit + resubmit → admin approves → guests see it;
// dashboard lifecycle actions; a live edit goes back to moderation.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { APP, cleanup, demo, login, ready, service, track, trackErrors, uniqueEmail } from './helpers.mjs';

const browser = await chromium.launch();
const employer = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const adminContext = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const admin = await adminContext.newPage();
const errors = [...trackErrors(employer), ...trackErrors(admin)];
const step = name => console.log('  ✓', name);
const stamp = Date.now().toString().slice(-7);
const companyName = `Công ty Kiểm Thử E2E ${stamp}`;
const jobTitle = `Thực tập sinh Kiểm thử E2E ${stamp}`;
const toast = async (page, re) => page.waitForFunction(r => new RegExp(r).test(document.getElementById('app-feedback')?.textContent || ''), re.source, { timeout: 20000 });

async function adminAction(tab, rowText, action, reason) {
  await admin.goto(`${APP}/pages/admin/?t=${Date.now()}#${tab}`);   // fresh load (same-hash goto would not reload)
  await ready(admin);
  const row = admin.locator('#admin-panel tr', { hasText: rowText });
  await row.waitFor({ timeout: 20000 });
  await row.locator(`button:has-text("${action}")`).click();
  if (reason) await admin.fill('dialog textarea[name=reason]', reason);
  await admin.click('dialog .app-primary');
  await admin.waitForFunction(text => ![...document.querySelectorAll('#admin-panel tr')].some(tr => tr.textContent.includes(text)), rowText, { timeout: 20000 });
}

try {
  // 1. Employer registers and lands on company settings
  const email = uniqueEmail('e2e-employer');
  track(email);
  await employer.goto(`${APP}/pages/register/`);
  await ready(employer);
  await employer.click('[data-role="employer"]');
  await employer.fill('#fullname', 'Tuyển Dụng E2E');
  await employer.fill('#phone', '0912345678');
  await employer.fill('#email', email);
  await employer.fill('#password', 'Matkhau@123');
  await employer.fill('#confirm-password', 'Matkhau@123');
  await employer.check('form input[type=checkbox][required]');
  await Promise.all([employer.waitForURL('**/pages/company-settings/'), employer.click('#submit-btn')]);
  await ready(employer);
  assert.match(await employer.textContent('#settings-title'), /Tạo hồ sơ doanh nghiệp/);
  step('employer sign-up lands on company settings');

  // 2. Create the company
  await employer.fill('#company-name', companyName);
  await employer.fill('#tax-code', `0${stamp}99`);
  await employer.selectOption('#industry', { label: 'Công nghệ thông tin' });
  await employer.fill('#city', 'TP. Hồ Chí Minh');
  await employer.fill('#address', 'Quận 3, TP. Hồ Chí Minh');
  await employer.fill('#description', 'Doanh nghiệp kiểm thử tự động cho luồng đăng tin.');
  await Promise.all([employer.waitForNavigation(), employer.click('#company-save')]);
  await ready(employer);
  assert.match(await employer.textContent('#verification-banner'), /Chưa xác thực/);
  step('company created (unverified)');

  // 3. Unverified companies cannot submit jobs yet (BR-08): submit without GPKD fails (BR-07)
  await employer.click('#submit-verification');
  await toast(employer, /giấy phép kinh doanh/);
  await employer.setInputFiles('#doc-file', { name: 'gpkd.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4\n%%EOF\n') });
  await employer.click('#document-form button[type=submit]');
  await employer.waitForSelector('#documents li:has-text("Giấy phép kinh doanh")');
  await employer.click('#submit-verification');
  await employer.waitForSelector('#verification-banner:has-text("Chờ thẩm định")');
  step('GPKD uploaded and verification submitted (BR-07)');

  // 4. Admin verifies the company
  await login(admin, demo('admin'), undefined);
  await adminAction('companies', companyName, 'Xác thực');
  step('admin verified the company');

  // 5. Employer posts a job: save draft, then submit
  await employer.goto(`${APP}/pages/post-job/`);
  await ready(employer);
  await employer.fill('#job-title', jobTitle);
  await employer.fill('#location', 'Quận 3, TP. Hồ Chí Minh');
  await employer.fill('#salary-min', '5000000');
  await employer.fill('#salary-max', '7000000');
  await employer.check('label:has-text("Mentor 1-on-1") input');
  await employer.click('div.min-h-\\[220px\\]');
  await employer.keyboard.type('Tham gia kiểm thử tự động cho sản phẩm thanh toán, viết test case và báo cáo lỗi hằng tuần cùng mentor.');
  await employer.fill('input[placeholder^="+ Thêm"]', 'Git');
  await employer.press('input[placeholder^="+ Thêm"]', 'Enter');
  await employer.click('button:has-text("Thêm câu hỏi")');
  await employer.fill('dialog input[name=question]', 'Bạn có thể làm 4 buổi mỗi tuần?');
  await employer.fill('dialog input[name=ideal]', 'yes');
  await employer.check('dialog input[name=knockout]');
  await employer.click('dialog .app-primary');
  await employer.click('main button:has-text("Lưu bản nháp")');
  await toast(employer, /Đã lưu bản nháp/);
  assert.match(employer.url(), /\?id=/);
  const jobId = new URL(employer.url()).searchParams.get('id');
  await employer.click('form button[type=submit]');
  await employer.waitForSelector('dialog:has-text("Đã gửi tin để duyệt")');
  const { data: saved } = await service.from('jobs').select('status, perks, stipend_min, industry_id, skills:job_skills(skill:skills(name)), questions:screening_questions(question, is_knockout)').eq('id', jobId).single();
  assert.equal(saved.status, 'pending_approval');
  assert.equal(saved.stipend_min, 5000000);
  assert.ok(saved.perks.some(p => /Mentor/.test(p)));
  assert.deepEqual(saved.skills.map(s => s.skill.name), ['Git']);
  assert.equal(saved.questions[0].is_knockout, true);
  step('job saved as draft, then submitted with perks, skills and a knockout question');

  // 6. Admin rejects with a reason (BR-13); employer sees it and resubmits
  await adminAction('jobs', jobTitle, 'Từ chối', 'E2E: thiếu thông tin thời gian thực tập');
  await employer.goto(`${APP}/pages/employer/`);
  await ready(employer);
  const card = employer.locator(`[data-job-id="${jobId}"]`);
  await card.waitFor();
  assert.match(await card.textContent(), /thiếu thông tin thời gian thực tập/);
  await card.locator('button[title="Chỉnh sửa chi tiết"]').click();
  await ready(employer);
  await employer.waitForSelector('#post-job-banner:has-text("bị từ chối")');
  await employer.click('div.min-h-\\[220px\\]');
  await employer.keyboard.press('End');
  await employer.keyboard.type(' Thời gian thực tập 3 tháng.');
  await employer.click('form button[type=submit]');
  await employer.waitForSelector('dialog:has-text("Đã gửi tin để duyệt")');
  step('rejection reason shown to the employer; edited job resubmitted');

  // 7. Admin approves → guests find the job
  await adminAction('jobs', jobTitle, 'Duyệt');
  const guest = await browser.newPage();
  await guest.goto(`${APP}/?q=${encodeURIComponent(`Kiểm thử E2E ${stamp}`)}`);
  await ready(guest);
  await guest.waitForSelector(`#job-results article h3:has-text("${jobTitle}")`);
  step('approved job is visible to guests');

  // 8. Student applies through the real apply dialog (knockout answered)
  await login(guest, demo('student'), undefined, `/pages/job-detail/?id=${jobId}`);
  await guest.click('main button:has-text("Ứng Tuyển Ngay")');
  await guest.waitForSelector('dialog input[type=radio][name^="q-"]');
  await guest.check('dialog input[type=radio][name^="q-"][value=yes]');
  await guest.click('dialog .app-primary');
  await toast(guest, /Đã nộp đơn ứng tuyển/);
  const { data: apps } = await service.from('applications').select('knockout_passed').eq('job_id', jobId);
  assert.equal(apps.length, 1);
  assert.equal(apps[0].knockout_passed, true);
  await guest.close();
  step('student applied with screening answers');

  // 9. Dashboard: counts and lifecycle actions
  await employer.goto(`${APP}/pages/employer/`);
  await ready(employer);
  await card.waitFor();
  assert.match(await card.textContent(), /Đang tuyển/);
  assert.match(await card.textContent(), /Tổng hồ sơ nộp\s*1/);
  await card.locator('button[title="Tạm dừng nhận đơn"]').click();
  await toast(employer, /tạm dừng/);
  await employer.locator(`[data-job-id="${jobId}"] button[title="Mở lại nhận đơn"]`).click();
  await toast(employer, /mở lại/);
  await employer.locator(`[data-job-id="${jobId}"] button[title="Sao chép tin"]`).click();
  await toast(employer, /bản sao/);
  const copy = employer.locator('[data-job-id]', { hasText: `${jobTitle} (bản sao)` });
  await copy.waitFor();
  await copy.locator('button[title="Xóa bản nháp"]').click();
  await employer.click('dialog .app-primary');
  await toast(employer, /Đã xóa bản nháp/);
  step('dashboard shows counts; pause, resume, duplicate and delete draft work');

  // 10. Editing a live job's title sends it back to moderation (BR-16)
  await employer.goto(`${APP}/pages/post-job/?id=${jobId}`);
  await ready(employer);
  await employer.waitForSelector('#post-job-banner:has-text("đang hiển thị")');
  await employer.fill('#job-title', `${jobTitle} (cập nhật)`);
  await employer.click('form button[type=submit]');
  await toast(employer, /gửi duyệt lại/);
  const { data: after } = await service.from('jobs').select('status').eq('id', jobId).single();
  assert.equal(after.status, 'pending_approval');
  step('live edit moved the job back to pending (BR-16)');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('Posting E2E passed.');
} finally {
  await browser.close();
  await cleanup();
}
