-- =============================================================================
-- EasyInternshipp — reference data (safe to re-run)
-- `supabase db reset` runs this automatically after the migrations.
-- On a hosted project, paste it into the SQL editor once.
-- =============================================================================

insert into public.universities (name, short_name, city, email_domain, website) values
  ('Trường Đại học Bách khoa - ĐHQG TP.HCM',               'HCMUT', 'TP. Hồ Chí Minh', 'hcmut.edu.vn', 'https://hcmut.edu.vn'),
  ('Đại học Bách khoa Hà Nội',                             'HUST',  'Hà Nội',          'hust.edu.vn',  'https://hust.edu.vn'),
  ('Trường Đại học Công nghệ Thông tin - ĐHQG TP.HCM',     'UIT',   'TP. Hồ Chí Minh', 'uit.edu.vn',   'https://uit.edu.vn'),
  ('Trường Đại học Khoa học Tự nhiên - ĐHQG TP.HCM',       'HCMUS', 'TP. Hồ Chí Minh', 'hcmus.edu.vn', 'https://hcmus.edu.vn'),
  ('Đại học Kinh tế TP.HCM',                               'UEH',   'TP. Hồ Chí Minh', 'ueh.edu.vn',   'https://ueh.edu.vn'),
  ('Trường Đại học Ngoại thương',                          'FTU',   'Hà Nội',          'ftu.edu.vn',   'https://ftu.edu.vn'),
  ('Học viện Công nghệ Bưu chính Viễn thông',              'PTIT',  'Hà Nội',          'ptit.edu.vn',  'https://ptit.edu.vn'),
  ('Trường Đại học FPT',                                   'FPTU',  'Hà Nội',          'fpt.edu.vn',   'https://fpt.edu.vn'),
  ('Trường Đại học Bách khoa - Đại học Đà Nẵng',           'DUT',   'Đà Nẵng',         'dut.udn.vn',   'https://dut.udn.vn')
on conflict (name) do nothing;

insert into public.industries (slug, name) values
  ('cong-nghe-thong-tin', 'Công nghệ thông tin'),
  ('marketing',           'Marketing & Truyền thông'),
  ('tai-chinh-ngan-hang', 'Tài chính - Ngân hàng'),
  ('ke-toan-kiem-toan',   'Kế toán - Kiểm toán'),
  ('thiet-ke',            'Thiết kế & Sáng tạo'),
  ('kinh-doanh',          'Kinh doanh & Bán hàng'),
  ('nhan-su',             'Nhân sự'),
  ('ky-thuat',            'Kỹ thuật & Sản xuất'),
  ('logistics',           'Logistics & Chuỗi cung ứng'),
  ('du-lieu',             'Dữ liệu & Phân tích'),
  ('giao-duc',            'Giáo dục'),
  ('y-te',                'Y tế & Dược')
on conflict (slug) do nothing;

insert into public.skills (name, slug) values
  ('JavaScript', 'javascript'), ('TypeScript', 'typescript'), ('React', 'react'), ('Vue.js', 'vue-js'),
  ('Node.js', 'node-js'), ('Python', 'python'), ('Java', 'java'), ('C#', 'c-sharp'), ('Go', 'go'),
  ('Kotlin', 'kotlin'), ('Flutter', 'flutter'), ('SQL', 'sql'), ('PostgreSQL', 'postgresql'),
  ('Docker', 'docker'), ('Git', 'git'), ('Figma', 'figma'), ('UI/UX Design', 'ui-ux-design'),
  ('Photoshop', 'photoshop'), ('Data Analysis', 'data-analysis'), ('Power BI', 'power-bi'),
  ('Excel', 'excel'), ('Machine Learning', 'machine-learning'), ('Digital Marketing', 'digital-marketing'),
  ('SEO', 'seo'), ('Content Writing', 'content-writing'), ('Tiếng Anh', 'tieng-anh'),
  ('Tiếng Nhật', 'tieng-nhat'), ('Giao tiếp', 'giao-tiep'), ('Làm việc nhóm', 'lam-viec-nhom'),
  ('Kế toán', 'ke-toan')
on conflict (slug) do nothing;

insert into public.platform_settings (key, value, description) values
  ('job_default_duration_days', '30'::jsonb,
   'Days a job stays open after approval when the employer set no deadline'),
  ('offer_default_expiry_days', '7'::jsonb,
   'Suggested number of days a candidate has to answer an offer'),
  ('default_pipeline_stages', '["Ứng tuyển mới", "Sàng lọc CV", "Phỏng vấn", "Offer", "Đã tuyển"]'::jsonb,
   'Kanban columns created for every new job'),
  ('commission_rate', '0'::jsonb,
   'Placeholder: commission rate per successful hire (UseCase_Admin "Tỷ lệ hoa hồng")'),
  ('posting_packages', '[{"code": "free", "price_vnd": 0, "max_active_jobs": 3}]'::jsonb,
   'Placeholder: job posting packages (UseCase_Admin "gói tin"); pricing is not defined in the diagrams')
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- First admin account: sign up normally, then run (service role / SQL editor):
--   update public.profiles set role = 'admin' where email = 'you@example.com';
-- -----------------------------------------------------------------------------
