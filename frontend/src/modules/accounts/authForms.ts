import { safeReturnPath, flash } from '../../core/auth';
import { label, routes } from '../../core/navigation';
import { dialog, toast } from '../../core/ui/feedback';
import { bind, field, value } from '../../core/ui/actions';
import { controlLabel } from '../../core/demo/demoShell';
import { currentRole, isActive, refreshProfile, roleHome, signOut, type Role } from '../../core/session';
import { showError, toAppError } from '../../core/errors';
import { el } from '../../core/render';
import { employerHasCompany, listUniversities, sendPasswordReset, signIn, signUp, updatePassword } from './api';

/** Register page role buttons → database role. */
const registerRoles: Record<string, Exclude<Role, 'admin'>> = { student: 'student', employer: 'employer', university: 'university_officer' };

const nextParam = () => safeReturnPath(new URLSearchParams(location.search).get('next'));

/** Where to go after signing in: the allow-listed `next` page if the role may open it, else the role's home. */
async function destinationAfterLogin() {
  const role = currentRole();
  const next = nextParam();
  if (role === 'employer' && !(await employerHasCompany())) return routes['company-settings'];
  if (next) {
    const path = new URL(next, location.origin).pathname;
    const studentOnly = ['/pages/profile/', '/pages/cv-builder/', '/pages/applications/'].includes(path);
    const employerOnly = ['/pages/employer/', '/pages/candidates/', '/pages/post-job/', '/pages/company-settings/'].includes(path);
    if ((!studentOnly || role === 'student') && (!employerOnly || role === 'employer')) return next;
  }
  return roleHome(role);
}

function formError(form: HTMLFormElement) {
  let box = form.querySelector<HTMLElement>('.app-form-error');
  if (!box) { box = el('p', { className: 'app-form-error', role: 'alert', hidden: true }); form.prepend(box); }
  return box;
}

function busy(button: HTMLButtonElement | null, on: boolean, text?: string) {
  if (!button) return;
  button.disabled = on;
  button.setAttribute('aria-busy', String(on));
  const span = button.querySelector('span:first-child') ?? button;
  if (on) { button.dataset.label = span.textContent || ''; span.textContent = text || 'Đang xử lý...'; }
  else if (button.dataset.label) span.textContent = button.dataset.label;
}

/** After sign-in: check the account status (BR-03, BR-02), then redirect. */
async function finishSignIn(form: HTMLFormElement) {
  const profile = await refreshProfile();
  if (!profile) throw toAppError({ message: 'Không tải được hồ sơ tài khoản.' });
  if (!isActive()) {
    await signOut();
    const box = formError(form);
    box.textContent = profile.status === 'pending_verification'
      ? 'Tài khoản cán bộ nhà trường đang chờ quản trị viên kích hoạt. Bạn sẽ nhận được thông báo khi tài khoản sẵn sàng.'
      : `Tài khoản đã bị khóa${profile.status === 'suspended' ? '' : ' hoặc ngừng hoạt động'}. Vui lòng liên hệ quản trị viên.`;
    box.hidden = false;
    return;
  }
  location.assign(await destinationAfterLogin());
}

async function setupLogin(form: HTMLFormElement) {
  if (isActive()) { location.replace(await destinationAfterLogin()); return; }
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const box = formError(form); box.hidden = true;
    busy(submit, true, 'Đang đăng nhập...');
    try {
      await signIn(value(form, 'email'), (form.elements.namedItem('password') as HTMLInputElement).value);
      await finishSignIn(form);
    } catch (error) { showError(error, box); }
    finally { busy(submit, false); }
  });
}

async function setupRegister(form: HTMLFormElement, page: string) {
  if (isActive()) { location.replace(await destinationAfterLogin()); return; }
  let role: Exclude<Role, 'admin'> = 'student';
  const school = document.querySelector<HTMLSelectElement>('#university');
  const schoolBlock = school?.closest<HTMLElement>('div:has(> label[for="university"])') ?? school?.parentElement?.parentElement ?? null;

  // Optional MSSV for students, styled like the phone field
  const phone = document.querySelector<HTMLInputElement>('#phone');
  let studentCode: HTMLInputElement | null = null;
  if (schoolBlock && phone) {
    const phoneBlock = phone.closest<HTMLElement>('div:has(> label)');
    if (phoneBlock) {
      const codeBlock = phoneBlock.cloneNode(true) as HTMLElement;
      const codeLabel = codeBlock.querySelector('label');
      studentCode = codeBlock.querySelector('input');
      if (codeLabel && studentCode) {
        codeLabel.htmlFor = 'student-code'; codeLabel.textContent = 'Mã số sinh viên (MSSV) — không bắt buộc';
        studentCode.id = 'student-code'; studentCode.type = 'text'; studentCode.required = false;
        studentCode.placeholder = 'VD: 2112345'; studentCode.value = ''; studentCode.removeAttribute('name');
        codeBlock.querySelector('.material-symbols-outlined')?.replaceChildren('badge');
        schoolBlock.after(codeBlock);
      }
    }
  }

  // Universities from the database
  if (school) {
    try {
      const universities = await listUniversities();
      const placeholder = school.querySelector('option[value=""]');
      school.replaceChildren(...[placeholder, ...universities.map(u => new Option(`${u.name}${u.short_name ? ` (${u.short_name})` : ''}`, u.id)),
        new Option('Trường khác (chưa có trong danh sách)', 'other')].filter(Boolean) as HTMLOptionElement[]);
      school.value = '';
    } catch (error) { showError(error); }
  }

  const applyRole = (next: Exclude<Role, 'admin'>) => {
    role = next;
    const needsSchool = role !== 'employer';
    if (school) { school.required = needsSchool; if (schoolBlock) schoolBlock.hidden = !needsSchool; }
    const codeBlock = studentCode?.closest<HTMLElement>('div:has(> label)');
    if (codeBlock) codeBlock.hidden = role !== 'student';
  };
  document.querySelectorAll<HTMLElement>('[data-role]').forEach(button => button.addEventListener('click', () => applyRole(registerRoles[button.dataset.role || ''] ?? 'student')));
  applyRole('student');

  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const box = formError(form); box.hidden = true;
    const pw = form.querySelector<HTMLInputElement>('#password')!;
    const confirm = form.querySelector<HTMLInputElement>('#confirm-password');
    if (pw.value.length < 8) { pw.setCustomValidity('Mật khẩu cần ít nhất 8 ký tự.'); pw.reportValidity(); pw.addEventListener('input', () => pw.setCustomValidity(''), { once: true }); return; }
    if (confirm && confirm.value !== pw.value) { confirm.setCustomValidity('Mật khẩu xác nhận chưa khớp.'); confirm.reportValidity(); confirm.addEventListener('input', () => confirm.setCustomValidity(''), { once: true }); return; }
    const universityId = school && school.value && school.value !== 'other' ? school.value : null;
    busy(submit, true, 'Đang tạo tài khoản...');
    try {
      const signedIn = await signUp({
        email: form.querySelector<HTMLInputElement>('#email')!.value.trim(), password: pw.value, role,
        full_name: form.querySelector<HTMLInputElement>('#fullname')?.value.trim() || '',
        phone: phone?.value.trim() || undefined,
        university_id: role === 'employer' ? null : universityId,
        student_code: role === 'student' ? studentCode?.value.trim() || null : null,
      });
      if (!signedIn) {
        box.textContent = 'Đăng ký thành công! Vui lòng kiểm tra email để xác nhận tài khoản trước khi đăng nhập.';
        box.classList.add('app-form-success'); box.hidden = false;
        return;
      }
      if (role === 'university_officer') {
        await signOut();
        flash('Tài khoản chờ quản trị viên kích hoạt. Bạn sẽ nhận được thông báo khi tài khoản sẵn sàng.');
        location.assign(routes.login);
        return;
      }
      await refreshProfile();
      flash(role === 'employer' ? 'Tạo tài khoản thành công! Hãy thiết lập hồ sơ doanh nghiệp để bắt đầu đăng tin.' : 'Chào mừng bạn đến với Internships.io!');
      location.assign(role === 'employer' ? routes['company-settings'] : nextParam() || routes.jobs);
    } catch (error) { showError(error, box); }
    finally { busy(submit, false); }
  });
  void page;
}

/** Login / register form submission, "?next=" handling. Runs in the forms phase. */
export async function setupAuthForms(page: string) {
  const form = document.querySelector<HTMLFormElement>('main form, form');
  if (!form) return;
  const next = nextParam();
  if (next) {
    const notice = el('p', { className: 'app-muted', role: 'status' }, 'Vui lòng đăng nhập để sử dụng chức năng này. Bạn sẽ được đưa trở lại sau khi đăng nhập.');
    form.prepend(notice);
    document.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
      if (['/pages/login/', '/pages/register/'].includes(link.pathname)) link.search = '?next=' + encodeURIComponent(next);
    });
  }
  if (page === 'login') await setupLogin(form);
  else await setupRegister(form, page);
}

/** Password strength, forgot password, social sign-in placeholders. Runs in the controls phase. */
export function setupAuthPage() {
  const pw=document.querySelector<HTMLInputElement>('#password');pw?.addEventListener('input',()=>{const strength=document.getElementById('strength-text');if(strength)strength.textContent=pw.value.length<8?'Cần ít nhất 8 ký tự':pw.value.length<12?'Khá':'Tốt';});
  document.querySelectorAll<HTMLAnchorElement>('a').forEach(a=>{
    if(!/quên mật khẩu/i.test(label(a)))return;
    bind(a,()=>dialog('Lấy lại mật khẩu',field('email','Email đăng ký','','email')+'<p class="app-muted">Chúng tôi sẽ gửi đường dẫn đặt lại mật khẩu đến email này.</p>','Gửi email',async form=>{
      try { await sendPasswordReset(value(form,'email')); toast('Đã gửi email đặt lại mật khẩu. Vui lòng kiểm tra hộp thư.'); }
      catch (error) { showError(error); }
    }));
  });
  document.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{
    if(b.dataset.appControl||b.closest('dialog')||b.matches('.role-btn')||(b.type==='submit'&&b.form))return;
    const text=label(b);
    if(!/Google|GitHub Dev|SSO|Email trường/.test(text))return;
    b.setAttribute('aria-label',controlLabel(b));
    const provider=/GitHub/.test(text)?'GitHub':/Google/.test(text)?'Google':'SSO trường';
    bind(b,()=>dialog(`Đăng nhập bằng ${provider}`,`<p>Đăng nhập bằng ${provider} sẽ sớm được hỗ trợ.</p><p class="app-muted">Hiện tại vui lòng đăng nhập bằng email và mật khẩu.</p>`,'Đã hiểu'));
  });
}

/** /pages/reset-password/: set a new password after following the recovery e-mail link. */
export function setupResetPassword() {
  const form = document.querySelector<HTMLFormElement>('#reset-password-form');
  if (!form) return;
  const box = formError(form);
  if (!isActive()) {
    box.textContent = 'Đường dẫn đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng yêu cầu email mới từ trang đăng nhập.';
    box.hidden = false;
  }
  const submit = form.querySelector<HTMLButtonElement>('button[type=submit]');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const pw = form.querySelector<HTMLInputElement>('#new-password')!;
    const confirm = form.querySelector<HTMLInputElement>('#confirm-new-password')!;
    if (pw.value.length < 8) { pw.setCustomValidity('Mật khẩu cần ít nhất 8 ký tự.'); pw.reportValidity(); pw.addEventListener('input', () => pw.setCustomValidity(''), { once: true }); return; }
    if (confirm.value !== pw.value) { confirm.setCustomValidity('Mật khẩu xác nhận chưa khớp.'); confirm.reportValidity(); confirm.addEventListener('input', () => confirm.setCustomValidity(''), { once: true }); return; }
    busy(submit, true);
    try {
      await updatePassword(pw.value);
      flash('Đã cập nhật mật khẩu mới.');
      location.assign(roleHome(currentRole()));
    } catch (error) { showError(error, box); }
    finally { busy(submit, false); }
  });
}
