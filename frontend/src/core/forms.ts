import { requireSignIn } from './auth';
import { read, write } from './storage';
import { dialog, toast } from './ui/feedback';

const fieldKey=(el:HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement,i:number)=>el.id || (el.type==='radio'?`${el.name}:${el.value}`:el.name) || `field-${i}`;

/** Save every field on the page under `form:<page>`. */
export function saveForm(page: string) {
  const values: Record<string,string|boolean> = {};
  document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select').forEach((el,i) => {
    if (el.type === 'password' || el.type === 'file') return;
    values[fieldKey(el,i)] = el instanceof HTMLInputElement && ['checkbox','radio'].includes(el.type) ? el.checked : el.value;
  });
  write(`form:${page}`, values); toast('Đã lưu trên trình duyệt của bạn.');
}

/** Restore fields saved by saveForm. Fires `input` so live previews update. */
export function restoreForm(page: string) {
  const saved = read<Record<string,string|boolean>>(`form:${page}`, {});
  document.querySelectorAll<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>('input,textarea,select').forEach((el,i) => {
    const value = saved[fieldKey(el,i)];
    if (value === undefined) return;
    if (typeof value === 'boolean' && el instanceof HTMLInputElement) el.checked = value;
    else el.value = String(value);
    el.dispatchEvent(new Event('input',{bubbles:true}));
  });
}

/** Pages whose forms are handled by a module. Every other form gets a "saved locally" toast. */
const ownForms=['login','register','jobs','post-job','university'];
export function setupGenericForms(page: string) {
  if (ownForms.includes(page)) return;
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', e => {e.preventDefault();toast('Đã lưu yêu cầu demo trên trình duyệt. Chưa gửi đến máy chủ.');});
  });
}

/** Apply-to-job dialog. Used from any page that shows an "Ứng tuyển ngay" button. */
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
