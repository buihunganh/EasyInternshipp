import { requireSignIn } from './auth';
import { read, write } from './storage';
import { toast } from './ui/feedback';

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
const ownForms=['login','register','reset-password','jobs','post-job','company-settings','applications','cv','university'];
export function setupGenericForms(page: string) {
  if (ownForms.includes(page)) return;
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', e => {e.preventDefault();toast('Đã lưu yêu cầu demo trên trình duyệt. Chưa gửi đến máy chủ.');});
  });
}

/** Apply-to-job action. The jobs module registers the real dialog; until then, guests are sent to log in. */
let applyHandler: ((jobId?: string) => void) | null = null;
export function registerApply(handler: (jobId?: string) => void) { applyHandler = handler; }
export function apply(jobId?: string) {
  if (!requireSignIn()) return;
  if (applyHandler) applyHandler(jobId);
  else toast('Vui lòng mở chi tiết tin tuyển dụng để ứng tuyển.');
}
