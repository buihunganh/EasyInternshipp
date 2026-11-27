// Demo of the full internship loop (Phase 10) for presentations and manual QA. Idempotent.
// Needs only the anon key (sign-ups are auto-confirmed on the dev project) plus the demo accounts
// created by `npm run db:seed`. Every step goes through the real RPCs:
//   new student signs up → officer verifies → applies to an active TechNova job → employer shortlists →
//   offer → student accepts (hired) → employer rates the intern → student submits the report →
//   officer certifies → certificate code (check it at /pages/verify/?code=…).
//
//   npm run db:seed:internship
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';

const { url, anonKey } = loadEnv();
const PASSWORD = 'Demo@2026';
const STUDENT_EMAIL = 'intern@demo.internships.io';
const log = (...a) => console.log('  ·', ...a);
const check = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn(email) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message} (run npm run db:seed first)`);
  return { c, id: data.user.id };
}

const officer = await signIn('officer@demo.internships.io');
const employer = await signIn('employer@demo.internships.io');
const { university_id: hcmut } = check(await officer.c.from('university_officers').select('university_id').eq('user_id', officer.id).single(), 'officer university');

// 1. The intern account (sign up once)
let student;
try { student = await signIn(STUDENT_EMAIL); }
catch {
  const c = client();
  check(await c.auth.signUp({ email: STUDENT_EMAIL, password: PASSWORD, options: { data: {
    role: 'student', full_name: 'Trần Gia Bảo', university_id: hcmut, student_code: '2110999', major: 'Kỹ thuật Phần mềm' } } }), 'sign up');
  student = await signIn(STUDENT_EMAIL);
  log('created', STUDENT_EMAIL);
}
const s = student.c;

// 2. Verified by the university
const sp = check(await s.from('student_profiles').select('verification_status').eq('user_id', student.id).single(), 'student profile');
if (sp.verification_status !== 'verified') {
  check(await s.from('student_profiles').update({ gpa: 3.4, graduation_year: 2026, headline: 'Thực tập sinh Backend', is_looking_for_job: true }).eq('user_id', student.id), 'profile');
  if (sp.verification_status !== 'pending') check(await s.rpc('request_student_verification'), 'request verification');
  check(await officer.c.rpc('verify_student', { p_student: student.id, p_approve: true, p_note: 'Đã đối chiếu MSSV' }), 'verify');
  log('verified by the officer');
}

// 3. CV
let cv = check(await s.from('cvs').select('id').eq('student_id', student.id).limit(1), 'cvs')[0];
if (!cv) {
  cv = check(await s.from('cvs').insert({ title: 'CV Backend', is_default: true, content: {
    personal: { name: 'Trần Gia Bảo', email: STUDENT_EMAIL, location: 'TP. Hồ Chí Minh' },
    summary: 'Sinh viên năm 4 Kỹ thuật Phần mềm, quan tâm Node.js, PostgreSQL và hệ thống phân tán.',
    education: [{ school: 'ĐH Bách Khoa TP.HCM', degree: 'Kỹ sư Kỹ thuật Phần mềm', from: '2021', to: '2026', gpa: '3.4' }],
    skills: ['Node.js', 'PostgreSQL', 'Docker', 'Git'] } }).select('id').single(), 'cv');
  log('cv created');
}

// 4. Application to one of the employer's active jobs
const { company_id: company } = check(await employer.c.from('company_members').select('company_id').eq('user_id', employer.id).eq('member_role', 'owner').limit(1).single(), 'employer company');
let app = check(await s.from('applications').select('id, status, job_id').eq('student_id', student.id).order('applied_at').limit(1), 'applications')[0];
if (!app) {
  const job = check(await employer.c.from('jobs').select('id, title').eq('company_id', company).eq('status', 'active').is('university_id', null).order('published_at', { ascending: false }).limit(1), 'jobs')[0];
  if (!job) throw new Error('The demo employer has no active public job to apply to.');
  const questions = check(await s.from('screening_questions').select('id, kind, options').eq('job_id', job.id).order('position'), 'questions');
  const id = check(await s.rpc('apply_to_job', { p_job: job.id, p_cv: cv.id, p_cover_letter: 'Em mong được thực tập và đóng góp cho đội ngũ.',
    p_answers: questions.map(q => ({ question_id: q.id, answer: q.kind === 'yes_no' ? 'yes' : q.kind === 'single_choice' ? String((q.options ?? [])[0] ?? 'A') : 'github.com/giabao-dev' })) }), 'apply');
  app = { id, status: 'applied', job_id: job.id };
  log('applied to', job.title);
}

// 5. Shortlist → offer → accept
if (['applied', 'cv_viewed', 'screening'].includes(app.status)) {
  check(await employer.c.rpc('update_application_status', { p_application: app.id, p_status: 'shortlisted', p_note: 'Hồ sơ phù hợp' }), 'shortlist');
  app.status = 'shortlisted';
}
if (['shortlisted', 'interviewing'].includes(app.status)) {
  const start = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);   // send_offer rejects past start dates
  const offer = check(await employer.c.rpc('send_offer', { p_application: app.id, p_start_date: start,
    p_expires_at: new Date(Date.now() + 5 * 86400000).toISOString(), p_stipend_amount: 6000000,
    p_terms: 'Thực tập 3 tháng, 5 ngày/tuần, có mentor 1 kèm 1.' }), 'offer');
  check(await s.rpc('respond_offer', { p_offer: offer, p_accept: true, p_note: 'Em xin nhận offer.' }), 'accept offer');
  app.status = 'hired';
  log('hired');
}
if (app.status !== 'hired') throw new Error(`Application is "${app.status}", cannot continue the internship demo.`);

// 6. Employer rating, 7. student report, 8. certification
let report = check(await s.from('internship_reports').select('id, status, employer_rating, verification_code').eq('application_id', app.id).maybeSingle(), 'report');
if (!report?.employer_rating && report?.status !== 'certified') {
  check(await employer.c.rpc('rate_intern', { p_application: app.id, p_rating: 5, p_comment: 'Chủ động, tiến bộ nhanh, hoàn thành tốt module báo cáo.' }), 'rate intern');
  log('employer rated the intern');
}
report = check(await s.from('internship_reports').select('id, status, verification_code').eq('application_id', app.id).maybeSingle(), 'report');
if (!report || ['draft', 'rejected'].includes(report.status)) {
  check(await s.rpc('submit_internship_report', { p_application: app.id, p_summary:
    'Trong 3 tháng thực tập tại TechNova, em tham gia đội Backend: xây dựng API báo cáo bằng Node.js/PostgreSQL, viết test tích hợp và tối ưu truy vấn giúp giảm 40% thời gian tải trang báo cáo. Em học được quy trình code review, CI/CD và làm việc theo Scrum.' }), 'submit report');
  report = check(await s.from('internship_reports').select('id, status, verification_code').eq('application_id', app.id).single(), 'report');
  log('report submitted');
}
if (report.status === 'submitted') {
  check(await officer.c.rpc('certify_internship_report', { p_report: report.id, p_approve: true, p_note: 'Đạt yêu cầu thực tập' }), 'certify');
  report = check(await s.from('internship_reports').select('id, status, verification_code').eq('id', report.id).single(), 'report');
  log('certified by the officer');
}

console.log(`\nDone. ${STUDENT_EMAIL} / ${PASSWORD}: certified internship report.`);
console.log(`Certificate: /pages/verify/?code=${report.verification_code}`);
