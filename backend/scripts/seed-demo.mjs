// Demo data for presentations (decision D2). Idempotent: re-running skips what already exists.
//
// Creates one account per role with the service key, then signs in as each user and calls the
// real RPCs (create company → upload GPKD → admin verifies → post jobs → admin approves → apply…),
// so a successful run is also a smoke test of the workflows.
//
//   npm run db:seed            (needs SUPABASE_SERVICE_ROLE_KEY in .env.local)
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './env.mjs';

const { url, anonKey, serviceKey } = loadEnv();
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase dashboard → Project Settings → API keys → service_role).');
  process.exit(1);
}

export const DEMO_PASSWORD = 'Demo@2026';
const DOMAIN = 'demo.internships.io';
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const log = (...args) => console.log('  ·', ...args);
function check(result, what) {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  return result.data;
}

const universityId = async shortName =>
  check(await service.from('universities').select('id').eq('short_name', shortName).single(), `university ${shortName}`).id;
const skillIds = async names =>
  check(await service.from('skills').select('id, name').in('name', names), 'skills').map(s => s.id);

async function findUser(email) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const user = data.users.find(u => u.email === email);
    if (user) return user;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Create (or reuse) a confirmed user and return a client signed in as them. */
async function account(local, metadata) {
  const email = `${local}@${DOMAIN}`;
  let user = await findUser(email);
  if (!user) {
    user = check(await service.auth.admin.createUser({ email, password: DEMO_PASSWORD, email_confirm: true, user_metadata: metadata }), `create ${email}`).user;
    log('created', email);
  }
  const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  check(await client.auth.signInWithPassword({ email, password: DEMO_PASSWORD }), `sign in ${email}`);
  return { id: user.id, email, client };
}

const MINIMAL_PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/** Company owned by `owner`, verified by `admin` unless verify=false. Returns its id. */
async function company(owner, admin, fields, { verify = true } = {}) {
  const existing = check(await service.from('company_members').select('company_id').eq('user_id', owner.id).eq('member_role', 'owner'), 'membership');
  let id = existing[0]?.company_id;
  if (!id) {
    id = check(await owner.client.rpc('create_company', {
      p_name: fields.name, p_tax_code: fields.tax_code, p_industry_id: fields.industry_id ?? null, p_city: fields.city,
      p_address: fields.address, p_website: fields.website, p_company_size: fields.company_size, p_description: fields.description,
    }), `create_company ${fields.name}`);
    check(await owner.client.from('companies').update({ founded_year: fields.founded_year ?? null, profile: fields.profile ?? {} }).eq('id', id), 'company profile');
    log('company', fields.name);
  }
  const { data: row } = await service.from('companies').select('verification_status').eq('id', id).single();
  if (row.verification_status === 'unverified') {
    const path = `${id}/giay-phep-kinh-doanh.pdf`;
    await owner.client.storage.from('company-documents').upload(path, MINIMAL_PDF, { contentType: 'application/pdf', upsert: true });
    check(await owner.client.from('company_documents').insert({ company_id: id, doc_type: 'business_license', file_path: path }), 'GPKD');
    check(await owner.client.rpc('submit_company_verification', { p_company: id }), 'submit verification');
    log('verification submitted', fields.name);
  }
  if (verify && ['pending', 'unverified'].includes((await service.from('companies').select('verification_status').eq('id', id).single()).data.verification_status)) {
    check(await admin.client.rpc('review_company_verification', { p_company: id, p_decision: 'verified' }), 'verify company');
    log('verified', fields.name);
  }
  return id;
}

/** Job posted by `owner`; approved by `admin` when status is 'active'. Returns its id. */
async function job(owner, admin, companyId, fields, { status = 'active', skills = [], questions = [] } = {}) {
  const found = check(await service.from('jobs').select('id, status').eq('company_id', companyId).eq('title', fields.title), 'job lookup');
  if (found[0]) return found[0].id;
  const row = check(await owner.client.from('jobs').insert({ company_id: companyId, ...fields }).select('id').single(), `job ${fields.title}`);
  const ids = await skillIds(skills);
  if (ids.length) check(await owner.client.from('job_skills').insert(ids.map(skill_id => ({ job_id: row.id, skill_id }))), 'job skills');
  for (const [position, q] of questions.entries()) {
    const question = check(await owner.client.from('screening_questions').insert({
      job_id: row.id, position, question: q.question, kind: q.kind ?? 'yes_no', options: q.options ?? [],
      is_required: q.required ?? true, is_knockout: q.knockout ?? false,
    }).select('id').single(), 'question');
    if (q.ideal) check(await owner.client.from('screening_question_keys').insert({ question_id: question.id, ideal_answer: q.ideal }), 'answer key');
  }
  if (status !== 'draft') check(await owner.client.rpc('submit_job', { p_job: row.id }), `submit ${fields.title}`);
  if (status === 'active') check(await admin.client.rpc('moderate_job', { p_job: row.id, p_approve: true }), `approve ${fields.title}`);
  log(`job (${status})`, fields.title);
  return row.id;
}

const inDays = days => new Date(Date.now() + days * 86400000).toISOString();

async function main() {
  console.log(`Seeding demo data into ${url}`);
  const hcmut = await universityId('HCMUT');
  const industries = Object.fromEntries(check(await service.from('industries').select('id, slug'), 'industries').map(i => [i.slug, i.id]));

  // --- Accounts -------------------------------------------------------------
  const admin = await account('admin', { full_name: 'Quản trị viên' });
  check(await service.from('profiles').update({ role: 'admin', status: 'active' }).eq('id', admin.id), 'promote admin');
  const employer = await account('employer', { role: 'employer', full_name: 'Mai Phương' });
  const vng = await account('hr.vng', { role: 'employer', full_name: 'Trần Quốc Bảo' });
  const designer = await account('design', { role: 'employer', full_name: 'Lê Thanh Hà' });
  const newco = await account('newco', { role: 'employer', full_name: 'Phạm Minh Khang' });
  const officer = await account('officer', { role: 'university_officer', full_name: 'TS. Hoàng Văn Nam', university_id: hcmut, department: 'Phòng Đào tạo', title: 'Chuyên viên' });
  const student = await account('student', { role: 'student', full_name: 'Nguyễn Minh Thư', university_id: hcmut, student_code: '2112345', major: 'Khoa học Máy tính' });

  // Officers start pending (BR-02): the admin activates them
  const { data: officerProfile } = await service.from('profiles').select('status').eq('id', officer.id).single();
  if (officerProfile.status !== 'active') {
    check(await admin.client.rpc('set_user_status', { p_user: officer.id, p_status: 'active' }), 'activate officer');
    log('officer activated');
  }

  // --- Companies ------------------------------------------------------------
  const technova = await company(employer, admin, {
    name: 'TechNova Solutions', tax_code: '0312192258', industry_id: industries['cong-nghe-thong-tin'], city: 'TP. Hồ Chí Minh',
    address: 'Tòa nhà Lim Tower, Quận 7, TP.HCM', website: 'https://technova.example.com', company_size: '200-500', founded_year: 2015,
    description: 'TechNova Solutions xây dựng nền tảng thanh toán và hạ tầng microservices cho hơn 5 triệu người dùng. Chương trình thực tập có mentor 1-1 và lộ trình 12 tuần.',
    profile: { office: 'Lim Tower, Quận 7', mentors: [{ name: 'Nguyễn Hoàng Long', title: 'Senior Staff Engineer' }], culture: ['Học hỏi liên tục', 'Code review hằng ngày', 'Hybrid 3 ngày/tuần'] },
  });
  const vngCo = await company(vng, admin, {
    name: 'VNG Corporation', tax_code: '0303490096', industry_id: industries['cong-nghe-thong-tin'], city: 'TP. Hồ Chí Minh',
    address: 'VNG Campus, Quận 7, TP.HCM', website: 'https://vng.example.com', company_size: '1000+', founded_year: 2004,
    description: 'Hệ sinh thái sản phẩm số với hàng chục triệu người dùng: nền tảng dữ liệu lớn, cổng thanh toán và trò chơi trực tuyến.',
  });
  const designCo = await company(designer, admin, {
    name: 'DesignWorks Studio', tax_code: '0109876543', industry_id: industries['thiet-ke'], city: 'Hà Nội',
    address: 'Cầu Giấy, Hà Nội', website: 'https://designworks.example.com', company_size: '20-50', founded_year: 2019,
    description: 'Studio thiết kế sản phẩm số: nghiên cứu người dùng, UI Kit và hệ thống thiết kế cho các startup Việt Nam.',
  });
  // A company still waiting for verification, for the admin queue
  await company(newco, admin, {
    name: 'Startup Xanh', tax_code: '0315550001', industry_id: industries['marketing'], city: 'Đà Nẵng',
    description: 'Startup marketing bền vững đang chờ thẩm định giấy phép kinh doanh.',
  }, { verify: false });

  // --- Jobs -----------------------------------------------------------------
  const seJob = await job(employer, admin, technova, {
    title: 'Software Engineering Intern (Full-stack)', industry_id: industries['cong-nghe-thong-tin'], city: 'TP. Hồ Chí Minh',
    address: 'Quận 7, TP.HCM', work_type: 'hybrid', schedule: 'full_time', duration_months: 3, openings: 3,
    stipend_min: 8000000, stipend_max: 12000000, deadline: inDays(30), department: 'Engineering',
    target_study_years: [3, 4], target_majors: ['Khoa học Máy tính', 'Kỹ thuật Phần mềm'], perks: ['Mentor 1-1', 'Laptop', 'Dấu mộc đồ án'],
    description: 'Tham gia phát triển hạ tầng microservices phục vụ hơn 5 triệu người dùng. Được kèm cặp 1-on-1 bởi Senior Staff Engineer, hỗ trợ tài liệu và dấu mộc thực tập chuẩn chỉ.',
    requirements: 'Sinh viên năm 3-4 ngành CNTT. Nắm vững JavaScript/TypeScript, React và cơ bản về REST API.',
    benefits: 'Phụ cấp 8-12 triệu, hybrid 3 ngày/tuần, cơ hội lên chính thức sau 3 tháng.',
  }, { skills: ['React', 'TypeScript', 'Node.js'], questions: [
    { question: 'Bạn có thể làm việc tối thiểu 4 ngày/tuần trong 3 tháng?', knockout: true, ideal: 'yes' },
    { question: 'Chia sẻ đường dẫn GitHub hoặc portfolio của bạn', kind: 'short_text', required: false },
  ] });
  await job(employer, admin, technova, {
    title: 'Data Analyst Intern', industry_id: industries['du-lieu'], city: 'TP. Hồ Chí Minh', work_type: 'onsite',
    duration_months: 4, stipend_min: 7000000, stipend_max: 9000000, deadline: inDays(21), department: 'Data',
    target_study_years: [3, 4], perks: ['Mentor 1-1', 'Đào tạo Power BI'],
    description: 'Phân tích dữ liệu giao dịch, xây dựng dashboard Power BI và báo cáo hằng tuần cho đội sản phẩm. Làm việc trực tiếp với Data Lead.',
    requirements: 'Thành thạo SQL và Excel, biết Python là lợi thế.',
  }, { skills: ['SQL', 'Excel', 'Power BI', 'Python'] });
  await job(vng, admin, vngCo, {
    title: 'Backend Developer Intern (Golang / Java)', industry_id: industries['cong-nghe-thong-tin'], city: 'TP. Hồ Chí Minh',
    address: 'VNG Campus, Quận 7', work_type: 'onsite', duration_months: 6, openings: 5, stipend_min: 10000000, stipend_max: 14000000,
    deadline: inDays(14), department: 'Platform', target_study_years: [3, 4], perks: ['Cấp Macbook', 'Cơm trưa'],
    description: 'Tham gia khối nền tảng dữ liệu lớn và cổng thanh toán ZaloPay. Làm việc trực tiếp với hệ thống xử lý lưu lượng hàng triệu RPS.',
    requirements: 'Nắm vững một trong Golang hoặc Java, hiểu cơ sở dữ liệu quan hệ.',
  }, { skills: ['Go', 'Java', 'SQL', 'Docker'] });
  await job(designer, admin, designCo, {
    title: 'Product Design (UI/UX) Intern', industry_id: industries['thiet-ke'], city: 'Hà Nội', work_type: 'remote',
    duration_months: 3, stipend_min: 6000000, stipend_max: 9000000, deadline: inDays(25), department: 'Design', perks: ['Remote 100%', 'Mentor 1-1'],
    description: 'Xây dựng bộ thư viện UI Kit, tham gia phỏng vấn người dùng thực tế và hoàn thiện luồng thanh toán cho ứng dụng fintech.',
    requirements: 'Sử dụng thành thạo Figma, có portfolio tối thiểu 2 dự án.',
  }, { skills: ['Figma', 'UI/UX Design'] });
  await job(employer, admin, technova, {
    title: 'QA Automation Intern', industry_id: industries['cong-nghe-thong-tin'], city: 'TP. Hồ Chí Minh', work_type: 'hybrid',
    stipend_min: 6000000, stipend_max: 8000000, deadline: inDays(40),
    description: 'Viết test tự động cho các dịch vụ thanh toán, xây dựng pipeline CI và báo cáo chất lượng hằng tuần cho đội phát triển.',
  }, { status: 'pending_approval', skills: ['JavaScript', 'Git'] });
  await job(employer, admin, technova, {
    title: 'Marketing Intern (bản nháp)', city: 'TP. Hồ Chí Minh', description: 'Bản nháp đang soạn.',
  }, { status: 'draft' });

  // --- Student --------------------------------------------------------------
  check(await student.client.from('student_profiles').update({
    headline: 'Thực tập sinh Kỹ thuật Phần mềm / Sinh viên năm 3', gpa: 3.65, graduation_year: 2026, city: 'TP. Hồ Chí Minh',
    bio: 'Sinh viên năm 3 ngành Khoa học Máy tính, đam mê phát triển Web (Frontend & Fullstack) với React, Next.js, Node.js và TypeScript.',
    links: { github: 'github.com/minhthu-dev', linkedin: 'linkedin.com/in/minhthu-cse', portfolio: 'minhthu.tech' }, is_discoverable: true,
  }).eq('user_id', student.id), 'student profile');
  const studentSkills = await skillIds(['React', 'TypeScript', 'Figma', 'Git']);
  check(await student.client.from('student_skills').upsert(studentSkills.map(skill_id => ({ student_id: student.id, skill_id, level: 4 })), { onConflict: 'student_id,skill_id' }), 'student skills');
  const { data: sp } = await service.from('student_profiles').select('verification_status').eq('user_id', student.id).single();
  if (sp.verification_status === 'unverified') {
    check(await student.client.rpc('request_student_verification'), 'request verification');
    check(await officer.client.rpc('verify_student', { p_student: student.id, p_approve: true }), 'verify student');
    log('student verified by officer');
  }
  const cvs = check(await student.client.from('cvs').select('id').eq('student_id', student.id), 'cvs');
  if (!cvs.length) {
    check(await student.client.from('cvs').insert({
      title: 'CV Frontend', is_default: true,
      content: { personal: { name: 'Nguyễn Minh Thư', email: 'thu.nguyen@hcmut.edu.vn', phone: '+84 912 345 678', location: 'TP. Hồ Chí Minh' },
                 summary: 'Sinh viên năm 3 Khoa học Máy tính, 15+ dự án GitHub, Top 10 Hackathon 2023.',
                 education: [{ school: 'ĐH Bách Khoa TP.HCM', degree: 'Kỹ sư Khoa học Máy tính', from: '2021', to: '2026', gpa: '3.65' }],
                 skills: ['React', 'TypeScript', 'Node.js', 'Figma'] },
    }), 'cv');
    log('cv created');
  }
  const applied = check(await service.from('applications').select('id').eq('student_id', student.id).eq('job_id', seJob), 'applications');
  if (!applied.length) {
    const questions = check(await student.client.from('screening_questions').select('id, kind').eq('job_id', seJob).order('position'), 'questions');
    check(await student.client.rpc('apply_to_job', {
      p_job: seJob, p_cover_letter: 'Em rất mong được học hỏi tại TechNova.',
      p_answers: questions.map(q => ({ question_id: q.id, answer: q.kind === 'yes_no' ? 'yes' : 'github.com/minhthu-dev' })),
    }), 'apply');
    log('student applied to', 'Software Engineering Intern (Full-stack)');
  }

  console.log(`\nDone. Every demo account uses the password ${DEMO_PASSWORD}:`);
  for (const a of [admin, employer, vng, designer, newco, officer, student]) console.log(`  ${a.email}`);
}

main().catch(error => { console.error('\nSeed failed:', error.message); process.exit(1); });
