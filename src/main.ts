import { setupAccess, isSignedIn } from './lib/auth';
import { renderSiteHeader } from './components/siteHeader';
import { setupWorkflow } from './features/workflow';
import { renderRecruiterSidebar } from './components/recruiterSidebar';
import { setupNavigation, destination, label, routes } from './lib/navigation';
import { toast, dialog } from './components/feedback';
import { setupForms, saveForm, apply } from './features/forms';
import { setupJobs } from './features/jobs';
import { setupMessages } from './features/messages';
import { read, write } from './lib/storage';
import { setupAccount } from './features/account';
import { setupOptions } from './features/options';
import { renderSiteFooter } from './components/siteFooter';

const page=document.body.dataset.page || 'jobs';
if (setupAccess(page)) {
renderSiteFooter();
renderRecruiterSidebar(page);
renderSiteHeader(page);
setupNavigation();setupWorkflow(page);setupForms(page);
setupAccount(page);
setupOptions(page);
if(page==='jobs')setupJobs();
if(page==='messages')setupMessages();
document.querySelectorAll<HTMLButtonElement>('button').forEach(button=>{
  const icon=button.querySelector('.material-symbols-outlined')?.textContent?.trim() || '';
  if(!label(button)&&!button.getAttribute('aria-label'))button.setAttribute('aria-label',button.title || ({bookmark:'Lưu',bookmark_border:'Lưu',notifications:'Thông báo',chat:'Tin nhắn',close:'Đóng',edit:'Chỉnh sửa'} as Record<string,string>)[icon] || icon || 'Tùy chọn');
  button.addEventListener('click',()=>{
    if(button.closest('[data-app-control]'))return;
    const text=label(button), design=button.dataset.designClick || '';
    if(button.type==='submit' && button.closest('form'))return;
    if(button.title==='Lưu công việc' || button.closest('dialog'))return;
    if(/applyModal/.test(design) || /^(Ứng tuyển ngay|Nộp đơn ứng tuyển|Ứng Tuyển Ngay)$/i.test(text)){apply();return;}
    if(/closeApplyModal/.test(design)){document.getElementById('application-dialog')?.classList.add('hidden');return;}
    if(/toggleFollow/.test(design) || /theo dõi/i.test(text)) {
      if(button.id==='btn-follow-school')return;
      const key=`follow:${page}:${button.closest('li')?.textContent || text}`;const active=!read(key,false);write(key,active);button.setAttribute('aria-pressed',String(active));
      const span=button.querySelector('#txt-follow');if(span)span.textContent=active?'Đang theo dõi':'Theo dõi công ty';else button.textContent=active?'Đang theo dõi':'+ Theo dõi';return;
    }
    if(/shareProfile/.test(design)||/Chia sẻ|Xuất liên kết/.test(text)||icon==='share') {navigator.clipboard?.writeText(location.href).then(()=>toast('Đã sao chép đường dẫn.')).catch(()=>toast('Trình duyệt không cho phép sao chép.'));return;}
    if(/Lưu.*(nháp|hồ sơ)|Lưu &|^Lưu nháp$/i.test(text)){saveForm(page);return;}
    if(/Đăng tin tuyển dụng ngay/.test(text)){saveForm(page);toast('Đã lưu tin tuyển dụng demo. Chưa xuất bản lên máy chủ.');return;}
    if(/Tải PDF|Tải xuống/.test(text)){window.print();return;}
    if(/Xuất Excel/.test(text)) {
      const rows=[['Vị trí','Trạng thái'],...[...document.querySelectorAll('h2')].map(h=>[h.textContent?.trim()||'','Demo'])];
      const blob=new Blob(['\uFEFF'+rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='tuyen-dung.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;
    }
    if(/Google|GitHub Dev|SSO|Email trường|Video Call|Gửi mail/.test(text)){toast('Chức năng này cần kết nối dịch vụ backend.');return;}
    if(icon==='notifications'){dialog('Thông báo','<p>Bạn chưa có thông báo mới trong phiên demo.</p>','Đóng');return;}
    if(['chat','chat_bubble','chat_bubble_outline','forum'].includes(icon)&&button.closest('header')){location.assign(routes.messages);return;}
    if(/Đăng bài|Chia sẻ kinh nghiệm phỏng vấn/.test(text)){
      dialog('Chia sẻ với cộng đồng','<label>Nội dung<textarea name="post" required placeholder="Chia sẻ trải nghiệm của bạn..."></textarea></label>','Đăng bài',form=>{
        const value=(form.elements.namedItem('post') as HTMLTextAreaElement).value;const posts=read<string[]>('posts',[]);posts.unshift(value);write('posts',posts);renderPosts();toast('Đã đăng bài trong bản demo.');
      });return;
    }
    if(icon==='thumb_up'){button.classList.toggle('text-primary');button.setAttribute('aria-pressed',String(button.classList.contains('text-primary')));return;}
    if(/Chuyển vòng/.test(text)){button.textContent='Đã chuyển: Shortlisted';button.disabled=true;return;}
    if(/Xem CV|Chỉnh sửa hồ sơ|^Sửa$/.test(text)){location.assign(routes['cv-builder']);return;}
    if(/switchTab/.test(design)){const id=design.match(/'([^']+)'/)?.[1];const target=document.getElementById(id==='jobs'?'jobs-section':`tab-${id}`);target?.scrollIntoView({behavior:'smooth',block:'center'});return;}
    if(/Tiếp tục sang Bước 2/.test(text)){document.querySelectorAll('h2')[1]?.scrollIntoView({behavior:'smooth'});return;}
    if(/Bật thông báo ngay/.test(text)){const email=button.parentElement?.querySelector('input');if(email?.value && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value)){write('job-alert',email.value);toast('Đã lưu đăng ký nhận tin demo.');}else toast('Vui lòng nhập email hợp lệ.');return;}
    if(/Gửi tin nhắn/.test(text))return;
    const href=destination(text);if(href&&!button.classList.contains('role-btn')&&!/Đăng nhập ngay|Tạo tài khoản sinh viên/.test(text))location.assign(href);
  });
});
function renderPosts(){
  document.getElementById('demo-posts')?.remove();const posts=read<string[]>('posts',[]);if(!posts.length)return;
  const block=document.createElement('section');block.id='demo-posts';block.style.cssText='padding:24px;margin:24px;background:white;border:1px solid #dbe1ff;border-radius:12px';
  posts.forEach(post=>{const article=document.createElement('p');article.textContent=post;article.style.cssText='white-space:pre-wrap;padding:16px 0;border-bottom:1px solid #ebedff';block.append(article);});document.querySelector('main')?.prepend(block);
}
if(page==='community' && isSignedIn())renderPosts();

}
