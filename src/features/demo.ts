import { dialog, toast } from '../components/feedback';
import { label, routes, destination } from '../lib/navigation';
import { read, write } from '../lib/storage';
import { requireSignIn, safeReturnPath } from '../lib/auth';
import { apply, saveForm } from './forms';
import { bind, button, compose, download, esc, field, itemContext, record, schedule, share, toggle, upload, value, video } from './demo/ui';
import { setupRecruiting } from './demo/recruiting';
import { setupCV } from './demo/cv';
import { setupPosting } from './demo/posting';
import { setupCommunity } from './demo/community';

export function setupDemo(page:string) {
  document.querySelectorAll('.material-symbols-outlined').forEach(icon=>{if(icon.tagName!=='BUTTON')icon.setAttribute('aria-hidden','true');});
  const note=document.createElement('aside');note.className='demo-notice';note.setAttribute('aria-label','Chế độ trải nghiệm');
  const text=document.createElement('span');text.textContent='Bản trải nghiệm · dữ liệu lưu trên trình duyệt';note.append(text,button('Đổi vai trò',()=>{
    dialog('Chọn vai trò trải nghiệm','<label>Vai trò<select name="role"><option value="student">Sinh viên</option><option value="recruiter">Nhà tuyển dụng</option><option value="university">Trường đại học</option></select></label>','Bắt đầu trải nghiệm',form=>{const role=value(form,'role');write('demo-session',{role});location.assign(role==='recruiter'?routes.employer:role==='university'?routes.university:routes.jobs);});
  }),button('Hoạt động demo',()=>{
    const groups=['outbox','appointments','inquiries','offers'];
    const content=groups.map((key,i)=>`<h3>${['Thư đã gửi thử','Lịch hẹn','Yêu cầu liên hệ','Thư mời nhận việc'][i]}</h3><ul>${read<Record<string,unknown>[]>('demo:'+key,[]).map(x=>`<li>${esc(String(x.subject||x.title||x.name||x.person||'Yêu cầu'))} · ${esc(String(x.time||''))}</li>`).join('')||'<li>Chưa có hoạt động.</li>'}</ul>`).join('');
    dialog('Hoạt động đã thực hiện',content,'Đóng');
  }));document.body.append(note);
  if(page==='employer'||page==='candidates')setupRecruiting(page);
  if(page==='cv-builder'||page==='profile')setupCV(page);
  if(page==='post-job')setupPosting();
  if(page==='community')setupCommunity();
  if(page==='job-detail'){
    const title=new URLSearchParams(location.search).get('job');if(title){document.querySelector('h1')!.textContent=title;document.title=title+' | Internships.io';}
  }
  if(['login','register'].includes(page)){
    const school=document.querySelector<HTMLSelectElement>('#university');
    document.querySelectorAll<HTMLElement>('[data-role]').forEach(b=>b.addEventListener('click',()=>{if(school){school.required=b.dataset.role==='student';school.parentElement!.parentElement!.hidden=!school.required;}document.body.dataset.demoRole=b.dataset.role;}));
    const pw=document.querySelector<HTMLInputElement>('#password');pw?.addEventListener('input',()=>{const strength=document.getElementById('strength-text');if(strength)strength.textContent=pw.value.length<8?'Cần ít nhất 8 ký tự':pw.value.length<12?'Khá':'Tốt';});
    document.querySelectorAll<HTMLAnchorElement>('a').forEach(a=>{if(/quên mật khẩu/i.test(label(a)))bind(a,()=>dialog('Lấy lại mật khẩu',field('email','Email liên hệ','','email')+'<p>Demo: bạn sẽ thấy bước đặt mật khẩu mới ngay tại đây.</p>','Tiếp tục',()=>dialog('Đặt mật khẩu mới',field('password','Mật khẩu mới','','password'),'Hoàn tất',()=>toast('Đã hoàn tất quy trình đặt lại mật khẩu demo.'))));});
  }
  if(page==='university'){
    const form=document.querySelector<HTMLFormElement>('#partner-inquiry-form');form?.addEventListener('submit',e=>{e.preventDefault();const inputs=[...form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')];record('inquiries',{name:inputs[0].value,company:inputs[1].value,email:inputs[2].value,body:inputs[3].value});document.getElementById('close-modal')?.click();toast('Đã lưu yêu cầu hợp tác demo.');});
    const modal=document.getElementById('contact-modal');modal?.setAttribute('role','dialog');modal?.setAttribute('aria-label','Liên hệ hợp tác');
    document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('close-modal')?.click();});
    document.querySelectorAll<HTMLButtonElement>('main button').forEach(b=>{const text=label(b);
      if(/Đăng ký tham gia/.test(text))bind(b,()=>dialog('Đăng ký sự kiện',field('name','Họ và tên')+field('email','Email liên hệ','','email'),'Xác nhận đăng ký',f=>{record('inquiries',{name:'Đăng ký sự kiện — '+value(f,'name'),email:value(f,'email')});b.textContent='Đã đăng ký';toast('Đã lưu đăng ký tham gia demo.');}));
      else if(/Xem chi tiết/.test(text))bind(b,()=>dialog('Thông tin sự kiện','<p>Hoạt động hướng nghiệp dành cho sinh viên: gặp gỡ doanh nghiệp, tư vấn CV và phỏng vấn thử.</p><p>Thời gian mẫu: 08:30–16:30, tại khuôn viên trường. Mang theo CV và thẻ sinh viên.</p>','Đóng'));
      else if(/Gửi đề xuất/.test(text))bind(b,()=>document.getElementById('btn-contact-career')?.click());
    });
  }
  if(page==='company'){
    document.querySelectorAll<HTMLButtonElement>('[data-design-click^="switchTab"]').forEach(b=>bind(b,()=>{
      document.querySelectorAll('[data-design-click^="switchTab"]').forEach(x=>{x.classList.remove('bg-primary','text-on-primary');x.classList.add('bg-surface-container');x.setAttribute('aria-selected',String(x===b));});b.classList.add('bg-primary','text-on-primary');
      const id=b.id.replace('tab-','');
      const target=id==='jobs'?document.getElementById('jobs-section'):[...document.querySelectorAll('h2,h3')].find(h=>id==='benefits'?/Đãi ngộ|Phúc lợi/i.test(h.textContent||''):id==='reviews'?/Đánh giá/i.test(h.textContent||''):/Về|Giới thiệu/i.test(h.textContent||''));
      if(target)target.scrollIntoView({behavior:'smooth',block:'center'});else dialog(label(b),id==='benefits'?'<p>Phụ cấp thực tập, mentor 1:1, đào tạo chuyên môn và cơ hội chuyển chính thức.</p>':'<p>Đánh giá mẫu: 4.8/5 — môi trường hỗ trợ sinh viên, mentor phản hồi hàng tuần.</p>','Đóng');
    }));
  }
  const nativeIds=['toggle-password','toggle-pw','faq-toggle','btn-contact-career','close-modal','cancel-modal','closeDrawerBtn'];
  document.querySelectorAll<HTMLButtonElement>('button').forEach((b,i)=>{
    if(b.dataset.appControl||b.closest('dialog')||b.matches('.role-btn')||nativeIds.includes(b.id))return;
    if(b.type==='submit'&&b.form)return;
    const text=label(b), icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim()|| (b.classList.contains('material-symbols-outlined')?b.textContent?.trim():'')||'', design=b.dataset.designClick||'';
    b.setAttribute('aria-label',b.getAttribute('aria-label')||b.title||text||({'close':'Đóng','edit':'Chỉnh sửa','delete':'Xóa','bookmark':'Lưu','bookmark_border':'Lưu'} as Record<string,string>)[icon]||icon);
    if(/closeApplyModal/.test(design)){bind(b,()=>document.getElementById('application-dialog')?.classList.add('hidden'));return;}
    if(/applyModal/.test(design)||/^(Ứng tuyển ngay|Nộp đơn ứng tuyển)$/i.test(text)){bind(b,()=>apply(design.match(/'([^']+)'/)?.[1]));return;}
    if(/theo dõi/i.test(text)){toggle(b,`demo-follow:${page}:${b.id||i}`,text,page==='university'?'Đang theo dõi việc làm':'Đang theo dõi');return;}
    if(['bookmark','bookmark_border'].includes(icon)){
      const title=itemContext(b).querySelector('h3,h2')?.textContent?.trim()||document.querySelector('h1')?.textContent?.trim()||'Công việc';
      const render=()=>{const active=read<string[]>('saved-jobs',[]).includes(title);b.setAttribute('aria-pressed',String(active));b.querySelector('span')!.textContent=active?'bookmark':'bookmark_border';};
      bind(b,()=>{if(!requireSignIn())return;const jobs=read<string[]>('saved-jobs',[]);write('saved-jobs',jobs.includes(title)?jobs.filter(x=>x!==title):[...jobs,title]);render();toast('Đã cập nhật việc làm đã lưu.');});render();return;
    }
    if(/Google|GitHub Dev|SSO|Email trường/.test(text)){bind(b,()=>dialog('Đăng nhập '+(/GitHub/.test(text)?'GitHub':/Google/.test(text)?'Google':'SSO trường'),' <p>Chọn tài khoản mẫu để trải nghiệm. Không kết nối tài khoản bên ngoài.</p>'+field('email','Email mẫu','demo@example.com','email'),'Tiếp tục với tài khoản mẫu',()=>{const role=document.body.dataset.demoRole||'student';write('demo-session',{role});location.assign(safeReturnPath(new URLSearchParams(location.search).get('next'))||(['employer','recruiter'].includes(role)?routes.employer:role==='university'?routes.university:'/'));}));return;}
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
    bind(b,()=>dialog(text||b.title||'Tùy chọn',field('name','Tên yêu cầu',text||b.title||'Yêu cầu')+'<label>Ghi chú<textarea name="note" placeholder="Nhập nội dung để thử quy trình..."></textarea></label>','Lưu yêu cầu demo',form=>{record('inquiries',{name:value(form,'name'),note:value(form,'note')});toast('Đã lưu. Xem lại trong Hoạt động demo.');}));
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
