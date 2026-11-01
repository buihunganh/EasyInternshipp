// Phase 6 "apply" (BR-20 … BR-23, BR-25, BR-27, BR-45): a student without a CV is asked to create one,
// builds it, applies with answers, a second application is blocked, the application shows in My
// Applications (with the employer's actions reflected), interview RSVP, offer acceptance, withdrawal while
// under review; profile edit + verification request; public CV link; job alerts.
// All employer data lives in a throwaway company (deleted in cleanup), so seeded data is untouched.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { APP, DEMO_PASSWORD, cleanup, clientFor, createUser, demo, login, ready, service, trackErrors } from './helpers.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = trackErrors(page);
const step = name => console.log('  ✓', name);
const toast = re => page.waitForFunction(r => new RegExp(r).test(document.getElementById('app-feedback')?.textContent || ''), re.source, { timeout: 20000 });
const inDays = d => new Date(Date.now() + d * 86400000).toISOString();

/** A verified throwaway company with two approved jobs (one with a required knockout question). */
async function employerWithJobs() {
  const owner = await createUser({ role: 'employer', full_name: 'NTD Kiểm Thử P6' });
  const employer = await clientFor(owner.email);
  const { data: companyId, error } = await employer.rpc('create_company', { p_name: `Công ty P6 ${Date.now() % 1e6}`, p_city: 'TP. Hồ Chí Minh' });
  if (error) throw error;
  await service.from('companies').update({ verification_status: 'verified' }).eq('id', companyId);
  const admin = await clientFor(demo('admin'));
  const jobs = {};
  for (const [key, title, question] of [['main', `Thực tập sinh P6 Chính ${Date.now() % 1e5}`, true], ['spare', `Thực tập sinh P6 Phụ ${Date.now() % 1e5}`, false]]) {
    const { data: job, error: e } = await employer.from('jobs').insert({ company_id: companyId, title, description: 'Mô tả công việc kiểm thử luồng ứng tuyển của sinh viên trên Internships.io.', deadline: inDays(20) }).select('id').single();
    if (e) throw e;
    if (question) {
      const { data: q } = await employer.from('screening_questions').insert({ job_id: job.id, question: 'Bạn có thể làm 4 buổi mỗi tuần?', kind: 'yes_no', is_required: true, is_knockout: true }).select('id').single();
      await employer.from('screening_question_keys').insert({ question_id: q.id, ideal_answer: 'yes' });
    }
    await employer.rpc('submit_job', { p_job: job.id });
    const { error: m } = await admin.rpc('moderate_job', { p_job: job.id, p_approve: true });
    if (m) throw m;
    jobs[key] = { id: job.id, title };
  }
  return { employer, jobs };
}

try {
  const { employer, jobs } = await employerWithJobs();
  const { data: hcmut } = await service.from('universities').select('id').eq('short_name', 'HCMUT').single();
  const student = await createUser({ role: 'student', full_name: 'Sinh Viên P6', university_id: hcmut.id, student_code: `P6${Date.now() % 1e6}` });
  await login(page, student.email, DEMO_PASSWORD);
  step('throwaway student signed in');

  // 1. No CV yet → asked to create one; the builder starts from the profile, then returns to the job
  await page.goto(`${APP}/pages/job-detail/?id=${jobs.main.id}`); await ready(page);
  await page.click('main button:has-text("Ứng Tuyển Ngay")');
  await page.waitForSelector('dialog:has-text("Bạn cần có CV trước khi ứng tuyển")');
  await Promise.all([page.waitForURL('**/pages/cv-builder/?id=new&return=*'), page.click('dialog .app-primary')]);
  await ready(page);
  assert.equal(await page.inputValue('#input-fullname'), 'Sinh Viên P6', 'new CV starts from the profile');
  assert.match(await page.textContent('#a4-cv-sheet'), /SINH VIÊN P6/);
  await page.fill('#input-summary', 'Sinh viên năm 3 muốn thực tập kiểm thử phần mềm.');
  await page.click('main button:has-text("Lưu & Cập nhật")');
  await page.waitForSelector('dialog:has-text("Quay lại tin tuyển dụng")');
  const { data: cvs } = await service.from('cvs').select('id, is_default, content').eq('student_id', student.id);
  assert.equal(cvs.length, 1);
  assert.equal(cvs[0].is_default, true, 'first CV becomes the default');
  assert.equal(cvs[0].content.personal.name, 'Sinh Viên P6');
  assert.match(cvs[0].content.summary, /kiểm thử phần mềm/);
  await Promise.all([page.waitForURL(`**/pages/job-detail/?id=${jobs.main.id}`), page.click('dialog .app-primary')]);
  await ready(page);
  step('no-CV student creates a CV from the profile and returns to the job');

  // 2. Apply with the default CV and the required knockout answer
  await page.click('main button:has-text("Ứng Tuyển Ngay")');
  await page.waitForSelector('dialog select[name=cv]');
  assert.match(await page.$eval('dialog select[name=cv]', s => s.selectedOptions[0].textContent), /mặc định/);
  await page.click('dialog .app-primary');
  assert.equal(await page.$eval('dialog input[type=radio][required]', r => r.validity.valueMissing), true, 'required answer enforced');
  await page.check('dialog input[type=radio][value=yes]');
  await page.fill('dialog textarea[name=letter]', 'Em rất mong được học hỏi.');
  await page.click('dialog .app-primary');
  await toast(/Đã nộp đơn ứng tuyển/);
  await page.waitForSelector('main button:has-text("Đã ứng tuyển")');
  const { data: app } = await service.from('applications').select('id, knockout_passed, cv_snapshot').eq('job_id', jobs.main.id).eq('student_id', student.id).single();
  assert.equal(app.knockout_passed, true);
  assert.equal(app.cv_snapshot.personal.name, 'Sinh Viên P6', 'CV frozen at submission (BR-22)');
  step('applied with the default CV and screening answers');

  // 3. A second application is blocked (BR-21)
  await page.reload(); await ready(page);
  const { error: dup } = await (await clientFor(student.email)).rpc('apply_to_job', { p_job: jobs.main.id });
  assert.match(dup.message, /đã nộp đơn/);
  step('a second application is blocked');

  // 4. My Applications shows it; employer actions appear (CV viewed, interview) and the student RSVPs
  await employer.rpc('mark_application_viewed', { p_application: app.id });
  const { error: iv } = await employer.rpc('schedule_interview', { p_application: app.id, p_scheduled_at: inDays(3), p_meeting_url: 'https://meet.example.com/p6' });
  if (iv) throw iv;
  await page.goto(`${APP}/pages/applications/?id=${app.id}`); await ready(page);
  const card = page.locator(`[data-application-id="${app.id}"]`);
  await card.waitFor();
  assert.match(await card.textContent(), /Đang phỏng vấn/);
  assert.match(await card.textContent(), /NTD đã xem CV/);
  assert.match(await card.textContent(), /Cần xác nhận lịch phỏng vấn/);
  await card.locator('.apps-timeline li').nth(2).waitFor();
  await card.locator('button:has-text("Xác nhận tham gia")').click();
  await toast(/Đã xác nhận lịch phỏng vấn/);
  const { data: interview } = await service.from('interviews').select('rsvp').eq('application_id', app.id).single();
  assert.equal(interview.rsvp, 'accepted');
  step('My Applications shows status, CV-viewed badge, timeline; interview accepted');

  // 5. Offer → accept → hired
  const { error: of } = await employer.rpc('send_offer', { p_application: app.id, p_start_date: inDays(10).slice(0, 10), p_expires_at: inDays(5), p_stipend_amount: 6000000, p_terms: 'Thực tập 3 tháng.' });
  if (of) throw of;
  await page.reload(); await ready(page);
  await card.locator('button:has-text("Chấp nhận offer")').click();
  await page.click('dialog .app-primary');
  await toast(/Bạn đã nhận việc/);
  await page.waitForFunction(id => /Đã nhận việc/.test(document.querySelector(`[data-application-id="${id}"]`)?.textContent || ''), app.id);
  step('offer accepted → hired');

  // 6. Withdraw a second application while under review (BR-27)
  const { data: spareApp, error: sa } = await (await clientFor(student.email)).rpc('apply_to_job', { p_job: jobs.spare.id });
  if (sa) throw sa;
  await page.reload(); await ready(page);
  const spare = page.locator(`[data-application-id="${spareApp}"]`);
  await spare.locator('button:has-text("Xem chi tiết")').click();
  await spare.locator('button:has-text("Rút đơn ứng tuyển")').click();
  await page.fill('dialog textarea[name=reason]', 'Đã nhận việc nơi khác');
  await page.click('dialog .app-primary');
  await toast(/Đã rút đơn/);
  await page.waitForFunction(id => /Đã rút đơn/.test(document.querySelector(`[data-application-id="${id}"]`)?.textContent || ''), spareApp);
  step('withdrawal works while under review');

  // 7. Profile: edit, discoverable opt-in, verification request, skill
  await page.goto(`${APP}/pages/profile/`); await ready(page);
  await page.click('main button:has-text("Chỉnh sửa hồ sơ")');
  await page.fill('dialog input[name=headline]', 'Thực tập sinh Kiểm thử');
  await page.fill('dialog input[name=gpa]', '3.4');
  await page.check('dialog input[name=discoverable]');
  await page.click('dialog .app-primary');
  await toast(/Đã lưu hồ sơ/);
  assert.match(await page.textContent('main'), /Thực tập sinh Kiểm thử/);
  await page.click('main section [data-status]');
  await page.click('dialog .app-primary');
  await toast(/Đã gửi yêu cầu xác thực/);
  await page.waitForSelector('main section [data-status="pending"]');
  await page.click('main button:has-text("+ Thêm kỹ năng")');
  await page.fill('dialog input[name=skill]', 'Playwright');
  await page.click('dialog .app-primary');
  await page.waitForFunction(() => /Playwright/.test(document.querySelector('main')?.textContent || ''));
  const { data: sp } = await service.from('student_profiles').select('headline, gpa, is_discoverable, verification_status').eq('user_id', student.id).single();
  assert.deepEqual([sp.headline, Number(sp.gpa), sp.is_discoverable, sp.verification_status], ['Thực tập sinh Kiểm thử', 3.4, true, 'pending']);
  step('profile edited, discoverable, verification requested, skill added');

  // 8. Public CV link
  await page.goto(`${APP}/pages/cv-builder/`); await ready(page);
  await page.check('.cv-toolbar input[type=checkbox]');
  await toast(/công khai/);
  const { data: publicRow } = await service.from('cvs').select('public_slug, is_public').eq('student_id', student.id).single();
  assert.equal(publicRow.is_public, true);
  const guest = await browser.newPage();
  await guest.goto(`${APP}/pages/cv/?slug=${publicRow.public_slug}`); await ready(guest);
  assert.equal((await guest.textContent('#cv-title')).trim(), 'Sinh Viên P6');
  assert.match(await guest.textContent('#a4-cv-sheet'), /kiểm thử phần mềm/);
  await guest.close();
  step('public CV link readable by guests');

  // 9. Job alerts
  await page.goto(`${APP}/pages/applications/?tab=alerts`); await ready(page);
  await page.fill('#alert-name', 'React HCM');
  await page.fill('#alert-keywords', 'react');
  await page.click('#alert-form button[type=submit]');
  await page.waitForSelector('#alert-list li:has-text("React HCM")');
  await page.click('#alert-list li:has-text("React HCM") button:has-text("Xóa")');
  await page.waitForSelector('#alert-list li:has-text("React HCM")', { state: 'detached' });
  step('job alert created and deleted');

  assert.deepEqual(errors, [], 'no uncaught page errors');
  console.log('Apply E2E passed.');
} finally {
  await browser.close();
  await cleanup();
}
