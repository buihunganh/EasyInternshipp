// Richer demo data for presentations: company logos, three more (fictional) companies in other fields and
// cities, and ~12 more internships, all through the real workflow (sign up → create company → upload GPKD →
// admin verifies → post → submit → admin approves). Idempotent; needs only the anon key plus the demo
// accounts from `npm run db:seed` (admin@, employer@, hr.vng@, design@).
//
//   npm run db:seed:showcase
//
// Logos in ./assets/logos are original geometric marks for the fictional demo companies. VNG Corporation is a
// real company, so it keeps the generated initials instead of an invented logo.
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { loadEnv } from './env.mjs';

const { url, anonKey } = loadEnv();
const PASSWORD = 'Demo@2026';
const DOMAIN = 'demo.internships.io';
const log = (...a) => console.log('  ·', ...a);
const check = (r, what) => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const client = () => createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const logo = name => readFileSync(new URL(`./assets/logos/${name}.png`, import.meta.url));
const inDays = d => new Date(Date.now() + d * 86400000).toISOString();
const MINIMAL_PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

async function signIn(local, signUpMeta) {
  const email = `${local}@${DOMAIN}`;
  const c = client();
  let r = await c.auth.signInWithPassword({ email, password: PASSWORD });
  if (r.error && signUpMeta) {
    check(await client().auth.signUp({ email, password: PASSWORD, options: { data: signUpMeta } }), `sign up ${email}`);
    log('created', email);
    r = await c.auth.signInWithPassword({ email, password: PASSWORD });
  }
  if (r.error) throw new Error(`sign in ${email}: ${r.error.message} (run npm run db:seed first)`);
  return { c, id: r.data.user.id, email };
}

const admin = await signIn('admin');
const industries = Object.fromEntries(check(await admin.c.from('industries').select('id, slug'), 'industries').map(i => [i.slug, i.id]));

/** The owner's company (created and verified if missing). */
async function company(owner, fields) {
  let id = check(await owner.c.from('company_members').select('company_id').eq('user_id', owner.id).eq('member_role', 'owner').limit(1), 'membership')[0]?.company_id;
  if (!id) {
    id = check(await owner.c.rpc('create_company', { p_name: fields.name, p_tax_code: fields.tax_code, p_industry_id: industries[fields.industry],
      p_city: fields.city, p_address: fields.address, p_website: fields.website, p_company_size: fields.company_size, p_description: fields.description }), `create ${fields.name}`);
    check(await owner.c.from('companies').update({ founded_year: fields.founded_year }).eq('id', id), 'founded year');
    log('company', fields.name);
  }
  const { verification_status: status } = check(await owner.c.from('companies').select('verification_status').eq('id', id).single(), 'status');
  if (status === 'unverified' || status === 'rejected') {
    const path = `${id}/giay-phep-kinh-doanh.pdf`;
    await owner.c.storage.from('company-documents').upload(path, MINIMAL_PDF, { contentType: 'application/pdf', upsert: true });
    check(await owner.c.from('company_documents').insert({ company_id: id, doc_type: 'business_license', file_path: path }), 'GPKD');
    check(await owner.c.rpc('submit_company_verification', { p_company: id }), 'submit verification');
  }
  if (status !== 'verified') {
    check(await admin.c.rpc('review_company_verification', { p_company: id, p_decision: 'verified' }), `verify ${fields.name}`);
    log('verified', fields.name);
  }
  return id;
}

async function setLogo(owner, companyId, file) {
  const { logo_path } = check(await owner.c.from('companies').select('logo_path').eq('id', companyId).single(), 'logo lookup');
  if (logo_path) return;
  const path = `${companyId}/logo.png`;
  check(await owner.c.storage.from('company-assets').upload(path, logo(file), { contentType: 'image/png', upsert: true }), `upload logo ${file}`);
  check(await owner.c.from('companies').update({ logo_path: path }).eq('id', companyId), 'logo path');
  log('logo', file);
}

async function job(owner, companyId, fields, { skills = [], deadlineDays = 30 } = {}) {
  const found = check(await owner.c.from('jobs').select('id, status').eq('company_id', companyId).eq('title', fields.title), 'job lookup')[0];
  if (found) return found.id;
  const row = check(await owner.c.from('jobs').insert({ company_id: companyId, deadline: inDays(deadlineDays), industry_id: industries[fields.industry],
    ...Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'industry')) }).select('id').single(), `job ${fields.title}`);
  const ids = [...new Set(await Promise.all(skills.map(async name => check(await owner.c.rpc('ensure_skill', { p_name: name }), `skill ${name}`))))];
  if (ids.length) check(await owner.c.from('job_skills').insert(ids.map(skill_id => ({ job_id: row.id, skill_id }))), 'job skills');
  check(await owner.c.rpc('submit_job', { p_job: row.id }), `submit ${fields.title}`);
  check(await admin.c.rpc('moderate_job', { p_job: row.id, p_approve: true }), `approve ${fields.title}`);
  log('job', fields.title);
  return row.id;
}

// --- Existing demo companies: logos + more roles ----------------------------------------------
const employer = await signIn('employer');
const design = await signIn('design');
const vng = await signIn('hr.vng');
const newco = await signIn('newco');
const technova = check(await employer.c.from('company_members').select('company_id').eq('user_id', employer.id).limit(1).single(), 'TechNova').company_id;
const designCo = check(await design.c.from('company_members').select('company_id').eq('user_id', design.id).limit(1).single(), 'DesignWorks').company_id;
const vngCo = check(await vng.c.from('company_members').select('company_id').eq('user_id', vng.id).limit(1).single(), 'VNG').company_id;
const xanh = check(await newco.c.from('company_members').select('company_id').eq('user_id', newco.id).limit(1).single(), 'Startup Xanh').company_id;
await setLogo(employer, technova, 'technova');
await setLogo(design, designCo, 'designworks');
await setLogo(newco, xanh, 'startup-xanh');

await job(employer, technova, { title: 'Thực tập sinh DevOps / Cloud', industry: 'cong-nghe-thong-tin', city: 'TP. Hồ Chí Minh', address: 'Lim Tower, Quận 7, TP.HCM',
  work_type: 'hybrid', schedule: 'full_time', duration_months: 4, openings: 2, stipend_min: 8000000, stipend_max: 11000000, department: 'Platform',
  target_study_years: [3, 4], target_majors: ['Khoa học Máy tính', 'Mạng máy tính'], perks: ['Mentor 1-1', 'Laptop', 'Chứng chỉ AWS được tài trợ'],
  description: 'Vận hành và tự động hóa hạ tầng trên AWS cho hệ thống thanh toán: viết pipeline CI/CD, Docker hóa dịch vụ, giám sát bằng Grafana và tham gia trực sự cố cùng đội SRE.',
  requirements: 'Biết Linux cơ bản, Docker và một ngôn ngữ script (Bash hoặc Python). Đã từng dùng Git.',
  benefits: 'Phụ cấp 8-11 triệu, hybrid 3 ngày/tuần, được tài trợ thi chứng chỉ AWS Cloud Practitioner.' }, { skills: ['Docker', 'Linux', 'AWS', 'Git'], deadlineDays: 35 });
await job(employer, technova, { title: 'Thực tập sinh Marketing sản phẩm', industry: 'marketing', city: 'TP. Hồ Chí Minh', address: 'Lim Tower, Quận 7, TP.HCM',
  work_type: 'hybrid', schedule: 'part_time', duration_months: 3, openings: 1, stipend_min: 5000000, stipend_max: 7000000, department: 'Marketing',
  target_study_years: [3, 4], target_majors: ['Marketing', 'Quản trị kinh doanh'], perks: ['Giờ làm linh hoạt', 'Mentor 1-1'],
  description: 'Lên kế hoạch nội dung ra mắt tính năng mới cho ứng dụng ví điện tử: viết bài blog, kịch bản video ngắn, email marketing và đo hiệu quả chiến dịch bằng Google Analytics.',
  requirements: 'Viết tiếng Việt tốt, có tư duy số liệu. Biết Canva hoặc Figma là lợi thế.' }, { skills: ['Content Marketing', 'SEO', 'Google Analytics'], deadlineDays: 28 });
await job(design, designCo, { title: 'Thực tập sinh Thiết kế đồ họa', industry: 'thiet-ke', city: 'Hà Nội', address: 'Cầu Giấy, Hà Nội',
  work_type: 'onsite', schedule: 'full_time', duration_months: 3, openings: 2, stipend_min: 4000000, stipend_max: 6000000, department: 'Brand',
  target_study_years: [3, 4], target_majors: ['Thiết kế đồ họa', 'Mỹ thuật công nghiệp'], perks: ['Mentor 1-1', 'Phần mềm bản quyền'],
  description: 'Thiết kế bộ nhận diện, ấn phẩm mạng xã hội và minh họa cho các dự án startup. Tham gia buổi review thiết kế hằng tuần với Art Director.',
  requirements: 'Sử dụng tốt Illustrator và Photoshop, có portfolio cá nhân.' }, { skills: ['Adobe Illustrator', 'Photoshop', 'Figma'], deadlineDays: 30 });
await job(vng, vngCo, { title: 'Thực tập sinh Mobile (Flutter)', industry: 'cong-nghe-thong-tin', city: 'TP. Hồ Chí Minh', address: 'VNG Campus, Quận 7',
  work_type: 'hybrid', schedule: 'full_time', duration_months: 6, openings: 3, stipend_min: 9000000, stipend_max: 12000000, department: 'Mobile',
  target_study_years: [3, 4], perks: ['Cấp Macbook', 'Cơm trưa', 'Thiết bị test'],
  description: 'Phát triển tính năng trên ứng dụng di động hàng chục triệu người dùng bằng Flutter: xây dựng màn hình, tối ưu hiệu năng và viết widget test.',
  requirements: 'Biết Dart/Flutter hoặc Kotlin/Swift, hiểu REST API và quản lý state.' }, { skills: ['Flutter', 'Dart', 'Git'], deadlineDays: 40 });
await job(vng, vngCo, { title: 'Thực tập sinh Phân tích dữ liệu Game', industry: 'du-lieu', city: 'TP. Hồ Chí Minh', address: 'VNG Campus, Quận 7',
  work_type: 'onsite', schedule: 'full_time', duration_months: 4, openings: 2, stipend_min: 8000000, stipend_max: 11000000, department: 'Data',
  target_study_years: [3, 4], target_majors: ['Khoa học dữ liệu', 'Toán ứng dụng'], perks: ['Cấp Macbook', 'Cơm trưa'],
  description: 'Phân tích hành vi người chơi, đo lường A/B test cho tính năng mới và xây dựng dashboard theo dõi chỉ số giữ chân người dùng.',
  requirements: 'Thành thạo SQL, biết Python (pandas). Có kiến thức thống kê cơ bản.' }, { skills: ['SQL', 'Python', 'Power BI'], deadlineDays: 26 });

// --- New fictional companies in other fields and cities ---------------------------------------
const mekong = await signIn('mekong', { role: 'employer', full_name: 'Võ Thanh Tâm' });
const mekongCo = await company(mekong, { name: 'Mekong Logistics', tax_code: '1801234567', industry: 'logistics', city: 'Cần Thơ',
  address: 'KCN Trà Nóc, Bình Thủy, Cần Thơ', website: 'https://mekonglogistics.example.com', company_size: '200-500', founded_year: 2012,
  description: 'Doanh nghiệp vận tải và kho bãi khu vực Đồng bằng sông Cửu Long, quản lý hơn 300 xe tải và 5 trung tâm phân phối.' });
await setLogo(mekong, mekongCo, 'mekong-logistics');
await job(mekong, mekongCo, { title: 'Thực tập sinh Điều phối vận tải', industry: 'logistics', city: 'Cần Thơ', address: 'KCN Trà Nóc, Cần Thơ',
  work_type: 'onsite', schedule: 'full_time', duration_months: 3, openings: 3, stipend_min: 4000000, stipend_max: 6000000, department: 'Vận hành',
  target_study_years: [3, 4], target_majors: ['Logistics', 'Quản trị chuỗi cung ứng'], perks: ['Hỗ trợ ăn trưa', 'Xe đưa đón'],
  description: 'Lập lịch xe hằng ngày, theo dõi đơn hàng trên hệ thống TMS, phối hợp với tài xế và kho để giao hàng đúng hẹn cho khách hàng khu vực miền Tây.',
  requirements: 'Thành thạo Excel, giao tiếp tốt qua điện thoại, chịu được áp lực thời gian.' }, { skills: ['Excel'], deadlineDays: 32 });
await job(mekong, mekongCo, { title: 'Thực tập sinh Phân tích chuỗi cung ứng', industry: 'logistics', city: 'TP. Hồ Chí Minh', address: 'Văn phòng Quận Tân Bình, TP.HCM',
  work_type: 'hybrid', schedule: 'full_time', duration_months: 4, openings: 1, stipend_min: 6000000, stipend_max: 8000000, department: 'Kế hoạch',
  target_study_years: [3, 4], perks: ['Mentor 1-1', 'Đào tạo Power BI'],
  description: 'Phân tích tồn kho và chi phí vận chuyển, đề xuất phương án tối ưu tuyến và lập báo cáo tuần cho ban giám đốc bằng Power BI.',
  requirements: 'Biết Excel nâng cao, SQL cơ bản; tư duy phân tích tốt.' }, { skills: ['Excel', 'SQL', 'Power BI'], deadlineDays: 24 });

const lotus = await signIn('lotus', { role: 'employer', full_name: 'Đỗ Thu Trang' });
const lotusCo = await company(lotus, { name: 'Lotus Retail', tax_code: '0107654321', industry: 'kinh-doanh', city: 'Hà Nội',
  address: 'Đống Đa, Hà Nội', website: 'https://lotusretail.example.com', company_size: '500-1000', founded_year: 2010,
  description: 'Chuỗi bán lẻ đồ gia dụng với 60 cửa hàng tại miền Bắc và kênh thương mại điện tử đang tăng trưởng nhanh.' });
await setLogo(lotus, lotusCo, 'lotus-retail');
await job(lotus, lotusCo, { title: 'Thực tập sinh Kinh doanh & Phát triển thị trường', industry: 'kinh-doanh', city: 'Hà Nội', address: 'Đống Đa, Hà Nội',
  work_type: 'onsite', schedule: 'full_time', duration_months: 3, openings: 4, stipend_min: 5000000, stipend_max: 7000000, department: 'Kinh doanh',
  target_study_years: [3, 4], target_majors: ['Quản trị kinh doanh', 'Kinh doanh quốc tế'], perks: ['Thưởng theo doanh số', 'Phụ cấp đi lại'],
  description: 'Khảo sát thị trường, tìm kiếm đối tác phân phối mới và hỗ trợ đội bán hàng doanh nghiệp chuẩn bị báo giá, hợp đồng và chăm sóc khách hàng.',
  requirements: 'Giao tiếp tự tin, chủ động; dùng tốt Excel và PowerPoint.' }, { skills: ['Excel', 'PowerPoint'], deadlineDays: 30 });
await job(lotus, lotusCo, { title: 'Thực tập sinh Kế toán', industry: 'ke-toan-kiem-toan', city: 'Hà Nội', address: 'Đống Đa, Hà Nội',
  work_type: 'onsite', schedule: 'full_time', duration_months: 3, openings: 2, stipend_min: 4000000, stipend_max: 6000000, department: 'Tài chính - Kế toán',
  target_study_years: [3, 4], target_majors: ['Kế toán', 'Kiểm toán'], perks: ['Hỗ trợ ăn trưa', 'Xác nhận thực tập'],
  description: 'Hạch toán chứng từ, đối chiếu công nợ nhà cung cấp, hỗ trợ lập báo cáo thuế hằng tháng trên phần mềm MISA dưới sự hướng dẫn của kế toán trưởng.',
  requirements: 'Nắm vững nguyên lý kế toán, Excel thành thạo. Biết MISA là lợi thế.' }, { skills: ['Excel', 'MISA'], deadlineDays: 22 });
await job(lotus, lotusCo, { title: 'Thực tập sinh Nhân sự (Tuyển dụng)', industry: 'nhan-su', city: 'Hà Nội', address: 'Đống Đa, Hà Nội',
  work_type: 'hybrid', schedule: 'part_time', duration_months: 3, openings: 1, stipend_min: 4000000, stipend_max: 5000000, department: 'Nhân sự',
  target_study_years: [3, 4], perks: ['Giờ làm linh hoạt'],
  description: 'Đăng tin, sàng lọc hồ sơ, sắp xếp lịch phỏng vấn cho vị trí bán hàng tại cửa hàng và hỗ trợ tổ chức chương trình hội nhập nhân viên mới.',
  requirements: 'Cẩn thận, giao tiếp tốt; sinh viên ngành Quản trị nhân lực hoặc liên quan.' }, { skills: ['Excel'], deadlineDays: 27 });

const green = await signIn('greenedu', { role: 'employer', full_name: 'Nguyễn Hải Yến' });
const greenCo = await company(green, { name: 'GreenEdu', tax_code: '0401122334', industry: 'giao-duc', city: 'Đà Nẵng',
  address: 'Hải Châu, Đà Nẵng', website: 'https://greenedu.example.com', company_size: '50-200', founded_year: 2018,
  description: 'Công ty giáo dục công nghệ dạy lập trình và kỹ năng số cho học sinh, với các lớp trực tuyến và trung tâm tại Đà Nẵng.' });
await setLogo(green, greenCo, 'greenedu');
await job(green, greenCo, { title: 'Thực tập sinh Thiết kế nội dung học liệu', industry: 'giao-duc', city: 'Đà Nẵng', address: 'Hải Châu, Đà Nẵng',
  work_type: 'remote', schedule: 'flexible', duration_months: 3, openings: 2, stipend_min: 4000000, stipend_max: 6000000, department: 'Học liệu',
  target_study_years: [2, 3, 4], perks: ['Remote 100%', 'Giờ làm linh hoạt'],
  description: 'Biên soạn bài giảng, bài tập tương tác và video ngắn cho khóa học lập trình thiếu nhi; phối hợp với giáo viên để kiểm thử nội dung với học sinh.',
  requirements: 'Viết tốt, yêu thích giáo dục. Biết Canva hoặc công cụ dựng video là lợi thế.' }, { skills: ['Canva', 'Content Writing'], deadlineDays: 33 });
await job(green, greenCo, { title: 'Thực tập sinh Trợ giảng lập trình', industry: 'giao-duc', city: 'Đà Nẵng', address: 'Hải Châu, Đà Nẵng',
  work_type: 'onsite', schedule: 'part_time', duration_months: 4, openings: 3, stipend_min: 3000000, stipend_max: 5000000, department: 'Đào tạo',
  target_study_years: [2, 3, 4], target_majors: ['Công nghệ thông tin'], perks: ['Lịch làm cuối tuần', 'Chứng nhận trợ giảng'],
  description: 'Hỗ trợ giáo viên trong lớp Scratch và Python cho học sinh 10-15 tuổi: hướng dẫn bài tập, chấm dự án cuối khóa và liên lạc với phụ huynh.',
  requirements: 'Biết Python cơ bản, kiên nhẫn và thích làm việc với trẻ em.' }, { skills: ['Python', 'Scratch'], deadlineDays: 36 });

console.log(`\nDone. New employers (password ${PASSWORD}): mekong@, lotus@, greenedu@${DOMAIN}`);
