import { requireSignIn, safeReturnPath } from '../lib/auth';
import { read, write } from '../lib/storage';
import { dialog, toast } from '../components/feedback';
import { routes } from '../lib/navigation';

export function saveForm(page: string) {
  const values: Record<string,string|boolean> = {};
  document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select').forEach((el,i) => {
    if (el.type === 'password' || el.type === 'file') return;
    const key=el.id || (el.type==='radio'?`${el.name}:${el.value}`:el.name) || `field-${i}`;
    values[key] = el instanceof HTMLInputElement && ['checkbox','radio'].includes(el.type) ? el.checked : el.value;
  });
  write(`form:${page}`, values); toast('Đã lưu trên trình duyệt của bạn.');
}
export function setupForms(page: string) {
  if (page==='cv-builder') {
    for(const field of ['email','phone','location']){
      const input=document.getElementById(`input-${field}`) as HTMLInputElement|null;
      const preview=document.getElementById(`preview-${field}`);
      input?.addEventListener('input',()=>{if(preview)preview.textContent=input.value;});
    }
  }
  if (['cv-builder','post-job'].includes(page)) {
    const saved = read<Record<string,string|boolean>>(`form:${page}`, {});
    document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select').forEach((el,i) => {
      const value = saved[el.id || (el.type==='radio'?`${el.name}:${el.value}`:el.name) || `field-${i}`];
      if (value === undefined) return;
      if (typeof value === 'boolean' && el instanceof HTMLInputElement) el.checked = value;
      else el.value = String(value);
      el.dispatchEvent(new Event('input',{bubbles:true}));
    });
  }
  if (['login','register'].includes(page)) {
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
      const next = safeReturnPath(new URLSearchParams(location.search).get('next'));
      location.assign(next || (['recruiter','employer'].includes(role) ? routes.employer : role==='university' ? routes.university : routes.jobs));
    }));
  }
  document.querySelectorAll('form').forEach(form => {
    if (['login','register','jobs','post-job','university'].includes(page)) return;
    form.addEventListener('submit', e => {e.preventDefault();toast('Đã lưu yêu cầu demo trên trình duyệt. Chưa gửi đến máy chủ.');});
  });
}
export function apply(job?: string) {
  if (!requireSignIn()) return;
  const title = job || document.querySelector('h1')?.textContent?.trim() || 'Software Engineering Intern';
  dialog('Ứng tuyển — ' + title, '<p>Hồ sơ ứng tuyển demo được lưu trên trình duyệt.</p><label>Email liên hệ<input name="email" type="email" required placeholder="ban@example.com"></label><label>Thư giới thiệu<textarea name="letter" placeholder="Giới thiệu ngắn về bạn..."></textarea></label>', 'Lưu đơn ứng tuyển', form => {
    const entries = read<string[]>('applications', []); if (!entries.includes(title)) entries.push(title);
    write('applications', entries);
    const details=read<Record<string,unknown>>('application-details',{});
    details[title]={email:(form.elements.namedItem('email') as HTMLInputElement).value,letter:(form.elements.namedItem('letter') as HTMLTextAreaElement).value,status:'Đã nộp',time:new Date().toISOString()};write('application-details',details);
    toast('Đã lưu đơn ứng tuyển demo.');
  });
}
