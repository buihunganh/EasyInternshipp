// Phase 4 (BR-17, BR-18, BR-37): guests find, filter and open real jobs; company page; save; report.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { APP, demo, login, ready, service, trackErrors } from './helpers.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = trackErrors(page);
const step = name => console.log('  ✓', name);
const titles = () => page.$$eval('#job-results article h3', hs => hs.map(h => h.textContent.trim()));

try {
  // Home: only active jobs from the database (BR-18)
  await page.goto(`${APP}/`);
  await ready(page);
  await page.waitForSelector('#job-results article');
  let list = await titles();
  assert.ok(list.includes('Software Engineering Intern (Full-stack)'));
  assert.ok(!list.includes('QA Automation Intern'), 'pending jobs never show');
  assert.ok(!list.some(t => /bản nháp/.test(t)), 'drafts never show');
  const total = Number((await page.textContent('main h2 span')).replace(/\D/g, ''));
  assert.ok(total >= 4);
  step(`home lists ${total} active jobs from the database`);

  // Keyword search
  await page.fill('form input >> nth=0', 'Golang');
  await page.click('form button[type=submit]');
  await page.waitForFunction(() => [...document.querySelectorAll('#job-results article h3')].length === 1);
  assert.deepEqual(await titles(), ['Backend Developer Intern (Golang / Java)']);
  assert.match(page.url(), /q=Golang/);
  step('keyword search finds the Golang job and updates the URL');

  // Filters: remote work type + reset
  await page.click('button:has-text("Thiết lập lại")');
  await page.waitForFunction(() => document.querySelectorAll('#job-results article').length >= 4);
  await page.check('aside label:has-text("Remote") input');
  await page.waitForFunction(() => document.querySelectorAll('#job-results article').length === 1);
  assert.deepEqual(await titles(), ['Product Design (UI/UX) Intern']);
  step('work-type filter narrows to the remote job');

  // Stipend slider: at least 10 million → the seeded 12M and 14M jobs stay, the seeded ≤9M jobs go
  // (the shared dev project may hold extra jobs people created by hand, so don't assert an exact count)
  await page.click('button:has-text("Thiết lập lại")');
  await page.waitForFunction(() => document.querySelectorAll('#job-results article').length >= 4);
  await page.$eval('input[type=range]', el => { el.value = '10'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => { const t = document.getElementById('job-results')?.textContent || ''; return !/Data Analyst Intern|Product Design/.test(t) && /Backend Developer Intern/.test(t) && /Software Engineering Intern/.test(t); });
  list = await titles();
  for (const t of ['Backend Developer Intern (Golang / Java)', 'Software Engineering Intern (Full-stack)']) assert.ok(list.includes(t), `${t} missing from ≥10M results`);
  step('stipend slider filters by minimum allowance');

  // Quick chip with no matches shows the empty state
  await page.click('button:has-text("Thiết lập lại")');
  await page.click('section button:has-text("Tuyển gấp")');
  await page.waitForSelector('#job-results .app-state-empty');
  step('"Tuyển gấp" chip with no matches shows the empty state');

  // Open a job: detail from the database
  await page.click('button:has-text("Thiết lập lại")');
  await page.waitForSelector('#job-results article h3:has-text("Software Engineering Intern (Full-stack)")');
  await Promise.all([page.waitForURL('**/pages/job-detail/?id=*'), page.click('#job-results article h3:has-text("Software Engineering Intern (Full-stack)")')]);
  await ready(page);
  assert.equal((await page.textContent('main h1')).trim(), 'Software Engineering Intern (Full-stack)');
  assert.match(await page.textContent('main'), /8 - 12 Triệu VNĐ/);
  assert.match(await page.textContent('main'), /TechNova Solutions/);
  assert.match(await page.textContent('main'), /React/);
  const jobId = new URL(page.url()).searchParams.get('id');
  step('job detail shows the real job, stipend, company and skills');

  // Guest report (BR-37)
  await page.click('button:has-text("Báo cáo tin tuyển dụng")');
  await page.selectOption('dialog select[name=kind]', 'fake_job');
  await page.fill('dialog textarea[name=reason]', 'E2E: báo cáo thử từ khách');
  await page.click('dialog .app-primary');
  await page.waitForSelector('#app-feedback:has-text("Đã gửi báo cáo")');
  const { data: reports } = await service.from('reports').select('id, reporter_id').eq('target_id', jobId).eq('details', 'E2E: báo cáo thử từ khách');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].reporter_id, null);
  await service.from('reports').delete().eq('id', reports[0].id);
  step('guests can report a job');

  // Guest apply → login with next
  await Promise.all([page.waitForURL('**/pages/login/?next=*'), page.click('main button:has-text("Ứng Tuyển Ngay")')]);
  step('guest clicking apply is sent to login');

  // Company page
  await page.goto(`${APP}/pages/job-detail/?id=${jobId}`);
  await ready(page);
  await Promise.all([page.waitForURL('**/pages/company/?id=*'), page.click('main aside a:has-text("Xem hồ sơ công ty")')]);
  await ready(page);
  assert.equal((await page.textContent('main h1')).trim(), 'TechNova Solutions');
  const companyJobs = await page.$$eval('#jobs-section h3', hs => hs.map(h => h.textContent.trim()));
  assert.ok(companyJobs.includes('Software Engineering Intern (Full-stack)') && companyJobs.includes('Data Analyst Intern'));
  assert.ok(!companyJobs.includes('QA Automation Intern'));
  step(`company page shows ${companyJobs.length} open jobs`);

  // Unknown id → friendly not-found state
  await page.goto(`${APP}/pages/job-detail/?id=00000000-0000-0000-0000-000000000000`);
  await ready(page);
  assert.match(await page.textContent('main'), /không tồn tại/);
  step('unknown job id shows a not-found state');

  // Student: save a job and follow the company
  await login(page, demo('student'));
  await page.waitForSelector('#job-results article');
  assert.match(await page.textContent('#job-results'), /% phù hợp/);
  const card = page.locator('#job-results article', { hasText: 'Data Analyst Intern' });
  await card.locator('button[title="Lưu công việc"]').click();
  await page.waitForFunction(() => [...document.querySelectorAll('#job-results article')].some(a => a.textContent.includes('Data Analyst Intern') && a.querySelector('button[aria-pressed="true"]')));
  await page.click('.site-header-account');
  await page.click('.app-menu-item:has-text("Việc làm đã lưu")');
  await page.waitForSelector('dialog .app-saved-row:has-text("Data Analyst Intern")');
  await page.click('dialog .app-saved-row:has-text("Data Analyst Intern") .app-remove-saved');
  await page.waitForSelector('dialog .app-saved-row:has-text("Data Analyst Intern")', { state: 'detached' });
  await page.keyboard.press('Escape');
  step('student sees match %, saves a job and unsaves it from the account menu');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('Discovery E2E passed.');
} finally {
  await browser.close();
}
