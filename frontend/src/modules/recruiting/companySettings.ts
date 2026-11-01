// /pages/company-settings/ (Phase 5): create/edit the company, logo & cover, page content
// (companies.profile), verification documents + submit, team members.
import { flash } from '../../core/auth';
import { companyHref } from '../../core/navigation';
import { dialog, toast } from '../../core/ui/feedback';
import { bind, esc } from '../../core/ui/actions';
import { showError } from '../../core/errors';
import { formatDateTime, verifyStatusLabel } from '../../core/format';
import { el } from '../../core/render';
import { publicUrl } from '../../core/supabase';
import { currentProfile } from '../../core/session';
import { initialsAvatar } from '../../core/layout/siteHeader';
import type { CompanyProfile } from '../../core/models';
import {
  addMember, createCompany, deleteDocument, documentUrl, listDocuments, listIndustries, listMembers, myCompany,
  removeMember, setMemberRole, submitVerification, updateCompany, uploadCompanyAsset, uploadDocument,
  type CompanyFields, type MyCompany,
} from './api';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const roleNames: Record<string, string> = { owner: 'Chủ sở hữu', admin: 'Quản lý', recruiter: 'Nhà tuyển dụng' };
const docNames: Record<string, string> = { business_license: 'Giấy phép kinh doanh', tax_certificate: 'Giấy chứng nhận đăng ký thuế', authorization_letter: 'Giấy ủy quyền', other: 'Khác' };

function banner(company: MyCompany) {
  const box = $('verification-banner');
  const text: Record<string, [string, string]> = {
    unverified: ['ei-banner-warning', 'Chưa xác thực. Nhập mã số thuế, tải lên giấy phép kinh doanh rồi bấm "Gửi thẩm định".'],
    pending: ['ei-banner', 'Đang chờ quản trị viên thẩm định. Bạn sẽ nhận được thông báo khi có kết quả.'],
    verified: ['ei-banner-success', 'Doanh nghiệp đã được xác thực (tích xanh). Bạn có thể đăng tin tuyển dụng.'],
    rejected: ['ei-banner-danger', `Hồ sơ thẩm định bị từ chối${company.verification_note ? `: ${company.verification_note}` : ''}. Cập nhật giấy tờ và gửi lại.`],
    revoked: ['ei-banner-danger', `Huy hiệu xác thực đã bị thu hồi${company.verification_note ? `: ${company.verification_note}` : ''}. Các tin đang tuyển đã bị tạm dừng.`],
  };
  const [kind, message] = text[company.verification_status];
  box.className = `ei-banner ${kind}`;
  box.replaceChildren(el('strong', {}, `${verifyStatusLabel[company.verification_status]}. `), message);
  box.hidden = false;
}

function readCompanyForm(form: HTMLFormElement): CompanyFields {
  const v = (name: string) => ((form.elements.namedItem(name) as HTMLInputElement).value || '').trim();
  return {
    name: v('name'), tax_code: v('tax_code').replace(/\s/g, '') || null, industry_id: v('industry_id') ? Number(v('industry_id')) : null,
    company_size: v('company_size') || null, founded_year: v('founded_year') ? Number(v('founded_year')) : null,
    website: v('website') || null, city: v('city') || null, address: v('address') || null, description: v('description') || null,
  };
}

export async function setupCompanySettings() {
  const form = $<HTMLFormElement>('company-form');
  const errorBox = form.querySelector<HTMLElement>('.app-form-error')!;
  const industries = await listIndustries().catch(() => []);
  $<HTMLSelectElement>('industry').append(...industries.map(i => new Option(i.name, String(i.id))));
  let company = await myCompany().catch(error => { showError(error); return null; });
  const manager = () => !company || company.member_role !== 'recruiter';

  function fillCompany(c: MyCompany) {
    const set = (name: string, value: unknown) => { (form.elements.namedItem(name) as HTMLInputElement).value = value == null ? '' : String(value); };
    set('name', c.name); set('tax_code', c.tax_code); set('industry_id', c.industry_id); set('company_size', c.company_size);
    set('founded_year', c.founded_year); set('website', c.website); set('city', c.city); set('address', c.address); set('description', c.description);
    $('settings-title').textContent = `Hồ sơ doanh nghiệp — ${c.name}`;
    $<HTMLButtonElement>('company-save').textContent = 'Lưu thông tin';
    banner(c);
    $('company-extra').hidden = false;
    ($<HTMLAnchorElement>('view-company')).href = companyHref(c.id);
    $<HTMLImageElement>('logo-preview').src = publicUrl('company-assets', c.logo_path) || initialsAvatar(c.name);
    $('cover-preview').style.backgroundImage = c.cover_path ? `url('${publicUrl('company-assets', c.cover_path)}')` : '';
    const p = (c.profile ?? {}) as CompanyProfile;
    const pf = $<HTMLFormElement>('profile-form');
    const setP = (name: string, value: string | undefined) => { (pf.elements.namedItem(name) as HTMLInputElement).value = value ?? ''; };
    setP('tagline', p.tagline); setP('mission', p.mission); setP('vision', p.vision); setP('office', p.office);
    setP('program_title', p.program?.title); setP('program_description', p.program?.description);
    setP('culture', (p.culture ?? []).join('\n')); setP('hr_email', p.hr_email); setP('hotline', p.hotline);
    setP('mentors', (p.mentors ?? []).map(m => [m.name, m.title, m.expertise].filter(Boolean).join(' | ')).join('\n'));
    // Recruiters (non-managers) see the page read-only
    if (!manager()) document.querySelectorAll<HTMLElement>('#company-settings :is(input,select,textarea,button[type=submit],#submit-verification,label.ei-button)').forEach(e => {
      (e as HTMLInputElement).disabled = true; e.setAttribute('aria-disabled', 'true');
    });
  }

  if (company) fillCompany(company);
  else {
    $('settings-title').textContent = 'Tạo hồ sơ doanh nghiệp';
    $<HTMLButtonElement>('company-save').textContent = 'Tạo hồ sơ doanh nghiệp';
    const name = currentProfile()?.full_name;
    if (name) $<HTMLInputElement>('company-name').placeholder = `VD: Công ty của ${name}`;
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    errorBox.hidden = true;
    if (!form.reportValidity()) return;
    const fields = readCompanyForm(form);
    const button = $<HTMLButtonElement>('company-save');
    button.disabled = true;
    try {
      if (!company) {
        await createCompany(fields);
        flash('Đã tạo hồ sơ doanh nghiệp. Tiếp theo: tải lên giấy phép kinh doanh và gửi thẩm định.');
        location.reload();
        return;
      }
      const identityChanged = company.verification_status === 'verified' && (fields.name !== company.name || fields.tax_code !== company.tax_code);
      if (identityChanged && !confirm('Đổi tên hoặc mã số thuế sẽ hủy trạng thái xác thực và cần thẩm định lại. Tiếp tục?')) return;
      await updateCompany(company.id, fields);
      company = await myCompany();
      if (company) fillCompany(company);
      toast('Đã lưu thông tin doanh nghiệp.');
    } catch (error) { showError(error, errorBox); }
    finally { button.disabled = false; }
  });

  if (!company) return;
  const companyId = company.id;

  // Logo & cover
  for (const kind of ['logo', 'cover'] as const) {
    $<HTMLInputElement>(`${kind}-file`).addEventListener('change', async e => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast('Ảnh tối đa 5MB.'); return; }
      try { await uploadCompanyAsset(companyId, kind, file); company = await myCompany(); if (company) fillCompany(company); toast(kind === 'logo' ? 'Đã cập nhật logo.' : 'Đã cập nhật ảnh bìa.'); }
      catch (error) { showError(error); }
    });
  }

  // Page content (companies.profile)
  $<HTMLFormElement>('profile-form').addEventListener('submit', async event => {
    event.preventDefault();
    const f = event.currentTarget as HTMLFormElement;
    const v = (name: string) => ((f.elements.namedItem(name) as HTMLInputElement).value || '').trim();
    const profile: CompanyProfile = {
      tagline: v('tagline') || undefined, mission: v('mission') || undefined, vision: v('vision') || undefined, office: v('office') || undefined,
      hr_email: v('hr_email') || undefined, hotline: v('hotline') || undefined,
      program: v('program_title') || v('program_description') ? { title: v('program_title') || undefined, description: v('program_description') || undefined } : undefined,
      culture: v('culture').split('\n').map(s => s.trim()).filter(Boolean),
      mentors: v('mentors').split('\n').map(line => line.split('|').map(s => s.trim())).filter(([name]) => name).map(([name, title, expertise]) => ({ name, title, expertise })),
    };
    try { await updateCompany(companyId, { profile: JSON.parse(JSON.stringify(profile)) }); toast('Đã lưu nội dung trang công ty.'); }
    catch (error) { showError(error); }
  });

  // Documents & verification
  async function renderDocuments() {
    const list = $('documents');
    try {
      const docs = await listDocuments(companyId);
      if (!docs.length) { list.replaceChildren(el('li', { className: 'ei-muted' }, 'Chưa có giấy tờ nào.')); return; }
      list.replaceChildren(...docs.map(d => {
        const open = el('button', { type: 'button', className: 'ei-button' }, 'Mở');
        open.addEventListener('click', async () => { try { window.open(await documentUrl(d.file_path), '_blank', 'noopener'); } catch (error) { showError(error); } });
        const actions = el('span', { className: 'ei-actions' }, open);
        if (d.status === 'pending' && manager()) {
          const remove = el('button', { type: 'button', className: 'ei-button ei-button-danger' }, 'Xóa');
          remove.addEventListener('click', () => dialog('Xóa giấy tờ', `<p>Xóa ${esc(docNames[d.doc_type] ?? d.doc_type)}?</p>`, 'Xóa', async () => {
            try { await deleteDocument(d.id, d.file_path); await renderDocuments(); } catch (error) { showError(error); }
          }));
          actions.append(remove);
        }
        return el('li', { className: 'ei-row' },
          el('span', {}, el('strong', {}, docNames[d.doc_type] ?? d.doc_type), ' ', el('span', { className: `ei-chip ei-chip-${d.status}` }, verifyStatusLabel[d.status] ?? d.status),
            el('br'), el('small', { className: 'ei-muted' }, `${formatDateTime(d.created_at)}${d.review_note ? ` · ${d.review_note}` : ''}`)),
          actions);
      }));
    } catch (error) { showError(error, list); }
  }
  await renderDocuments();
  $<HTMLFormElement>('document-form').addEventListener('submit', async event => {
    event.preventDefault();
    const f = event.currentTarget as HTMLFormElement;
    const file = (f.elements.namedItem('file') as HTMLInputElement).files?.[0];
    if (!file) { toast('Vui lòng chọn tệp.'); return; }
    if (file.size > 10 * 1024 * 1024) { toast('Tệp tối đa 10MB.'); return; }
    try { await uploadDocument(companyId, (f.elements.namedItem('doc_type') as HTMLSelectElement).value, file); f.reset(); await renderDocuments(); toast('Đã tải lên giấy tờ.'); }
    catch (error) { showError(error); }
  });
  bind($('submit-verification'), async () => {
    try {
      await submitVerification(companyId);
      company = await myCompany(); if (company) fillCompany(company);
      toast('Đã gửi hồ sơ thẩm định. Quản trị viên sẽ phản hồi sớm.');
    } catch (error) { showError(error); }
  });

  // Team members
  async function renderMembers() {
    const list = $('members');
    try {
      const members = await listMembers(companyId);
      const me = currentProfile()?.id;
      list.replaceChildren(...members.map(m => {
        const profile = m.profile as { full_name?: string; email?: string } | null;
        const row = el('li', { className: 'ei-row' }, el('span', {}, el('strong', {}, profile?.full_name || profile?.email || m.user_id), el('br'), el('small', { className: 'ei-muted' }, profile?.email ?? '')));
        const controls = el('span', { className: 'company-settings-member' });
        if (manager() && m.user_id !== me) {
          const select = el('select', { 'aria-label': `Vai trò của ${profile?.full_name ?? ''}` });
          select.append(...Object.entries(roleNames).map(([v, t]) => new Option(t, v)));
          select.value = m.member_role;
          select.addEventListener('change', async () => { try { await setMemberRole(companyId, m.user_id, select.value as never); toast('Đã cập nhật vai trò.'); } catch (error) { showError(error); select.value = m.member_role; } });
          const remove = el('button', { type: 'button', className: 'ei-button ei-button-danger' }, 'Xóa');
          remove.addEventListener('click', () => dialog('Xóa thành viên', `<p>Xóa ${esc(profile?.full_name ?? '')} khỏi đội ngũ tuyển dụng?</p>`, 'Xóa', async () => {
            try { await removeMember(companyId, m.user_id); await renderMembers(); } catch (error) { showError(error); }
          }));
          controls.append(select, remove);
        } else controls.append(el('span', { className: 'ei-chip' }, `${roleNames[m.member_role]}${m.user_id === me ? ' (bạn)' : ''}`));
        row.append(controls);
        return row;
      }));
    } catch (error) { showError(error, list); }
  }
  await renderMembers();
  $<HTMLFormElement>('member-form').addEventListener('submit', async event => {
    event.preventDefault();
    const f = event.currentTarget as HTMLFormElement;
    if (!f.reportValidity()) return;
    try {
      await addMember(companyId, (f.elements.namedItem('email') as HTMLInputElement).value.trim(), (f.elements.namedItem('role') as HTMLSelectElement).value as never);
      f.reset(); await renderMembers(); toast('Đã thêm thành viên.');
    } catch (error) { showError(error); }
  });
}
