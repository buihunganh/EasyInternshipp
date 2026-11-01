// BR-32 … BR-45: messaging, community, reports, university portal, admin, KPIs, storage.
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { createDb, rejects } from './harness.mjs';

let db, admin, owner, company, job;
before(async () => {
  db = await createDb();
  admin = await db.makeAdmin('admin@example.com');
  ({ owner, company } = await db.verifiedCompany(admin));
  job = await db.activeJob(admin, owner, company);
});

const future = (days = 2) => new Date(Date.now() + days * 86400000).toISOString();
const today = (days = 0) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
async function applied() {
  const student = await db.studentWithCv();
  const [{ apply_to_job: app }] = await db.rpc(student, 'apply_to_job', { p_job: job });
  return { student, app };
}
async function hired() {
  const { student, app } = await applied();
  await db.rpc(owner, 'update_application_status', { p_application: app, p_status: 'shortlisted' });
  const [{ send_offer: offer }] = await db.rpc(owner, 'send_offer', { p_application: app, p_start_date: today(3), p_expires_at: future(5) });
  await db.rpc(student, 'respond_offer', { p_offer: offer, p_accept: true });
  return { student, app };
}

describe('messaging (BR-32 … BR-34)', () => {
  it('BR-32: students message only companies they applied to', async () => {
    const stranger = await db.studentWithCv();
    await rejects(db.rpc(stranger, 'start_conversation', { p_with_user: owner }), /đã ứng tuyển/);
    const { student } = await applied();
    const [{ start_conversation: conv }] = await db.rpc(student, 'start_conversation', { p_with_user: owner });
    const [{ start_conversation: again }] = await db.rpc(owner, 'start_conversation', { p_with_user: student });
    assert.equal(again, conv, 'one thread per student–company');
  });

  it('BR-32: unverified companies cannot initiate', async () => {
    const other = await db.createUser({ role: 'employer' });
    await db.rpc(other, 'create_company', { p_name: 'Cty Mới' });
    await rejects(db.rpc(other, 'start_conversation', { p_with_user: await db.createUser() }), /xác thực/);
  });

  it('participants send and read; outsiders cannot', async () => {
    const { student } = await applied();
    const [{ start_conversation: conv }] = await db.rpc(owner, 'start_conversation', { p_with_user: student });
    await db.q(student, `insert into public.messages (conversation_id, body) values ($1, 'Chào anh chị')`, [conv]);
    assert.equal((await db.q(owner, 'select body from public.messages where conversation_id = $1', [conv]))[0].body, 'Chào anh chị');
    const outsider = await db.createUser();
    assert.equal((await db.q(outsider, 'select * from public.messages where conversation_id = $1', [conv])).length, 0);
    await rejects(db.q(outsider, `insert into public.messages (conversation_id, body) values ($1, 'x')`, [conv]), /row-level security/);
    await rejects(db.q(student, `insert into public.messages (conversation_id, kind, body) values ($1, 'interview_invite', 'fake')`, [conv]), /row-level security/);
  });

  it('BR-33: scheduling an interview posts an invite card in the chat', async () => {
    const { student, app } = await applied();
    await db.rpc(owner, 'schedule_interview', { p_application: app, p_scheduled_at: future(), p_meeting_url: 'https://meet' });
    const cards = await db.q(student, `select m.metadata from public.messages m where m.kind = 'interview_invite'
      and m.conversation_id in (select conversation_id from public.conversation_participants where user_id = $1)`, [student]);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].metadata.meeting_url, 'https://meet');
  });

  it('BR-34: muted participants get no message notifications', async () => {
    const { student } = await applied();
    const [{ start_conversation: conv }] = await db.rpc(owner, 'start_conversation', { p_with_user: student });
    await db.q(student, 'update public.conversation_participants set is_muted = true where conversation_id = $1 and user_id = $2', [conv, student]);
    await db.q(owner, `insert into public.messages (conversation_id, body) values ($1, 'Hello')`, [conv]);
    assert.equal((await db.sql(`select * from public.notifications where user_id = $1 and type = 'message'`, [student])).length, 0);
  });
});

describe('community (BR-35 … BR-37)', () => {
  it('BR-35: anonymous posts and comments never expose the author', async () => {
    const author = await db.createUser({ full_name: 'Bí Mật' });
    const [{ id: post }] = await db.q(author, `insert into public.posts (type, body, is_anonymous) values ('question', 'Hỏi ẩn danh', true) returning id`);
    const viewer = await db.createUser();
    assert.equal((await db.q(viewer, 'select * from public.posts where id = $1', [post])).length, 0, 'base table hides it');
    const [feed] = await db.q(viewer, 'select author_id, author_name from public.post_feed where id = $1', [post]);
    assert.equal(feed.author_id, null);
    assert.equal(feed.author_name, 'Ẩn danh');
    await db.q(author, `insert into public.post_comments (post_id, body, is_anonymous) values ($1, 'tự trả lời', true)`, [post]);
    const [c] = await db.q(null, 'select author_id, author_name from public.comment_feed where post_id = $1', [post]);
    assert.equal(c.author_id, null);
  });

  it('BR-36: company reviews only from interns hired there', async () => {
    const outsider = await db.createUser();
    await rejects(db.q(outsider, `insert into public.posts (type, body, company_id, rating) values ('review', 'Tốt', $1, 5)`, [company]), /đã nhận việc/);
    const { student } = await hired();
    await db.q(student, `insert into public.posts (type, body, company_id, rating) values ('review', 'Môi trường tốt', $1, 4)`, [company]);
    assert.equal(Number((await db.one('select review_count from public.company_ratings where company_id = $1', [company])).review_count), 1);
  });

  it('likes and comments keep counters in sync', async () => {
    const author = await db.createUser();
    const [{ id: post }] = await db.q(author, `insert into public.posts (body) values ('Kinh nghiệm phỏng vấn') returning id`);
    const fan = await db.createUser();
    await db.q(fan, 'insert into public.post_likes (post_id) values ($1)', [post]);
    await db.q(fan, `insert into public.post_comments (post_id, body) values ($1, 'Cảm ơn')`, [post]);
    const row = await db.one('select like_count, comment_count from public.posts where id = $1', [post]);
    assert.deepEqual([row.like_count, row.comment_count], [1, 1]);
    await db.q(fan, 'delete from public.post_likes where post_id = $1', [post]);
    assert.equal((await db.one('select like_count from public.posts where id = $1', [post])).like_count, 0);
  });

  it('BR-37: guests can report; duplicates and floods are blocked', async () => {
    await db.q(null, `insert into public.reports (target_type, target_id, reason) values ('job', $1, 'fake_job')`, [job]);
    const reporter = await db.createUser();
    await db.q(reporter, `insert into public.reports (target_type, target_id, reason) values ('job', $1, 'scam_fee')`, [job]);
    await rejects(db.q(reporter, `insert into public.reports (target_type, target_id, reason) values ('job', $1, 'spam')`, [job]), /đã báo cáo/);
    for (let i = 0; i < 19; i++) {
      await db.q(reporter, `insert into public.reports (target_type, target_id, reason) values ('user', gen_random_uuid(), 'spam')`);
    }
    await rejects(db.q(reporter, `insert into public.reports (target_type, target_id, reason) values ('user', gen_random_uuid(), 'spam')`), /quá nhiều/);
  });
});

describe('admin (BR-38, BR-39, BR-44)', () => {
  it('BR-38: admin actions are audited with actor and reason', async () => {
    const student = await db.createUser();
    await db.rpc(admin, 'set_user_status', { p_user: student, p_status: 'suspended', p_reason: 'Spam tin nhắn' });
    const row = await db.one(`select actor_id, actor_role, reason from public.audit_logs where action = 'user.suspended' and target_id = $1`, [student]);
    assert.equal(row.actor_id, admin);
    assert.equal(row.actor_role, 'admin');
    assert.equal(row.reason, 'Spam tin nhắn');
    assert.equal((await db.q(student, 'select * from public.audit_logs')).length, 0, 'only admins read the log');
  });

  it('BR-39: resolving a report hides content and closes duplicates', async () => {
    const author = await db.createUser();
    const [{ id: post }] = await db.q(author, `insert into public.posts (body) values ('Lừa đảo thu phí') returning id`);
    const r1 = await db.createUser(), r2 = await db.createUser();
    const [{ id: report }] = await db.q(r1, `insert into public.reports (target_type, target_id, reason) values ('post', $1, 'scam_fee') returning id`, [post]);
    await db.q(r2, `insert into public.reports (target_type, target_id, reason) values ('post', $1, 'scam_fee')`, [post]);
    await rejects(db.rpc(admin, 'resolve_report', { p_report: report, p_status: 'resolved', p_action: 'hide_content' }), /kết quả/);
    await db.rpc(admin, 'resolve_report', { p_report: report, p_status: 'resolved', p_note: 'Đã ẩn', p_action: 'hide_content' });
    assert.equal((await db.one('select status from public.posts where id = $1', [post])).status, 'hidden');
    assert.equal(Number((await db.one(`select count(*) n from public.reports where target_id = $1 and status = 'resolved'`, [post])).n), 2);
  });

  it('BR-39: resolve_report can close a job or suspend a user', async () => {
    const victimJob = await db.activeJob(admin, owner, company);
    const r = await db.createUser();
    const [{ id: report }] = await db.q(r, `insert into public.reports (target_type, target_id, reason) values ('job', $1, 'fake_job') returning id`, [victimJob]);
    await db.rpc(admin, 'resolve_report', { p_report: report, p_status: 'resolved', p_note: 'Tin giả', p_action: 'close_job' });
    assert.equal((await db.one('select status from public.jobs where id = $1', [victimJob])).status, 'closed');
  });

  it('BR-44: KPIs and overview are admin-only', async () => {
    const student = await db.createUser();
    await rejects(db.rpc(student, 'admin_overview'), /quản trị viên/);
    await rejects(db.rpc(student, 'get_platform_kpis'), /quản trị viên/);
    const [{ admin_overview: overview }] = await db.rpc(admin, 'admin_overview');
    assert.ok(overview.jobs_active >= 1);
  });
});

describe('university (BR-40 … BR-42)', () => {
  let uni, officer;
  before(async () => {
    uni = (await db.one(`select id from public.universities where short_name = 'HCMUT'`)).id;
    officer = await db.createUser({ role: 'university_officer', university_id: uni });
    await db.rpc(admin, 'set_user_status', { p_user: officer, p_status: 'active' });
  });

  it('BR-40: officers verify only their own university\'s students', async () => {
    const mine = await db.createUser({ email: 'x@hcmut.edu.vn', student_code: 'BK001' });
    const theirs = await db.createUser({ email: 'y@uit.edu.vn', student_code: 'UIT001' });
    await db.rpc(mine, 'request_student_verification');
    await db.rpc(officer, 'verify_student', { p_student: mine, p_approve: true });
    assert.equal((await db.one('select verification_status from public.student_profiles where user_id = $1', [mine])).verification_status, 'verified');
    await rejects(db.rpc(officer, 'verify_student', { p_student: theirs, p_approve: true }), /không thuộc trường/);
    assert.equal((await db.q(officer, 'select * from public.student_profiles where user_id = $1', [theirs])).length, 0);
  });

  it('BR-41: report → employer rating → certification → public verification', async () => {
    const { student, app } = await hired();
    await db.sql(`update public.student_profiles set university_id = $1, student_code = 'BK-HIRED' where user_id = $2`, [uni, student]);
    await rejects(db.rpc(student, 'submit_internship_report', { p_application: app, p_summary: 'Báo cáo' }), /xác thực/);
    await db.rpc(student, 'request_student_verification');
    await db.rpc(officer, 'verify_student', { p_student: student, p_approve: true });
    const [{ submit_internship_report: report }] = await db.rpc(student, 'submit_internship_report', { p_application: app, p_summary: 'Tôi đã học được nhiều' });
    await rejects(db.rpc(officer, 'certify_internship_report', { p_report: report, p_approve: true }), /đánh giá từ doanh nghiệp/);
    await db.rpc(owner, 'rate_intern', { p_application: app, p_rating: 5, p_comment: 'Xuất sắc' });
    const [{ certify_internship_report: code }] = await db.rpc(officer, 'certify_internship_report', { p_report: report, p_approve: true });
    const [{ verify_internship_certificate: cert }] = await db.rpc(null, 'verify_internship_certificate', { p_code: code.toLowerCase() });
    assert.equal(cert.employer_rating, 5);
    assert.match(cert.university, /Bách khoa/);
  });

  it('BR-42: events respect publication and capacity; booths need a verified company', async () => {
    const [{ id: event }] = await db.q(officer, `insert into public.events (title, organizer_university_id, starts_at, ends_at, capacity, status)
      values ('Career Fair BK', $1, $2, $3, 1, 'draft') returning id`, [uni, future(3), future(4)]);
    const s1 = await db.createUser(), s2 = await db.createUser();
    await rejects(db.rpc(s1, 'register_for_event', { p_event: event }), /không mở đăng ký/);
    await db.q(officer, `update public.events set status = 'published' where id = $1`, [event]);
    const [{ register_for_event: ticket }] = await db.rpc(s1, 'register_for_event', { p_event: event });
    assert.match(ticket, /^[A-F0-9]{10}$/);
    await rejects(db.rpc(s2, 'register_for_event', { p_event: event }), /đủ chỗ/);
    await db.rpc(officer, 'check_in_event', { p_event: event, p_ticket_code: ticket.toLowerCase() });

    await db.q(owner, 'insert into public.event_booths (event_id, company_id) values ($1, $2)', [event, company]);
    const unverified = await db.createUser({ role: 'employer' });
    const [{ create_company: c2 }] = await db.rpc(unverified, 'create_company', { p_name: 'Cty Chưa XT' });
    await rejects(db.q(unverified, 'insert into public.event_booths (event_id, company_id) values ($1, $2)', [event, c2]), /row-level security/);
  });

  it('anyone can send a partner inquiry; only that university\'s officers read it', async () => {
    await db.q(null, `insert into public.partner_inquiries (university_id, contact_name, email) values ($1, 'Anh A', 'a@cty.vn')`, [uni]);
    assert.equal((await db.q(officer, 'select * from public.partner_inquiries')).length, 1);
    assert.equal((await db.q(await db.createUser(), 'select * from public.partner_inquiries')).length, 0);
  });
});

describe('notifications & storage (BR-43, BR-45)', () => {
  it('BR-43: in-app preference off still delivers workflow-critical notifications', async () => {
    const { student, app } = await applied();
    await db.q(student, 'update public.notification_preferences set in_app = false where user_id = $1', [student]);
    await db.rpc(owner, 'mark_application_viewed', { p_application: app });
    assert.ok(await db.one(`select 1 from public.notifications where user_id = $1 and type = 'cv_viewed'`, [student]));
  });

  it('BR-45: CV files follow folder ownership and submitted files cannot be deleted', async () => {
    const student = await db.createUser();
    const other = await db.createUser();
    await db.q(student, `insert into storage.objects (bucket_id, name) values ('cvs', $1)`, [`${student}/cv.pdf`]);
    await rejects(db.q(other, `insert into storage.objects (bucket_id, name) values ('cvs', $1)`, [`${student}/hack.pdf`]), /row-level security/);
    assert.equal((await db.q(other, `select * from storage.objects where bucket_id = 'cvs'`)).length, 0);

    await db.q(student, `insert into public.cvs (title, source, file_path, is_default) values ('PDF', 'upload', $1, true)`, [`${student}/cv.pdf`]);
    const [{ apply_to_job: app }] = await db.rpc(student, 'apply_to_job', { p_job: job });
    assert.ok(app);
    await db.q(student, `delete from storage.objects where bucket_id = 'cvs' and name = $1`, [`${student}/cv.pdf`]);
    assert.equal((await db.sql(`select * from storage.objects where name = $1`, [`${student}/cv.pdf`])).length, 1, 'still there');
    assert.equal((await db.q(owner, `select * from storage.objects where name = $1`, [`${student}/cv.pdf`])).length, 1, 'the hiring company can read it');
  });

  it('chat attachments are readable by participants only', async () => {
    const { student } = await applied();
    const [{ start_conversation: conv }] = await db.rpc(owner, 'start_conversation', { p_with_user: student });
    await db.q(student, `insert into storage.objects (bucket_id, name) values ('message-attachments', $1)`, [`${conv}/file.pdf`]);
    assert.equal((await db.q(owner, `select * from storage.objects where bucket_id = 'message-attachments'`)).length, 1);
    assert.equal((await db.q(await db.createUser(), `select * from storage.objects where bucket_id = 'message-attachments'`)).length, 0);
  });
});
