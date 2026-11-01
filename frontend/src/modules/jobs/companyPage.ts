import { dialog } from '../../core/ui/feedback';
import { label } from '../../core/navigation';
import { bind } from '../../core/ui/actions';

/** Company page: the About / Jobs / Benefits / Reviews tabs scroll to their section. */
export function setupCompanyPage() {
  document.querySelectorAll<HTMLButtonElement>('[data-design-click^="switchTab"]').forEach(b=>bind(b,()=>{
    document.querySelectorAll('[data-design-click^="switchTab"]').forEach(x=>{x.classList.remove('bg-primary','text-on-primary');x.classList.add('bg-surface-container');x.setAttribute('aria-selected',String(x===b));});b.classList.add('bg-primary','text-on-primary');
    const id=b.id.replace('tab-','');
    const target=id==='jobs'?document.getElementById('jobs-section'):[...document.querySelectorAll('h2,h3')].find(h=>id==='benefits'?/Đãi ngộ|Phúc lợi/i.test(h.textContent||''):id==='reviews'?/Đánh giá/i.test(h.textContent||''):/Về|Giới thiệu/i.test(h.textContent||''));
    if(target)target.scrollIntoView({behavior:'smooth',block:'center'});else dialog(label(b),id==='benefits'?'<p>Phụ cấp thực tập, mentor 1:1, đào tạo chuyên môn và cơ hội chuyển chính thức.</p>':'<p>Đánh giá mẫu: 4.8/5 — môi trường hỗ trợ sinh viên, mentor phản hồi hàng tuần.</p>','Đóng');
  }));
}
