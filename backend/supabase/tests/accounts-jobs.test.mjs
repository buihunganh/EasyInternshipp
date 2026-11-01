// BR-01 … BR-19: accounts, companies, job lifecycle and visibility.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rejects } from './harness.mjs';

let db, admin;
before(async () => {
  db = await createDb();
  admin = await db.makeAdmin('admin@example.com');
});

const profile = id => db.one('select * from public.profiles where id = $1', [id]);

describe('accounts (BR-01 … BR-06)', () => {
  it('BR-01: admin can never be self-assigned at sign-up', async () => {
    const id = await db.createUser({ role: 'admin' });
    assert.equal((await profile(id)).role, 'student');
  });

  it('BR-01: employer and officer roles come from metadata', async () => {
    assert.equal((await profile(await db.createUser({ role: 'employer' }))).role, 'employer');
    const uni = (await db.one(`select id from public.universities where short_name = 'HCMUT'`)).id;
    const officer = await db.createUser({ role: 'university_officer', university_id: uni });
    assert.equal((await profile(officer)).role, 'university_officer');
    assert.ok(await db.one('select 1 from public.university_officers where user_id = $1', [officer]));
  });

  it('BR-02: officers start pending until an admin activates them', async () => {
    const officer = await db.createUser({ role: 'university_officer' });
    assert.equal((await profile(officer)).status, 'pending_verification');
    await db.rpc(admin, 'set_user_status', { p_user: officer, p_status: 'active' });
    assert.equal((await profile(officer)).status, 'active');
  });

  it('BR-03: suspended accounts lose access immediately', async () => {
    const student = await db.studentWithCv();
    await db.rpc(admin, 'set_user_status', { p_user: student, p_status: 'suspended', p_reason: 'spam' });
    await rejects(db.rpc(student, 'request_student_verification'), /chưa được kích hoạt|bị khóa/);
    await rejects(db.q(student, `insert into public.posts (body) values ('hi')`), /row-level security/);
  });

  it('BR-03: suspending needs a reason; admins cannot suspend themselves', async () => {
    const student = await db.createUser();
    await rejects(db.rpc(admin, 'set_user_status', { p_user: student, p_status: 'suspended' }), /lý do/);
    await rejects(db.rpc(admin, 'set_user_status', { p_user: admin, p_status: 'suspended', p_reason: 'x' }), /tự thay đổi/);
  });

  it('BR-04: students are linked to their university by e-mail domain', async () => {
    const id = await db.createUser({ email: 'sv1@hcmut.edu.vn', role: 'student' });
    const row = await db.one(`select u.short_name from public.student_profiles s join public.universities u on u.id = s.university_id where s.user_id = $1`, [id]);
    assert.equal(row.short_name, 'HCMUT');
  });

  it('a duplicate MSSV keeps the account but drops the code', async () => {
    const uni = (await db.one(`select id from public.universities where short_name = 'UIT'`)).id;
    await db.createUser({ role: 'student', university_id: uni, student_code: '20520001' });
    const second = await db.createUser({ role: 'student', university_id: uni, student_code: '20520001' });
    assert.equal((await db.one('select student_code from public.student_profiles where user_id = $1', [second])).student_code, null);
  });

  it('users cannot change their own role or status', async () => {
    const student = await db.createUser();
    await rejects(db.q(student, `update public.profiles set role = 'admin' where id = $1`, [student]), /permission denied/);
    await rejects(db.q(student, `update public.profiles set status = 'active' where id = $1`, [student]), /permission denied/);
  });
});

describe('companies (BR-07 … BR-11)', () => {
  it('only employers create companies', async () => {
    const student = await db.createUser();
    await rejects(db.rpc(student, 'create_company', { p_name: 'Cty A' }), /nhà tuyển dụng/);
  });

  it('BR-07: verification needs a tax code and a GPKD document', async () => {
    const owner = await db.createUser({ role: 'employer' });
    const [{ create_company: company }] = await db.rpc(owner, 'create_company', { p_name: 'Cty Thiếu Giấy' });
    await rejects(db.rpc(owner, 'submit_company_verification', { p_company: company }), /mã số thuế/);
    await db.q(owner, `update public.companies set tax_code = '0312345678' where id = $1`, [company]);
    await rejects(db.rpc(owner, 'submit_company_verification', { p_company: company }), /GPKD/);
  });

  it('BR-08: unverified companies cannot submit jobs', async () => {
    const owner = await db.createUser({ role: 'employer' });
    const [{ create_company: company }] = await db.rpc(owner, 'create_company', { p_name: 'Cty Chưa Duyệt' });
    const [{ id }] = await db.q(owner, `insert into public.jobs (company_id, title, description) values ($1, 'Intern', $2) returning id`, [company, 'x'.repeat(60)]);
    await rejects(db.rpc(owner, 'submit_job', { p_job: id }), /thẩm định/);
  });

  it('BR-09: renaming a verified company resets its verification', async () => {
    const { owner, company } = await db.verifiedCompany(admin);
    await db.q(owner, `update public.companies set name = 'Tên mới' where id = $1`, [company]);
    assert.equal((await db.one('select verification_status from public.companies where id = $1', [company])).verification_status, 'unverified');
  });

  it('BR-10: revoking verification pauses all live jobs', async () => {
    const { owner, company } = await db.verifiedCompany(admin);
    const job = await db.activeJob(admin, owner, company);
    await db.rpc(admin, 'review_company_verification', { p_company: company, p_decision: 'revoked', p_note: 'giấy tờ giả' });
    assert.equal((await db.one('select status from public.jobs where id = $1', [job])).status, 'paused');
  });

  it('BR-11: a company always keeps an owner', async () => {
    const { owner, company } = await db.verifiedCompany(admin);
    await rejects(db.q(owner, 'delete from public.company_members where company_id = $1 and user_id = $2', [company, owner]), /chủ sở hữu/);
  });

  it('managers add team members by e-mail', async () => {
    const { owner, company } = await db.verifiedCompany(admin);
    const recruiter = await db.createUser({ role: 'employer', email: 'hr-team@example.com' });
    await db.rpc(owner, 'add_company_member', { p_company: company, p_email: 'HR-team@example.com' });
    assert.ok(await db.one('select 1 from public.company_members where company_id = $1 and user_id = $2', [company, recruiter]));
    await rejects(db.rpc(recruiter, 'add_company_member', { p_company: company, p_email: 'x@example.com' }), /quản lý/);
  });
});

describe('jobs (BR-12 … BR-19)', () => {
  let owner, company;
  before(async () => ({ owner, company } = await db.verifiedCompany(admin)));

  const draft = async (extra = '') => (await db.q(owner,
    `insert into public.jobs (company_id, title, description${extra ? ', deadline' : ''}) values ($1, 'Intern', $2${extra ? ', $3' : ''}) returning id`,
    extra ? [company, 'Mô tả đủ dài cho tin tuyển dụng thực tập sinh ở công ty.', extra] : [company, 'Mô tả đủ dài cho tin tuyển dụng thực tập sinh ở công ty.']))[0].id;
  const status = async job => (await db.one('select status from public.jobs where id = $1', [job])).status;

  it('BR-12: lifecycle draft → pending → active → paused → active → closed', async () => {
    const job = await draft();
    assert.equal(await status(job), 'draft');
    await db.rpc(owner, 'submit_job', { p_job: job });
    assert.equal(await status(job), 'pending_approval');
    await db.rpc(admin, 'moderate_job', { p_job: job, p_approve: true });
    assert.equal(await status(job), 'active');
    await db.rpc(owner, 'change_job_status', { p_job: job, p_status: 'paused' });
    await db.rpc(owner, 'change_job_status', { p_job: job, p_status: 'active' });
    await db.rpc(owner, 'change_job_status', { p_job: job, p_status: 'closed' });
    assert.equal(await status(job), 'closed');
    await rejects(db.rpc(owner, 'change_job_status', { p_job: job, p_status: 'active' }), /Không thể chuyển/);
  });

  it('BR-12: recruiters cannot write status directly', async () => {
    const job = await draft();
    await rejects(db.q(owner, `update public.jobs set status = 'active' where id = $1`, [job]), /permission denied/);
  });

  it('BR-13: rejecting needs a reason and notifies the company', async () => {
    const job = await draft();
    await db.rpc(owner, 'submit_job', { p_job: job });
    await rejects(db.rpc(admin, 'moderate_job', { p_job: job, p_approve: false }), /lý do/);
    await db.rpc(admin, 'moderate_job', { p_job: job, p_approve: false, p_reason: 'Thiếu phụ cấp' });
    assert.equal((await db.one('select rejection_reason from public.jobs where id = $1', [job])).rejection_reason, 'Thiếu phụ cấp');
    assert.ok(await db.one(`select 1 from public.notifications where user_id = $1 and type = 'job_moderated' and body = 'Thiếu phụ cấp'`, [owner]));
  });

  it('only admins moderate', async () => {
    const job = await draft();
    await db.rpc(owner, 'submit_job', { p_job: job });
    await rejects(db.rpc(owner, 'moderate_job', { p_job: job, p_approve: true }), /quản trị viên/);
  });

  it('BR-14: description ≥ 50 characters and a future deadline at submission', async () => {
    const [{ id: short }] = await db.q(owner, `insert into public.jobs (company_id, title, description) values ($1, 'Intern', 'ngắn') returning id`, [company]);
    await rejects(db.rpc(owner, 'submit_job', { p_job: short }), /quá ngắn/);
    const past = await draft(new Date(Date.now() - 86400000).toISOString());
    await rejects(db.rpc(owner, 'submit_job', { p_job: past }), /tương lai/);
  });

  it('BR-15: no deadline → 30 days from approval', async () => {
    const job = await draft();
    await db.rpc(owner, 'submit_job', { p_job: job });
    await db.rpc(admin, 'moderate_job', { p_job: job, p_approve: true });
    const { days } = await db.one(`select round(extract(epoch from deadline - now()) / 86400)::int days from public.jobs where id = $1`, [job]);
    assert.equal(days, 30);
  });

  it('BR-16: material edits to a live job send it back to moderation', async () => {
    const job = await db.activeJob(admin, owner, company);
    await db.q(owner, `update public.jobs set city = 'Hà Nội' where id = $1`, [job]);
    assert.equal(await status(job), 'active', 'non-material edit keeps it live');
    await db.q(owner, `update public.jobs set title = 'Intern (mới)' where id = $1`, [job]);
    assert.equal(await status(job), 'pending_approval');
  });

  it('BR-17: exclusive jobs are visible only to verified students of that university after approval', async () => {
    const uni = (await db.one(`select id from public.universities where short_name = 'HUST'`)).id;
    const officer = await db.createUser({ role: 'university_officer', university_id: uni });
    await db.rpc(admin, 'set_user_status', { p_user: officer, p_status: 'active' });
    const job = await db.activeJob(admin, owner, company, { university_id: uni });
    const verified = await db.createUser({ email: 'a@hust.edu.vn', student_code: 'HUST1' });
    const other = await db.createUser({ email: 'b@uit.edu.vn' });
    await db.rpc(verified, 'request_student_verification');
    await db.rpc(officer, 'verify_student', { p_student: verified, p_approve: true });

    const sees = async user => (await db.q(user, 'select id from public.jobs where id = $1', [job])).length === 1;
    assert.equal(await sees(verified), false, 'hidden before university approval');
    await db.rpc(officer, 'review_exclusive_job', { p_job: job, p_approve: true });
    assert.equal(await sees(verified), true);
    assert.equal(await sees(other), false);
    assert.equal(await sees(null), false, 'guests never see exclusive jobs');
  });

  it('BR-18: guests see only active, unexpired jobs', async () => {
    const hidden = await draft();
    const live = await db.activeJob(admin, owner, company);
    const ids = (await db.q(null, 'select id from public.jobs')).map(r => r.id);
    assert.ok(ids.includes(live));
    assert.ok(!ids.includes(hidden));
    const found = (await db.rpc(null, 'search_jobs', { p_query: 'Frontend' })).map(r => r.id);
    assert.ok(found.includes(live));
  });

  it('BR-19: jobs past their deadline expire', async () => {
    const job = await db.activeJob(admin, owner, company);
    await db.sql(`update public.jobs set deadline = now() - interval '1 minute' where id = $1`, [job]);
    await db.sql('select private.expire_jobs()');
    assert.equal(await status(job), 'expired');
  });

  it('search_jobs filters by city and stipend and reports total_count', async () => {
    await db.activeJob(admin, owner, company, { title: 'Thực tập Data Đà Nẵng', city: 'Đà Nẵng', stipend_min: 5000000, stipend_max: 9000000 });
    const rows = await db.rpc(null, 'search_jobs', { p_city: 'da nang', p_min_stipend: 8000000 });
    assert.ok(rows.length >= 1);
    assert.ok(rows.every(r => /Đà Nẵng/.test(r.city)));
    assert.equal(Number(rows[0].total_count), rows.length);
  });

  it('record_job_view counts once per 30 minutes per user', async () => {
    const job = await db.activeJob(admin, owner, company);
    const student = await db.createUser();
    await db.rpc(student, 'record_job_view', { p_job: job });
    await db.rpc(student, 'record_job_view', { p_job: job });
    await db.rpc(null, 'record_job_view', { p_job: job });
    assert.equal((await db.one('select view_count from public.jobs where id = $1', [job])).view_count, 2);
  });
});
