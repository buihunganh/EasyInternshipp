import { dialog, toast } from '../../components/feedback';
import { label } from '../../lib/navigation';
import { read, write } from '../../lib/storage';
import { saveForm } from '../forms';
import { bind, button, esc, field, value } from './ui';

export type DemoJob={id:string;title:string;status:string;department:string;location:string;description:string;fields?:Record<string,string|boolean>};
export function setupPosting(){
  const form=document.querySelector<HTMLFormElement>('.post-job-layout>form')!;
  const title=document.querySelector<HTMLInputElement>('#job-title')!;title.required=true;title.maxLength=100;
  const editor=document.querySelector<HTMLElement>('div.min-h-\\[220px\\]')!;
  editor.contentEditable='true';editor.setAttribute('role','textbox');editor.setAttribute('aria-label','Mô tả công việc');editor.setAttribute('aria-multiline','true');editor.id='demo-job-description';
  const preview=document.querySelector<HTMLElement>('.post-job-preview')!;
  const previewTitle=preview.querySelector('h3');
  const jobs=read<DemoJob[]>('demo:jobs',[]);
  const id=new URLSearchParams(location.search).get('edit');const existing=jobs.find(j=>j.id===id);
  const editingId=existing?.id||crypto.randomUUID();
  if(existing){title.value=existing.title;if(existing.description)editor.textContent=existing.description;for(const [key,v] of Object.entries(existing.fields||{})){const input=document.getElementById(key) as HTMLInputElement|null;if(input)input.value=String(v);}}
  const draft=read<string|null>('demo:job-description',null);if(!existing&&draft)editor.textContent=draft;
  const initial=title.value;
  const refresh=()=>{if(previewTitle)previewTitle.textContent=title.value||'Tên vị trí tuyển dụng';let body=preview.querySelector<HTMLElement>('.demo-description-preview');if(!body){body=document.createElement('p');body.className='demo-description-preview';preview.firstElementChild?.append(body);}body.textContent=editor.innerText;};
  form.addEventListener('input',refresh);refresh();
  function save(status:string){
    saveForm('post-job');write('demo:job-description',editor.innerText);
    const fields:Record<string,string|boolean>={};form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[id],select[id]').forEach(e=>fields[e.id]=e.value);
    const entry:DemoJob={id:editingId,title:title.value||'Tin tuyển dụng chưa đặt tên',status,department:(document.getElementById('department') as HTMLSelectElement).value,location:(document.getElementById('location') as HTMLInputElement).value,description:editor.innerText,fields};
    const all=read<DemoJob[]>('demo:jobs',[]);const index=all.findIndex(j=>j.id===entry.id);if(index>=0)all[index]=entry;else all.unshift(entry);write('demo:jobs',all);write('demo:editing-job',entry.id);
    toast(status==='draft'?'Đã lưu bản nháp.':'Đã đăng tin trong bản demo.');
  }
  form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;save('active');dialog('Đã đăng tin tuyển dụng',`<p>${esc(title.value)}</p><p>Tin đã xuất hiện trong danh sách quản lý tuyển dụng demo.</p>`,'Xem tin đã đăng',()=>location.assign('/pages/employer/'));});
  function addTag(host:Element,text:string){const tag=document.createElement('span');tag.className='demo-tag';tag.append(document.createTextNode(text),button('×',()=>tag.remove()));host.append(tag);}
  const skillInput=form.querySelector<HTMLInputElement>('input[placeholder^="+ Thêm"]');skillInput?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();if(skillInput.value.trim())addTag(skillInput.parentElement!,skillInput.value.trim());skillInput.value='';}});
  document.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{
    const text=label(b),icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim()||b.textContent?.trim();
    if(/Lưu.*nháp/.test(text))bind(b,()=>save('draft'));
    else if(/Xem trước/.test(text))bind(b,()=>dialog('Xem trước tin tuyển dụng',`<h3>${esc(title.value)}</h3><p class="demo-prewrap">${esc(editor.innerText)}</p>`,'Đóng'));
    else if(/Tiếp tục sang/.test(text))bind(b,()=>{form.querySelectorAll('h2')[1]?.scrollIntoView({behavior:'smooth',block:'center'});});
    else if(/Hủy bỏ/.test(text))bind(b,()=>dialog('Hủy thay đổi?','<p>Khôi phục các trường về bản mặc định của biểu mẫu.</p>','Khôi phục',()=>{form.reset();title.value=initial;refresh();toast('Đã khôi phục biểu mẫu.');}));
    else if(/Thêm chuyên ngành/.test(text))bind(b,()=>dialog('Thêm chuyên ngành',field('tag','Tên chuyên ngành'),'Thêm',f=>addTag(b.parentElement!,value(f,'tag'))));
    else if(/Thêm câu hỏi/.test(text))bind(b,()=>dialog('Thêm câu hỏi sàng lọc',field('question','Câu hỏi')+field('answer','Gợi ý trả lời'),'Thêm câu hỏi',f=>{const card=document.createElement('div');card.className='demo-card';card.innerHTML=`<strong>${esc(value(f,'question'))}</strong><p>${esc(value(f,'answer'))}</p>`;card.append(button('Xóa câu hỏi',()=>card.remove()));b.parentElement!.parentElement!.append(card);}));
    else if(/Khung chuẩn|Đồ án tốt nghiệp|Chuyển đổi ngành/.test(text))bind(b,()=>{editor.textContent=`${text}\nTrách nhiệm: tham gia phát triển sản phẩm cùng mentor, thực hành dự án và báo cáo tiến độ hàng tuần.\nYêu cầu: kiến thức nền tảng, tinh thần học hỏi và portfolio cá nhân.\nQuyền lợi: phụ cấp thực tập, hướng dẫn 1:1 và xác nhận thực tập.`;refresh();});
    else if(/^(ĐH|Đại học)/.test(text)&&b.closest('form')){b.setAttribute('aria-pressed',String(icon==='check'));bind(b,()=>{const active=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',String(active));b.classList.toggle('demo-selected',active);const span=b.querySelector('span');if(span)span.textContent=active?'check':'add';});}
    else if(icon==='close'&&b.closest('form'))bind(b,()=>b.parentElement?.remove());
    else if(icon&&(/format_/.test(icon)||['link','code'].includes(icon))){
      b.addEventListener('mousedown',e=>e.preventDefault());
      bind(b,()=>{editor.focus();const commands:Record<string,string>={format_bold:'bold',format_italic:'italic',format_underlined:'underline',format_list_bulleted:'insertUnorderedList',format_list_numbered:'insertOrderedList'};
        if(commands[icon]){document.execCommand(commands[icon]);b.setAttribute('aria-pressed',String(document.queryCommandState(commands[icon])));b.classList.toggle('demo-selected',document.queryCommandState(commands[icon]));}else if(icon==='code')document.execCommand('insertText',false,'const example = "Hello Internships";');else dialog('Chèn liên kết',field('url','Đường dẫn','https://','url'),'Chèn',f=>{const url=value(f,'url');if(!/^https?:\/\//i.test(url))return;editor.append(document.createTextNode(' '+url));refresh();});refresh();});
    }
  });
}
