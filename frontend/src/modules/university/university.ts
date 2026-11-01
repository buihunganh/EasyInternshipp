import { dialog, toast } from '../../core/ui/feedback';
import { label } from '../../core/navigation';
import { bind, field, record, value } from '../../core/ui/actions';

/** University page: partner inquiry modal, event registration and event details. */
export function setupUniversityPage() {
  const form=document.querySelector<HTMLFormElement>('#partner-inquiry-form');form?.addEventListener('submit',e=>{e.preventDefault();const inputs=[...form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')];record('inquiries',{name:inputs[0].value,company:inputs[1].value,email:inputs[2].value,body:inputs[3].value});document.getElementById('close-modal')?.click();toast('Đã lưu yêu cầu hợp tác demo.');});
  const modal=document.getElementById('contact-modal');modal?.setAttribute('role','dialog');modal?.setAttribute('aria-label','Liên hệ hợp tác');
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.getElementById('close-modal')?.click();});
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b=>{const text=label(b);
    if(/Đăng ký tham gia/.test(text))bind(b,()=>dialog('Đăng ký sự kiện',field('name','Họ và tên')+field('email','Email liên hệ','','email'),'Xác nhận đăng ký',f=>{record('inquiries',{name:'Đăng ký sự kiện — '+value(f,'name'),email:value(f,'email')});b.textContent='Đã đăng ký';toast('Đã lưu đăng ký tham gia demo.');}));
    else if(/Xem chi tiết/.test(text))bind(b,()=>dialog('Thông tin sự kiện','<p>Hoạt động hướng nghiệp dành cho sinh viên: gặp gỡ doanh nghiệp, tư vấn CV và phỏng vấn thử.</p><p>Thời gian mẫu: 08:30–16:30, tại khuôn viên trường. Mang theo CV và thẻ sinh viên.</p>','Đóng'));
    else if(/Gửi đề xuất/.test(text))bind(b,()=>document.getElementById('btn-contact-career')?.click());
  });
}
