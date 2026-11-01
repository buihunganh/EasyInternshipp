// BR-20 … BR-31: applying, the application state machine, interviews, scorecards, offers.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rejects } from './harness.mjs';

let db, admin, owner, company;
before(async () => {
  db = await createDb();
  admin = await db.makeAdmin('admin@example.com');
  ({ owner, company } = await db.verifiedCompany(admin));
});

const appStatus = async id => (await db.one('select status from public.applications where id = $1', [id])).status;
const future = (days = 2) => new Date(Date.now() + days * 86400000).toISOString();
const today = (days = 0) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

async function apply(student, job, args = {}) {
  const [{ apply_to_job: id }] = await db.rpc(student, 'apply_to_job', { p_job: job, ...args });
  return id;
}

/** Job with one required knockout yes/no question (ideal answer "yes") and one optional text question. */
async function jobWithQuestions() {
  const job = await db.activeJob(admin, owner, company);
  const [{ id: knockout }] = await db.q(owner, `insert into public.screening_questions (job_id, position, question, kind, is_required, is_knockout)
    values ($1, 0, 'Bạn làm full-time được không?', 'yes_no', true, true) returning id`, [job]);
  await db.q(owner, `insert into public.screening_question_keys (question_id, ideal_answer) values ($1, 'yes')`, [knockout]);
  const [{ id: text }] = await db.q(owner, `insert into public.screening_questions (job_id, position, question, kind, is_required)
    values ($1, 1, 'Giới thiệu ngắn', 'short_text', false) returning id`, [job]);
  return { job, knockout, text };
}

describe('applying (BR-20 … BR-23, BR-27)', () => {
  it('BR-20: only students apply, and only to active jobs', async () => {
    const job = await db.activeJob(admin, owner, company);
    await rejects(db.rpc(owner, 'apply_to_job', { p_job: job }), /sinh viên/);
    await rejects(db.rpc(null, 'apply_to_job', { p_job: job }), /đăng nhập/);
    const [{ id: draft }] = await db.q(owner, `insert into public.jobs (company_id, title, description) values ($1, 'Draft', $2) returning id`, [company, 'x'.repeat(60)]);
    await rejects(db.rpc(await db.studentWithCv(), 'apply_to_job', { p_job: draft }), /không còn nhận/);
  });

  it('BR-21: one application per student per job', async () => {
    const job = await db.activeJob(admin, owner, company);
    const student = await db.studentWithCv();
    await apply(student, job);
    await rejects(db.rpc(student, 'apply_to_job', { p_job: job }), /đã nộp đơn/);
  });

  it('BR-22: a CV is required and its content is frozen at submission', async () => {
    const job = await db.activeJob(admin, owner, company);
    const noCv = await db.createUser();
    await rejects(db.rpc(noCv, 'apply_to_job', { p_job: job }), /tạo hoặc tải lên CV/);
    const student = await db.studentWithCv();
    const app = await apply(student, job);
    await db.q(student, `update public.cvs set content = '{"summary":"changed"}' where student_id = $1`, [student]);
    assert.equal((await db.one('select cv_snapshot from public.applications where id = $1', [app])).cv_snapshot.summary, 'hi');
  });

  it('BR-23: required answers, knockout grading, hidden answer keys', async () => {
    const { job, knockout, text } = await jobWithQuestions();
    const student = await db.studentWithCv();
    await rejects(db.rpc(student, 'apply_to_job', { p_job: job }), /Vui lòng trả lời/);
    const app = await apply(student, job, { p_answers: [{ question_id: knockout, answer: 'no' }, { question_id: text, answer: 'Xin chào' }] });
    assert.equal((await db.one('select knockout_passed from public.applications where id = $1', [app])).knockout_passed, false);
    assert.equal((await db.q(student, 'select * from public.screening_question_keys')).length, 0, 'students never see answer keys');
    assert.equal((await db.q(null, 'select * from public.screening_question_keys').catch(() => [])).length, 0);
    const passer = await db.studentWithCv();
    const ok = await apply(passer, job, { p_answers: [{ question_id: knockout, answer: 'YES' }] });
    assert.equal((await db.one('select knockout_passed from public.applications where id = $1', [ok])).knockout_passed, true);
  });

  it('BR-27: withdrawal works while under review, not after an offer', async () => {
    const job = await db.activeJob(admin, owner, company);
    const a = await db.studentWithCv();
    const appA = await apply(a, job);
    await db.rpc(a, 'withdraw_application', { p_application: appA, p_reason: 'Đã có việc' });
    assert.equal(await appStatus(appA), 'withdrawn');

    const b = await db.studentWithCv();
    const appB = await apply(b, job);
    await db.rpc(owner, 'update_application_status', { p_application: appB, p_status: 'shortlisted' });
    await db.rpc(owner, 'send_offer', { p_application: appB, p_start_date: today(7), p_expires_at: future(5) });
    await rejects(db.rpc(b, 'withdraw_application', { p_application: appB }), /Không thể chuyển/);
  });

  it('other students cannot see or withdraw someone else\'s application', async () => {
    const job = await db.activeJob(admin, owner, company);
    const a = await db.studentWithCv();
    const app = await apply(a, job);
    const other = await db.studentWithCv();
    assert.equal((await db.q(other, 'select id from public.applications where id = $1', [app])).length, 0);
    await rejects(db.rpc(other, 'withdraw_application', { p_application: app }), /Không tìm thấy/);
  });

  it('applications notify the company and bump application_count', async () => {
    const job = await db.activeJob(admin, owner, company);
    await apply(await db.studentWithCv(), job);
    assert.equal((await db.one('select application_count from public.jobs where id = $1', [job])).application_count, 1);
    assert.ok(await db.one(`select 1 from public.notifications where user_id = $1 and type = 'application_received' and data ->> 'job_id' = $2`, [owner, job]));
  });
});

describe('pipeline (BR-24 … BR-31)', () => {
  let job;
  before(async () => { job = await db.activeJob(admin, owner, company); });

  it('BR-24: terminal states are final', async () => {
    const student = await db.studentWithCv();
    const app = await apply(student, job);
    await db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'rejected', p_note: 'Chưa phù hợp' });
    await rejects(db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'shortlisted' }), /Không thể chuyển/);
  });

  it('BR-25: the first employer view sets cv_viewed and notifies the student', async () => {
    const student = await db.studentWithCv();
    const app = await apply(student, job);
    await db.rpc(owner, 'mark_application_viewed', { p_application: app });
    assert.equal(await appStatus(app), 'cv_viewed');
    assert.ok(await db.one(`select viewed_at from public.applications where id = $1 and viewed_at is not null`, [app]));
    assert.ok(await db.one(`select 1 from public.notifications where user_id = $1 and type = 'cv_viewed'`, [student]));
    const outsider = await db.createUser({ role: 'employer' });
    await rejects(db.rpc(outsider, 'mark_application_viewed', { p_application: app }), /không có quyền/);
  });

  it('BR-26: rejection needs a reason, shown to the candidate', async () => {
    const student = await db.studentWithCv();
    const app = await apply(student, job);
    await rejects(db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'rejected' }), /lý do/);
    await db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'rejected', p_note: 'Thiếu kinh nghiệm React' });
    assert.equal((await db.q(student, 'select rejection_reason from public.applications where id = $1', [app]))[0].rejection_reason, 'Thiếu kinh nghiệm React');
    const history = await db.q(student, 'select to_status, note from public.application_status_history where application_id = $1 order by id', [app]);
    assert.deepEqual(history.map(h => h.to_status), ['applied', 'rejected']);
  });

  it('BR-28: interview rules and RSVP', async () => {
    const student = await db.studentWithCv();
    const app = await apply(student, job);
    await rejects(db.rpc(owner, 'schedule_interview', { p_application: app, p_scheduled_at: new Date(Date.now() - 1000).toISOString(), p_meeting_url: 'https://meet' }), /tương lai/);
    await rejects(db.rpc(owner, 'schedule_interview', { p_application: app, p_scheduled_at: future() }), /link phòng họp/);
    await rejects(db.rpc(owner, 'schedule_interview', { p_application: app, p_scheduled_at: future(), p_mode: 'onsite' }), /địa điểm/);
    const [{ schedule_interview: interview }] = await db.rpc(owner, 'schedule_interview', { p_application: app, p_scheduled_at: future(), p_meeting_url: 'https://meet.google.com/x' });
    assert.equal(await appStatus(app), 'interviewing');
    await rejects(db.rpc(student, 'respond_interview', { p_interview: interview, p_rsvp: 'reschedule_requested' }), /đề xuất thời gian/);
    await db.rpc(student, 'respond_interview', { p_interview: interview, p_rsvp: 'accepted' });
    assert.equal((await db.one('select rsvp from public.interviews where id = $1', [interview])).rsvp, 'accepted');
  });

  it('BR-29 / BR-31: scorecards, one open offer, accept → hired', async () => {
    const student = await db.studentWithCv();
    const app = await apply(student, job);
    await rejects(db.rpc(owner, 'send_offer', { p_application: app, p_start_date: today(7), p_expires_at: future(5) }), /sàng lọc hoặc phỏng vấn/);
    await db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'shortlisted' });

    await db.q(owner, `insert into public.evaluations (application_id, score, criteria) values ($1, 80, '{"technical":80}')`, [app]);
    const email = `teammate-${Date.now()}@example.com`;
    const teammate = await db.createUser({ role: 'employer', email });
    await db.rpc(owner, 'add_company_member', { p_company: company, p_email: email });
    await db.q(teammate, `insert into public.evaluations (application_id, score) values ($1, 91)`, [app]);
    assert.equal((await db.one('select score from public.applications where id = $1', [app])).score, 86, 'score is the average');
    assert.equal((await db.q(student, 'select * from public.evaluations where application_id = $1', [app])).length, 0, 'BR-31: private to the company');

    const [{ send_offer: offer }] = await db.rpc(owner, 'send_offer', { p_application: app, p_start_date: today(7), p_expires_at: future(5), p_stipend_amount: 6000000 });
    await rejects(db.rpc(owner, 'send_offer', { p_application: app, p_start_date: today(7), p_expires_at: future(5) }), /sàng lọc hoặc phỏng vấn|duplicate/);
    await rejects(db.rpc(student, 'respond_offer', { p_offer: offer, p_accept: false }), /lý do/);
    await db.rpc(student, 'respond_offer', { p_offer: offer, p_accept: true });
    assert.equal(await appStatus(app), 'hired');
    assert.ok(await db.one(`select hired_at from public.applications where id = $1 and hired_at is not null`, [app]));
  });

  it('withdrawing an offer rejects the application with the reason', async () => {
    const student = await db.studentWithCv();
    const app = await apply(student, job);
    await db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'shortlisted' });
    const [{ send_offer: offer }] = await db.rpc(owner, 'send_offer', { p_application: app, p_start_date: today(7), p_expires_at: future(5) });
    await rejects(db.rpc(owner, 'withdraw_offer', { p_offer: offer, p_reason: ' ' }), /lý do/);
    await db.rpc(owner, 'withdraw_offer', { p_offer: offer, p_reason: 'Đã đủ người' });
    assert.equal(await appStatus(app), 'rejected');
  });

  it('BR-30: an unanswered offer past expires_at becomes offer_declined', async () => {
    const student = await db.studentWithCv();
    const app = await apply(student, job);
    await db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'shortlisted' });
    const [{ send_offer: offer }] = await db.rpc(owner, 'send_offer', { p_application: app, p_start_date: today(7), p_expires_at: future(5) });
    await db.sql(`update public.offers set expires_at = now() - interval '1 minute' where id = $1`, [offer]);
    await db.sql('select private.expire_offers()');
    assert.equal(await appStatus(app), 'offer_declined');
    assert.equal((await db.one('select status from public.offers where id = $1', [offer])).status, 'expired');
  });

  it('pipeline stages: a new job gets 5 columns, applications start in the first', async () => {
    const stages = await db.q(owner, 'select id, name from public.pipeline_stages where job_id = $1 order by position', [job]);
    assert.equal(stages.length, 5);
    const app = await apply(await db.studentWithCv(), job);
    assert.equal((await db.one('select stage_id from public.applications where id = $1', [app])).stage_id, stages[0].id);
    await db.rpc(owner, 'move_application_stage', { p_application: app, p_stage: stages[2].id });
    assert.equal((await db.one('select stage_id from public.applications where id = $1', [app])).stage_id, stages[2].id);
  });
});
