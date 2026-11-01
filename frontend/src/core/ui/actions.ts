import { dialog, toast } from './feedback';
import { read, write } from '../storage';
import { label } from '../navigation';
import { isSignedIn, requireSignIn } from '../auth';

const actions = new WeakMap<Element, () => void>();
export function startActions() {
  document.addEventListener('click', event => {
    const target = (event.target as Element).closest('button,a,[data-demo-click]');
    const action = target && actions.get(target);
    if (!action) return;
    event.preventDefault(); event.stopImmediatePropagation(); action();
  }, true);
}
export function bind(element: Element | null | undefined, action: () => void) {
  if (!element) return;
  (element as HTMLElement).dataset.appControl = 'demo';
  actions.set(element, action);
}
export function button(text: string, action: () => void) {
  const el = document.createElement('button'); el.type = 'button'; el.textContent = text;
  el.className = 'demo-button'; bind(el, action); return el;
}
export const esc = (value: string) => value.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const value = (form: HTMLFormElement, name: string) => (form.elements.namedItem(name) as HTMLInputElement)?.value.trim() || '';
export const normal = (text: string) => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replaceAll('đ','d');
export function field(name: string, title: string, initial = '', type = 'text') {
  return `<label>${esc(title)}<input name="${name}" type="${type}" value="${esc(initial)}" required></label>`;
}
export function record(kind: string, data: Record<string, unknown>) {
  const entries = read<Record<string, unknown>[]>('demo:' + kind, []);
  entries.unshift({id:crypto.randomUUID(),time:new Date().toISOString(),...data});
  write('demo:' + kind, entries); return entries;
}
export function download(name: string, text: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csv(name: string, rows: string[][]) {
  download(name, '\uFEFF' + rows.map(r=>r.map(s=>'"'+s.replaceAll('"','""')+'"').join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
export function share(title = 'Chia sẻ', url = location.href) {
  const modal = dialog(title, field('url','Đường dẫn',url), 'Sao chép', () => {
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(()=>toast('Đã sao chép liên kết.')).catch(()=>toast('Hãy chọn và sao chép đường dẫn trong ô liên kết.'));
  });
  modal.querySelector<HTMLInputElement>('input')!.readOnly = true;
}
export function schedule(title: string, done?: (text: string) => void) {
  const tomorrow = new Date(Date.now()+86400000); tomorrow.setHours(9,0,0,0);
  const local = new Date(tomorrow.getTime()-tomorrow.getTimezoneOffset()*60000).toISOString().slice(0,16);
  dialog(title, '<p class="app-muted">Lịch hẹn demo — chưa gửi lời mời ra ngoài.</p>' + field('person','Người tham gia','Nguyễn Minh Thư') + field('time','Thời gian',local,'datetime-local') + field('place','Địa điểm / đường dẫn','Phòng phỏng vấn trực tuyến'), 'Lưu lịch hẹn', form=>{
    record('appointments',{person:value(form,'person'),time:value(form,'time'),place:value(form,'place'),title});
    const text = `${title}: ${value(form,'person')} · ${value(form,'time').replace('T',' ')} · ${value(form,'place')}`;
    done?.(text); toast('Đã lưu lịch hẹn demo.');
  });
}
export function compose(title: string, recipient = '', done?: (text: string)=>void) {
  dialog(title, '<p class="app-muted">Bản mô phỏng: nội dung được lưu tại đây, không gửi email thật.</p>' + field('to','Người nhận',recipient || 'student@example.com') + field('subject','Tiêu đề',title) + '<label>Nội dung<textarea name="body" required></textarea></label>', 'Gửi thử', form=>{
    record('outbox',{to:value(form,'to'),subject:value(form,'subject'),body:value(form,'body')});
    done?.(value(form,'body')); toast('Đã chuyển vào hộp thư gửi demo.');
  });
}
export function upload(title: string, accept: string, done: (file: File)=>void) {
  const modal = dialog(title, `<label>Chọn tệp<input name="file" type="file" accept="${accept}" required></label><p class="app-muted">Tệp chỉ được dùng trong bản xem thử, không tải lên máy chủ.</p>`, 'Sử dụng tệp', form=>{
    const file=(form.elements.namedItem('file') as HTMLInputElement).files?.[0]; if(file)done(file);
  }); return modal;
}
export function video() {
  const modal=dialog('Phòng phỏng vấn demo','<div class="demo-video"><span class="material-symbols-outlined">person</span><p>Phòng chờ phỏng vấn</p><small>Mô phỏng cuộc gọi — không bật camera hoặc microphone thật.</small></div><div class="demo-video-tools"></div>','Rời phòng');
  const host=modal.querySelector('.demo-video-tools')!;
  for(const title of ['Microphone','Camera']) {let enabled=false;const b=button(`${title}: tắt`,()=>{enabled=!enabled;b.textContent=`${title}: ${enabled?'bật (mô phỏng)':'tắt'}`;b.setAttribute('aria-pressed',String(enabled));});host.append(b);}
}
export function itemContext(el: Element) {
  return el.closest<HTMLElement>('article,.group,[data-demo-card]') || el.parentElement!;
}
export function toggle(el: HTMLButtonElement, key: string, off = label(el), on = 'Đang theo dõi') {
  const render=()=>{const active=isSignedIn()&&read(key,false);el.textContent=active?on:off;el.setAttribute('aria-pressed',String(active));};
  render(); bind(el,()=>{if(!requireSignIn())return;write(key,!read(key,false));render();});
}
