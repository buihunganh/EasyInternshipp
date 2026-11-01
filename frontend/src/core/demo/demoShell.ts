import { dialog, toast } from '../ui/feedback';
import { label, routes, destination } from '../navigation';
import { read, write } from '../storage';
import { requireSignIn } from '../auth';
import { apply, saveForm } from '../forms';
import { bind, compose, download, field, itemContext, record, schedule, share, toggle, upload, value, video } from '../ui/actions';

/** Icon ligature spans are decorative for screen readers. */
export function markDecorativeIcons() {
  document.querySelectorAll('.material-symbols-outlined').forEach(icon=>{if(icon.tagName!=='BUTTON')icon.setAttribute('aria-hidden','true');});
}

/** "…" (more_horiz / more_vert) buttons must not submit forms. Modules attach the actual menus. */
export function prepareOptionButtons(page:string){
  if(page==='messages')return; // Conversation menus are owned by the messages module.
  for(const button of document.querySelectorAll<HTMLButtonElement>('button')){
    const icon=button.querySelector('.material-symbols-outlined')?.textContent?.trim();
    if(!['more_horiz','more_vert'].includes(icon || ''))continue;
    button.type='button';button.setAttribute('aria-label','Tùy chọn bài viết');
  }
}

/** The aria-label common controls give a button. Modules that bind a button themselves can call this to match. */
export function controlLabel(b: HTMLButtonElement) {
  const text=label(b), icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim()|| (b.classList.contains('material-symbols-outlined')?b.textContent?.trim():'')||'';
  return b.getAttribute('aria-label')||b.title||text||({'close':'Đóng','edit':'Chỉnh sửa','delete':'Xóa','bookmark':'Lưu','bookmark_border':'Lưu'} as Record<string,string>)[icon]||icon;
}

/**
 * Generic handling for every design-HTML button the modules did not bind, matched by visible label or icon.
 * Buttons created at runtime by modules are never touched (they lack data-design-button).
 * Runs AFTER module page setup: anything a module already bound (data-app-control) is skipped,
 * so a module takes over a button by binding it first.
 */
export function setupCommonControls(page:string) {
  const nativeIds=['toggle-password','toggle-pw','faq-toggle','btn-contact-career','close-modal','cancel-modal','closeDrawerBtn'];
  document.querySelectorAll<HTMLButtonElement>('button').forEach((b,i)=>{
    if(!('designButton' in b.dataset))return; // created by a module, which owns its behaviour
    if(b.dataset.appControl||b.closest('dialog')||b.matches('.role-btn')||nativeIds.includes(b.id))return;
    if(b.type==='submit'&&b.form)return;
    const text=label(b), icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim()|| (b.classList.contains('material-symbols-outlined')?b.textContent?.trim():'')||'', design=b.dataset.designClick||'';
    b.setAttribute('aria-label',controlLabel(b));
    if(/closeApplyModal/.test(design)){bind(b,()=>document.getElementById('application-dialog')?.classList.add('hidden'));return;}
    if(/applyModal/.test(design)||/^(Ứng tuyển ngay|Nộp đơn ứng tuyển)$/i.test(text)){bind(b,()=>apply(design.match(/'([^']+)'/)?.[1]));return;}
    if(/theo dõi/i.test(text)){toggle(b,`demo-follow:${page}:${b.id||i}`,text,page==='university'?'Đang theo dõi việc làm':'Đang theo dõi');return;}
    if(['bookmark','bookmark_border'].includes(icon)){
      const title=itemContext(b).querySelector('h3,h2')?.textContent?.trim()||document.querySelector('h1')?.textContent?.trim()||'Công việc';
      const render=()=>{const active=read<string[]>('saved-jobs',[]).includes(title);b.setAttribute('aria-pressed',String(active));b.querySelector('span')!.textContent=active?'bookmark':'bookmark_border';};
      bind(b,()=>{if(!requireSignIn())return;const jobs=read<string[]>('saved-jobs',[]);write('saved-jobs',jobs.includes(title)?jobs.filter(x=>x!==title):[...jobs,title]);render();toast('Đã cập nhật việc làm đã lưu.');});render();return;
    }
    if(/Video|Vào Video/i.test(text)||icon==='videocam'){bind(b,video);return;}
    if(/lịch|Mentoring/i.test(text)||['event','calendar_month'].includes(icon)){bind(b,()=>schedule(text||'Đề xuất lịch hẹn'));return;}
    if(/Gửi mail|Mời ứng tuyển|Kết nối|Gửi lời mời/.test(text)){bind(b,()=>compose(text));return;}
    if(/Chia sẻ|Xuất liên kết/.test(text)||icon==='share'){bind(b,()=>share('Chia sẻ liên kết'));return;}
    if(/Lưu.*(nháp|hồ sơ)|Lưu &/i.test(text)){bind(b,()=>saveForm(page));return;}
    if(/Bật thông báo ngay/.test(text)){bind(b,()=>{const email=b.parentElement?.querySelector('input');if(email)email.required=true;if(!email?.value||!email.checkValidity()){email?.reportValidity();toast('Vui lòng nhập email hợp lệ để nhận thông báo.');return;}write('job-alert',email.value);toast('Đã bật thông báo việc làm demo.');});return;}
    if(/Về Công Ty|Hồ sơ công ty|trang tuyển dụng công ty/i.test(text)){bind(b,()=>location.assign(routes.company));return;}
    if(/Chi Tiết Công Việc|Xem thêm/i.test(text)){bind(b,()=>{const target=document.querySelector('main h2');target?.scrollIntoView({behavior:'smooth',block:'center'});if(/Xem thêm/i.test(text))dialog('Thông tin công việc','<p>Lộ trình demo: làm quen dự án tuần 1–2, thực hành cùng mentor tuần 3–8 và tổng kết sản phẩm tuần 9–12.</p>','Đóng');});return;}
    if(/Tải|download/.test(text)||icon==='download'){bind(b,()=>download('tai-lieu-demo.txt','TÀI LIỆU THAM KHẢO DEMO\nChuẩn bị CV, portfolio, kỹ năng chuyên môn và câu hỏi phỏng vấn.'));return;}
    if(/photo_camera/.test(icon)){bind(b,()=>upload('Cập nhật ảnh','image/*',file=>{const img=itemContext(b).querySelector('img');if(img){const url=URL.createObjectURL(file);img.src=url;img.onload=()=>URL.revokeObjectURL(url);}}));return;}
    const href=destination(text);if(href){bind(b,()=>location.assign(href));return;}
    // Secondary calls to action use an editable request with an observable local result.
    b.dataset.demoFallback='true';
    bind(b,()=>dialog(text||b.title||'Tùy chọn',field('name','Tên yêu cầu',text||b.title||'Yêu cầu')+'<label>Ghi chú<textarea name="note" placeholder="Nhập nội dung để thử quy trình..."></textarea></label>','Lưu yêu cầu demo',form=>{record('inquiries',{name:value(form,'name'),note:value(form,'note')});toast('Đã lưu yêu cầu trên trình duyệt.');}));
  });
  // Keep informational/footer destinations in the preview instead of sending users to unrelated pages.
  document.querySelectorAll<HTMLAnchorElement>('footer a').forEach(a=>{
    const text=label(a);if(/Về chúng tôi|Chính sách|Quy chế|Thỏa thuận|Câu hỏi|Thông cáo|Giải quyết|Facebook|Youtube/.test(text)||a.getAttribute('href')==='#')bind(a,()=>dialog(text||a.getAttribute('aria-label')||'Thông tin','<p>Internships.io kết nối sinh viên, nhà tuyển dụng và trường đại học.</p><p>Đây là nội dung xem trước. Các chính sách và kênh liên hệ sẽ được hoàn thiện khi nền tảng ra mắt.</p>','Đóng'));
    else if(/Liên hệ|Gửi thông tin/.test(text)&&!a.href.startsWith('mailto:'))bind(a,()=>compose('Liên hệ Internships.io','partner@internships.io'));
  });
  document.querySelectorAll<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>('input,select,textarea').forEach((el,i)=>{
    if(el.labels?.length||el.hasAttribute('aria-label'))return;
    el.setAttribute('aria-label',el.parentElement?.querySelector('label')?.textContent?.trim()||el.getAttribute('placeholder')||el.id||`Trường thông tin ${i+1}`);
  });
}
