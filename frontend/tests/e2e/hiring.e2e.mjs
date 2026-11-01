// Phases 7–8 against real data, with throwaway accounts only: candidate board → CV viewed (BR-25) → stage move →
// interview (local default time, invite card in chat, BR-33) → scorecard → offer → employer chat message and file →
// conversation mute → student sees the thread, accepts the interview from the card, replies →
// notifications page → student accepts the offer on My Applications.
// Needs `npm run dev` and SUPABASE_SERVICE_ROLE_KEY. Run: node frontend/tests/e2e/hiring.e2e.mjs
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { APP, DEMO_PASSWORD, cleanup, clientFor, createUser, demo, login, logout, ready, service, trackErrors } from './helpers.mjs';

const inDays = d => new Date(Date.now() + d * 86400000).toISOString();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);
const errors = trackErrors(page);
const step = name => console.log(`  ✓ ${name}`);
const settle = (fn, timeout = 10000) => (async () => {   // poll the database until fn() returns truthy
  const end = Date.now() + timeout;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) return v; await new Promise(r => setTimeout(r, 300)); }
})();
const board = () => page.locator('.candidate-board');
const openCandidate = async () => {
  await board().getByText('Ứng Viên Hiring').first().click();
  await page.waitForSelector('#candidateDrawer:not(.hidden)');
};

try {
  // A verified company with one live job, and a student with a CV who applied to it
  const owner = await createUser({ role: 'employer', full_name: 'NTD Hiring' });
  const employer = await clientFor(owner.email);
  const { data: companyId, error: ce } = await employer.rpc('create_company', { p_name: `Công ty Hiring ${Date.now() % 1e6}`, p_city: 'TP. Hồ Chí Minh' });
  assert.ifError(ce);
  await service.from('companies').update({ verification_status: 'verified' }).eq('id', companyId);
  const { data: job, error: je } = await employer.from('jobs').insert({ company_id: companyId, title: `Hiring Intern ${Date.now() % 1e5}`, description: 'Mô tả công việc kiểm thử luồng tuyển dụng đầy đủ trên Internships.io.', deadline: inDays(20) }).select('id').single();
  assert.ifError(je);
  assert.ifError((await employer.rpc('submit_job', { p_job: job.id })).error);
  assert.ifError((await (await clientFor(demo('admin'))).rpc('moderate_job', { p_job: job.id, p_approve: true })).error);
  const student = await createUser({ role: 'student', full_name: 'Ứng Viên Hiring' });
  const sc = await clientFor(student.email);
  assert.ifError((await sc.from('cvs').insert({ title: 'CV', is_default: true, content: { version: 1, personal: { name: 'Ứng Viên Hiring' } } })).error);
  const { data: appId, error: ae } = await sc.rpc('apply_to_job', { p_job: job.id });
  assert.ifError(ae);
  const app = async () => (await service.from('applications').select('status, viewed_at, score, stage_id').eq('id', appId).single()).data;
  const { data: stages } = await service.from('pipeline_stages').select('id, name, position').eq('job_id', job.id).order('position');

  // --- Employer: candidate board ------------------------------------------------------------
  await login(page, owner.email, DEMO_PASSWORD);
  await page.goto(`${APP}/pages/candidates/?job=${job.id}`); await ready(page);
  await board().getByText('Ứng Viên Hiring').first().waitFor();
  step('candidate board lists the applicant (design sample filters are cleared)');

  await openCandidate();
  assert.ok((await settle(async () => (await app()).viewed_at)), 'viewed_at not set');
  assert.equal((await app()).status, 'cv_viewed');
  step('opening the applicant marks the CV viewed (BR-25)');

  await page.keyboard.press('Escape');
  await board().getByRole('button', { name: 'Chuyển vòng', exact: true }).first().click();
  await page.locator('dialog[open] select[name=stage_id]').selectOption(stages[1].id);
  await page.click('dialog[open] .app-primary');
  assert.equal(await settle(async () => (await app()).stage_id === stages[1].id), true, 'stage not moved');
  await page.waitForFunction(id => document.querySelector(`.candidate-board [data-stage-id="${id}"]`)?.textContent?.includes('Ứng Viên Hiring'), stages[1].id);
  step(`stage move to "${stages[1].name}" is saved and re-rendered`);

  await openCandidate();
  await page.locator('#candidateDrawer button', { hasText: /Xếp lịch phỏng vấn/ }).first().click();
  const shown = new Date(await page.inputValue('dialog[open] input[name=scheduled_at]'));   // datetime-local = local time
  assert.equal(`${shown.getHours()}:${shown.getMinutes()}`, '9:30', 'default interview time is not 09:30 local');
  await page.click('dialog[open] .app-primary');
  const interview = await settle(async () => (await service.from('interviews').select('id, rsvp').eq('application_id', appId).maybeSingle()).data);
  assert.ok(interview, 'interview not saved');
  assert.equal((await app()).status, 'interviewing');
  const { data: conv } = await service.from('conversations').select('id').eq('company_id', companyId).single();
  const { data: invite } = await service.from('messages').select('kind').eq('conversation_id', conv.id).eq('kind', 'interview_invite');
  assert.equal(invite.length, 1, 'no interview invite card in the chat');
  step('interview scheduled at the local default time, invite card posted in the chat (BR-33)');

  await page.keyboard.press('Escape');
  await board().getByRole('button', { name: 'Đánh giá', exact: true }).first().click();
  await page.fill('dialog[open] input[name=score]', '82');
  await page.fill('dialog[open] textarea[name=comment]', 'Ứng viên nắm vững kiến thức nền tảng.');
  await page.click('dialog[open] .app-primary');
  assert.equal(await settle(async () => (await app()).score === 82), true, 'score not updated');
  const { data: evals } = await service.from('evaluations').select('evaluator_id, criteria').eq('application_id', appId);
  assert.equal(evals.length, 1); assert.equal(evals[0].evaluator_id, owner.id);
  step('scorecard saved (evaluator from auth.uid()) and the score updated');

  await openCandidate();
  await page.locator('#makeOfferBtn').click();
  await page.waitForSelector('dialog[open] input[name=start_date]');
  await page.click('dialog[open] .app-primary');
  assert.ok(await settle(async () => (await service.from('offers').select('id').eq('application_id', appId)).data?.length), 'offer not saved');
  assert.equal((await app()).status, 'offered');
  step('offer sent from the drawer');

  // --- Employer: messages -------------------------------------------------------------------
  await page.goto(`${APP}/pages/messages/?workspace=employer&conversation=${conv.id}`); await ready(page);
  const input = page.locator('input[placeholder^="Nhập tin nhắn"]').first();
  await input.fill('Chào bạn, mời bạn xác nhận lịch phỏng vấn.');
  await input.press('Enter');
  const sent = await settle(async () => (await service.from('messages').select('sender_id').eq('conversation_id', conv.id).eq('body', 'Chào bạn, mời bạn xác nhận lịch phỏng vấn.')).data?.[0]);
  assert.equal(sent?.sender_id, owner.id, 'employer message not saved');
  await page.locator('main p', { hasText: 'Chào bạn, mời bạn xác nhận lịch phỏng vấn.' }).first().waitFor();
  step('employer chat message saved (sender from auth.uid()) and shown');

  await page.locator('main button:has(.material-symbols-outlined:text-is("attach_file"))').first().click();
  await page.setInputFiles('dialog[open] input[type=file]', { name: 'jd.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 hiring e2e') });
  await page.click('dialog[open] .app-primary');
  const file = await settle(async () => (await service.from('messages').select('attachment_path').eq('conversation_id', conv.id).eq('kind', 'file')).data?.[0]);
  assert.ok(file?.attachment_path, 'file message not saved');
  step('file attachment uploaded and posted');

  await page.getByRole('button', { name: 'Tùy chọn cuộc trò chuyện' }).click();
  await page.getByRole('menuitem', { name: 'Tắt thông báo cuộc trò chuyện' }).click();
  await page.waitForFunction(() => /Đã tắt thông báo/.test(document.getElementById('conversation-status')?.textContent || ''));
  await page.reload(); await ready(page);
  assert.match(await page.locator('#conversation-status').textContent(), /Đã tắt thông báo/);
  step('conversation mute is saved per participant');

  // --- Student side -------------------------------------------------------------------------
  await logout(page);
  await login(page, student.email, DEMO_PASSWORD);
  await page.goto(`${APP}/pages/messages/?conversation=${conv.id}`); await ready(page);
  await page.locator('main p', { hasText: 'Chào bạn, mời bạn xác nhận lịch phỏng vấn.' }).first().waitFor();
  assert.doesNotMatch(await page.locator('#conversation-status').textContent(), /Đã tắt thông báo/, 'mute leaked to the other participant');
  step('student sees the thread; the employer\'s mute does not apply to them');

  await page.locator('main button', { hasText: 'Đồng ý tham dự' }).first().click();
  assert.equal(await settle(async () => (await service.from('interviews').select('rsvp').eq('id', interview.id).single()).data.rsvp === 'accepted'), true, 'rsvp not accepted');
  step('student accepts the interview from the chat card');

  await page.locator('input[placeholder^="Nhập tin nhắn"]').first().fill('Dạ em cảm ơn anh chị ạ.');
  await page.locator('input[placeholder^="Nhập tin nhắn"]').first().press('Enter');
  const reply = await settle(async () => (await service.from('messages').select('sender_id').eq('conversation_id', conv.id).eq('body', 'Dạ em cảm ơn anh chị ạ.')).data?.[0]);
  assert.equal(reply?.sender_id, student.id, 'student reply not saved');
  step('student reply saved');

  await page.goto(`${APP}/pages/notifications/`); await ready(page);
  await page.waitForFunction(() => /phỏng vấn/i.test(document.querySelector('main')?.textContent || ''));
  step('notifications page lists the workflow notifications');

  await page.goto(`${APP}/pages/applications/?id=${appId}`); await ready(page);
  await page.locator(`[data-application-id="${appId}"] button:has-text("Chấp nhận offer")`).click();
  await page.click('dialog[open] .app-primary');
  assert.equal(await settle(async () => (await app()).status === 'hired'), true, 'not hired');
  step('student accepts the offer → hired');

  assert.deepEqual(errors, [], 'browser runtime errors');
  console.log('Hiring E2E passed.');
} finally {
  await browser.close();
  await cleanup();
}
