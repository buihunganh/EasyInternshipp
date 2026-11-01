import { safeReturnPath } from '../../core/auth';
import { label, routes } from '../../core/navigation';
import { write } from '../../core/storage';
import { dialog, toast } from '../../core/ui/feedback';
import { bind, field } from '../../core/ui/actions';
import { controlLabel } from '../../core/demo/demoShell';

const homeFor = (role: string) => ['recruiter','employer'].includes(role) ? routes.employer : role==='university' ? routes.university : routes.jobs;

/** Login / register form submission, "?next=" handling. Runs in the forms phase. */
export function setupAuthForms(page: string) {
  const next = safeReturnPath(new URLSearchParams(location.search).get('next'));
  if (next) {
    const notice = document.createElement('p');
    notice.className = 'app-muted'; notice.setAttribute('role', 'status');
    notice.textContent = 'Vui lòng đăng nhập để sử dụng chức năng này. Bạn sẽ được đưa trở lại sau khi đăng nhập.';
    document.querySelector('form')?.prepend(notice);
    document.querySelectorAll<HTMLAnchorElement>('a').forEach(link => {
      if (['/pages/login/', '/pages/register/'].includes(link.pathname)) link.search = '?next=' + encodeURIComponent(next);
    });
  }
  let role = 'student';
  document.querySelectorAll<HTMLElement>('[data-role]').forEach(button => button.addEventListener('click', () => {role = button.dataset.role || 'student';}));
  document.querySelectorAll('form').forEach(form => form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const pw = form.querySelector<HTMLInputElement>('#password');
    if (page === 'register' && pw && pw.value.length < 8) {pw.setCustomValidity('Mật khẩu cần ít nhất 8 ký tự.');pw.reportValidity();pw.addEventListener('input',()=>pw.setCustomValidity(''),{once:true});return;}
    const passwords=form.querySelectorAll<HTMLInputElement>('#password,#confirm-password');
    if(page==='register'&&passwords.length>1&&passwords[0].value!==passwords[1].value){passwords[1].setCustomValidity('Mật khẩu xác nhận chưa khớp.');passwords[1].reportValidity();passwords[1].addEventListener('input',()=>passwords[1].setCustomValidity(''),{once:true});return;}
    // Demo session only; never persist passwords or claim backend authentication.
    write('demo-session', {role});
    location.assign(safeReturnPath(new URLSearchParams(location.search).get('next')) || homeFor(role));
  }));
}

/** Role picker, password strength, forgot password, social sign-in. Runs in the page phase. */
export function setupAuthPage() {
  const school=document.querySelector<HTMLSelectElement>('#university');
  document.querySelectorAll<HTMLElement>('[data-role]').forEach(b=>b.addEventListener('click',()=>{if(school){school.required=b.dataset.role==='student';school.parentElement!.parentElement!.hidden=!school.required;}document.body.dataset.demoRole=b.dataset.role;}));
  const pw=document.querySelector<HTMLInputElement>('#password');pw?.addEventListener('input',()=>{const strength=document.getElementById('strength-text');if(strength)strength.textContent=pw.value.length<8?'Cần ít nhất 8 ký tự':pw.value.length<12?'Khá':'Tốt';});
  document.querySelectorAll<HTMLAnchorElement>('a').forEach(a=>{if(/quên mật khẩu/i.test(label(a)))bind(a,()=>dialog('Lấy lại mật khẩu',field('email','Email liên hệ','','email')+'<p>Demo: bạn sẽ thấy bước đặt mật khẩu mới ngay tại đây.</p>','Tiếp tục',()=>dialog('Đặt mật khẩu mới',field('password','Mật khẩu mới','','password'),'Hoàn tất',()=>toast('Đã hoàn tất quy trình đặt lại mật khẩu demo.'))));});
  document.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{
    if(b.dataset.appControl||b.closest('dialog')||b.matches('.role-btn')||(b.type==='submit'&&b.form))return;
    const text=label(b);
    if(!/Google|GitHub Dev|SSO|Email trường/.test(text))return;
    b.setAttribute('aria-label',controlLabel(b));
    bind(b,()=>dialog('Đăng nhập '+(/GitHub/.test(text)?'GitHub':/Google/.test(text)?'Google':'SSO trường'),' <p>Chọn tài khoản mẫu để trải nghiệm. Không kết nối tài khoản bên ngoài.</p>'+field('email','Email mẫu','demo@example.com','email'),'Tiếp tục với tài khoản mẫu',()=>{const role=document.body.dataset.demoRole||'student';write('demo-session',{role});location.assign(safeReturnPath(new URLSearchParams(location.search).get('next'))||(['employer','recruiter'].includes(role)?routes.employer:role==='university'?routes.university:'/'));}));
  });
}
