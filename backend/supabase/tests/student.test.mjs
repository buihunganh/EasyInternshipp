// Phase 6 (student side): profile edits, CVs (default, public link), My Applications reads,
// interview / offer responses, job alerts, notification links (migration 11).
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rejects } from './harness.mjs';

let db, admin, owner, company, job;
const future = (days = 2) => new Date(Date.now() + days * 86400000).toISOString();
const today = (days = 0) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
before(async () => {
  db = await createDb();
  admin = await db.makeAdmin('admin@example.com');
  ({ owner, company } = await db.verifiedCompany(admin));
  job = await db.activeJob(admin, owner, company);
});

describe('profile', () => {
  it('students edit their own profile fields, including the discoverable opt-in', async () => {
    const student = await db.createUser({ full_name: 'Cũ' });
    await db.q(student, `update public.profiles set full_name = 'Mới', phone = '0912345678' where id = $1`, [student]);
    await db.q(student, `update public.student_profiles set headline = 'Frontend', gpa = 3.5, is_discoverable = true, links = '{"github":"gh"}' where user_id = $1`, [student]);
    const row = await db.one('select p.full_name, s.headline, s.is_discoverable from public.profiles p join public.student_profiles s on s.user_id = p.id where p.id = $1', [student]);
    assert.deepEqual([row.full_name, row.headline, row.is_discoverable], ['Mới', 'Frontend', true]);
  });

  it('students cannot verify themselves or edit others', async () => {
    const student = await db.createUser();
    await rejects(db.q(student, `update public.student_profiles set verification_status = 'verified' where user_id = $1`, [student]), /permission denied/);
    const other = await db.createUser();
    await db.q(student, `update public.student_profiles set headline = 'hack' where user_id = $1`, [other]);
    assert.equal((await db.one('select headline from public.student_profiles where user_id = $1', [other])).headline, null);
  });

  it('students manage their own skills', async () => {
    const student = await db.createUser();
    const [{ ensure_skill: id }] = await db.rpc(student, 'ensure_skill', { p_name: 'Svelte' });
    await db.q(student, 'insert into public.student_skills (skill_id, level) values ($1, 3)', [id]);
    assert.equal((await db.q(student, 'select * from public.student_skills where student_id = $1', [student])).length, 1);
  });

  it('avatars go to the owner\'s folder only', async () => {
    const student = await db.createUser(), other = await db.createUser();
    await db.q(student, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${student}/a.png`]);
    await rejects(db.q(other, `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${student}/b.png`]), /row-level security/);
  });
});

describe('CVs', () => {
  it('only one default CV per student', async () => {
    const student = await db.createUser();
    const [{ id: a }] = await db.q(student, `insert into public.cvs (title, is_default) values ('A', true) returning id`);
    await db.q(student, `insert into public.cvs (title, is_default) values ('B', true)`);
    const rows = await db.q(student, 'select title, is_default from public.cvs where student_id = $1 order by title', [student]);
    assert.deepEqual(rows.map(r => [r.title, r.is_default]), [['A', false], ['B', true]]);
    assert.ok(a);
  });

  it('a public CV gets a slug and is readable by guests; private ones are not', async () => {
    const student = await db.createUser();
    const [{ id }] = await db.q(student, `insert into public.cvs (title, content) values ('CV', '{"personal":{"name":"An"}}') returning id`);
    assert.equal((await db.q(null, 'select * from public.cvs where id = $1', [id])).length, 0);
    await db.q(student, 'update public.cvs set is_public = true where id = $1', [id]);
    const { public_slug: slug } = await db.one('select public_slug from public.cvs where id = $1', [id]);
    assert.match(slug, /^[a-f0-9]{12}$/);
    const [cv] = await db.q(null, 'select content from public.cvs where public_slug = $1', [slug]);
    assert.equal(cv.content.personal.name, 'An');
    await db.q(student, 'update public.cvs set is_public = false where id = $1', [id]);
    assert.equal((await db.q(null, 'select * from public.cvs where public_slug = $1', [slug])).length, 0);
  });

  it('employers and other students cannot read a private CV', async () => {
    const student = await db.createUser();
    await db.q(student, `insert into public.cvs (title) values ('Riêng tư')`);
    assert.equal((await db.q(await db.createUser(), 'select * from public.cvs where student_id = $1', [student])).length, 0);
    assert.equal((await db.q(owner, 'select * from public.cvs where student_id = $1', [student])).length, 0);
  });
});

describe('My Applications', () => {
  it('notifications for students link to /pages/applications/?id=', async () => {
    const student = await db.studentWithCv();
    const [{ apply_to_job: app }] = await db.rpc(student, 'apply_to_job', { p_job: job });
    await db.rpc(owner, 'mark_application_viewed', { p_application: app });
    const n = await db.one(`select link from public.notifications where user_id = $1 and type = 'cv_viewed'`, [student]);
    assert.equal(n.link, `/pages/applications/?id=${app}`);
  });

  it('students read their own history, interviews and offers, and the job even after it closes', async () => {
    const closingJob = await db.activeJob(admin, owner, company, { title: 'Sắp đóng' });
    const student = await db.studentWithCv();
    const [{ apply_to_job: app }] = await db.rpc(student, 'apply_to_job', { p_job: closingJob });
    await db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'shortlisted' });
    await db.rpc(owner, 'schedule_interview', { p_application: app, p_scheduled_at: future(), p_meeting_url: 'https://meet' });
    await db.rpc(owner, 'change_job_status', { p_job: closingJob, p_status: 'closed' });
    assert.equal((await db.q(student, 'select * from public.application_status_history where application_id = $1', [app])).length, 3);
    assert.equal((await db.q(student, 'select * from public.interviews where application_id = $1', [app])).length, 1);
    assert.equal((await db.q(student, 'select title from public.jobs where id = $1', [closingJob]))[0].title, 'Sắp đóng');
    assert.equal((await db.q(await db.createUser(), 'select * from public.interviews where application_id = $1', [app])).length, 0);
  });

  it('students propose a new interview time and decline an offer with a reason', async () => {
    const student = await db.studentWithCv();
    const [{ apply_to_job: app }] = await db.rpc(student, 'apply_to_job', { p_job: await db.activeJob(admin, owner, company, { title: 'Phỏng vấn thử' }) });
    const [{ schedule_interview: interview }] = await db.rpc(owner, 'schedule_interview', { p_application: app, p_scheduled_at: future(), p_meeting_url: 'https://meet' });
    await db.rpc(student, 'respond_interview', { p_interview: interview, p_rsvp: 'reschedule_requested', p_note: 'Trùng lịch thi', p_proposed_at: future(4) });
    const i = await db.one('select rsvp, proposed_at from public.interviews where id = $1', [interview]);
    assert.equal(i.rsvp, 'reschedule_requested');
    assert.ok(i.proposed_at);
    const [{ send_offer: offer }] = await db.rpc(owner, 'send_offer', { p_application: app, p_start_date: today(5), p_expires_at: future(5) });
    await db.rpc(student, 'respond_offer', { p_offer: offer, p_accept: false, p_note: 'Đã nhận nơi khác' });
    assert.equal((await db.one('select status from public.applications where id = $1', [app])).status, 'offer_declined');
  });
});

describe('job alerts', () => {
  it('students manage only their own alerts', async () => {
    const student = await db.createUser(), other = await db.createUser();
    const [{ id }] = await db.q(student, `insert into public.job_alerts (name, keywords, city, frequency) values ('React HCM', 'react', 'Hồ Chí Minh', 'daily') returning id`);
    assert.equal((await db.q(other, 'select * from public.job_alerts')).length, 0);
    await db.q(other, 'delete from public.job_alerts where id = $1', [id]);
    assert.equal((await db.q(student, 'select * from public.job_alerts')).length, 1);
    await db.q(student, 'update public.job_alerts set is_active = false where id = $1', [id]);
    assert.equal((await db.one('select is_active from public.job_alerts where id = $1', [id])).is_active, false);
  });
});
