// Migration 09 (IMPLEMENTATION_PLAN §5.1): job extras, company profile, talent search, duplicate, interviews.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rejects } from './harness.mjs';

let db, admin, owner, company;
before(async () => {
  db = await createDb();
  admin = await db.makeAdmin('admin@example.com');
  ({ owner, company } = await db.verifiedCompany(admin));
});

const future = (days = 2) => new Date(Date.now() + days * 86400000).toISOString();
const skillId = async name => (await db.one('select id from public.skills where name = $1', [name])).id;

describe('job extras', () => {
  it('recruiters set department, target years/majors and perks', async () => {
    const [{ id }] = await db.q(owner, `insert into public.jobs (company_id, title, description, department, target_study_years, target_majors, perks)
      values ($1, 'Intern', $2, 'Engineering', '{3,4}', '{"Khoa học Máy tính"}', '{"Laptop","Mentor 1-1"}') returning *`, [company, 'x'.repeat(60)]);
    const row = await db.one('select department, target_study_years, perks from public.jobs where id = $1', [id]);
    assert.equal(row.department, 'Engineering');
    assert.deepEqual(row.target_study_years, [3, 4]);
    assert.deepEqual(row.perks, ['Laptop', 'Mentor 1-1']);
  });

  it('rejects study years outside 1–6', async () => {
    await rejects(db.q(owner, `insert into public.jobs (company_id, title, target_study_years) values ($1, 'Intern', '{9}')`, [company]), /check constraint/);
  });
});

describe('company profile', () => {
  it('managers edit the profile JSON; others cannot', async () => {
    await db.q(owner, `update public.companies set profile = '{"office":"Quận 7","mentors":[{"name":"Lan"}]}' where id = $1`, [company]);
    assert.equal((await db.q(null, 'select profile from public.companies where id = $1', [company]))[0].profile.office, 'Quận 7');
    const stranger = await db.createUser({ role: 'employer' });
    await db.q(stranger, `update public.companies set profile = '{"office":"hack"}' where id = $1`, [company]);
    assert.equal((await db.one('select profile from public.companies where id = $1', [company])).profile.office, 'Quận 7');
  });
});

describe('application_match_scores', () => {
  it('scores applicants by skill overlap, company members only', async () => {
    const job = await db.activeJob(admin, owner, company);
    await db.q(owner, 'insert into public.job_skills (job_id, skill_id, is_required) values ($1, $2, true), ($1, $3, false)',
      [job, await skillId('React'), await skillId('Figma')]);
    const strong = await db.studentWithCv();
    await db.q(strong, 'insert into public.student_skills (skill_id) values ($1)', [await skillId('React')]);
    const weak = await db.studentWithCv();
    const [{ apply_to_job: a1 }] = await db.rpc(strong, 'apply_to_job', { p_job: job });
    const [{ apply_to_job: a2 }] = await db.rpc(weak, 'apply_to_job', { p_job: job });
    const scores = Object.fromEntries((await db.rpc(owner, 'application_match_scores', { p_job: job })).map(r => [r.application_id, r.match_score]));
    assert.equal(scores[a1], 67);
    assert.equal(scores[a2], 0);
    await rejects(db.rpc(strong, 'application_match_scores', { p_job: job }), /không có quyền/);
  });
});

describe('search_candidates (D7)', () => {
  it('finds only discoverable students and only for verified companies', async () => {
    const open = await db.createUser({ full_name: 'Trần Mở', email: 'mo@hcmut.edu.vn' });
    await db.q(open, `update public.student_profiles set is_discoverable = true, major = 'Khoa học Máy tính', city = 'TP. Hồ Chí Minh' where user_id = $1`, [open]);
    await db.q(open, 'insert into public.student_skills (skill_id) values ($1)', [await skillId('Python')]);
    const hidden = await db.createUser({ full_name: 'Trần Ẩn' });

    const rows = await db.rpc(owner, 'search_candidates', { p_query: 'khoa hoc may tinh' });
    const ids = rows.map(r => r.user_id);
    assert.ok(ids.includes(open));
    assert.ok(!ids.includes(hidden));
    assert.ok(!('email' in rows[0]), 'no contact details');

    const bySkill = await db.rpc(owner, 'search_candidates', { p_skill_ids: [await skillId('Python')] });
    assert.deepEqual(bySkill.map(r => r.user_id), [open]);

    const unverified = await db.createUser({ role: 'employer' });
    await db.rpc(unverified, 'create_company', { p_name: 'Cty Chưa XT' });
    await rejects(db.rpc(unverified, 'search_candidates'), /đã xác thực/);
    await rejects(db.rpc(open, 'search_candidates'), /đã xác thực/);
  });
});

describe('duplicate_job', () => {
  it('copies the job, skills, questions and answer keys into a new draft', async () => {
    const job = await db.activeJob(admin, owner, company, { perks: ['Laptop'] });
    await db.q(owner, 'insert into public.job_skills (job_id, skill_id) values ($1, $2)', [job, await skillId('SQL')]);
    const [{ id: q }] = await db.q(owner, `insert into public.screening_questions (job_id, question, is_knockout) values ($1, 'Đi làm ngay?', true) returning id`, [job]);
    await db.q(owner, `insert into public.screening_question_keys (question_id, ideal_answer) values ($1, 'yes')`, [q]);

    const [{ duplicate_job: copy }] = await db.rpc(owner, 'duplicate_job', { p_job: job });
    const row = await db.one('select title, status, perks, view_count from public.jobs where id = $1', [copy]);
    assert.equal(row.status, 'draft');
    assert.match(row.title, /\(bản sao\)$/);
    assert.deepEqual(row.perks, ['Laptop']);
    assert.equal(row.view_count, 0);
    assert.equal((await db.sql('select * from public.job_skills where job_id = $1', [copy])).length, 1);
    const keys = await db.sql('select k.ideal_answer from public.screening_questions q join public.screening_question_keys k on k.question_id = q.id where q.job_id = $1', [copy]);
    assert.deepEqual(keys.map(k => k.ideal_answer), ['yes']);
    assert.equal((await db.sql('select * from public.pipeline_stages where job_id = $1', [copy])).length, 5);

    await rejects(db.rpc(await db.createUser({ role: 'employer' }), 'duplicate_job', { p_job: job }), /không thuộc công ty/);
  });
});

describe('company_interviews', () => {
  it('lists the company\'s interviews in a window, not other companies\'', async () => {
    const job = await db.activeJob(admin, owner, company);
    const student = await db.studentWithCv({ full_name: 'Lê Phỏng Vấn' });
    const [{ apply_to_job: app }] = await db.rpc(student, 'apply_to_job', { p_job: job });
    const when = future(1);
    await db.rpc(owner, 'schedule_interview', { p_application: app, p_scheduled_at: when, p_meeting_url: 'https://meet' });

    const rows = await db.rpc(owner, 'company_interviews', { p_from: future(0), p_to: future(3) });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].candidate_name, 'Lê Phỏng Vấn');
    assert.equal((await db.rpc(owner, 'company_interviews', {})).length, 0, 'default window is today');

    const other = await db.verifiedCompany(admin);
    assert.equal((await db.rpc(other.owner, 'company_interviews', { p_from: future(0), p_to: future(3) })).length, 0);
    await rejects(db.rpc(null, 'company_interviews', {}), /permission denied|đăng nhập/);
  });
});
