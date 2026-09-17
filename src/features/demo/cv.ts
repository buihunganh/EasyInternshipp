import { dialog, toast } from '../../components/feedback';
import { label } from '../../lib/navigation';
import { read, write } from '../../lib/storage';
import { saveForm } from '../forms';
import { bind, button, esc, field, share, upload, value } from './ui';

type Extra={id:string;kind:string;title:string;detail:string};
export function setupCV(page:string){
  if(page==='profile'){
    const saved=read<Record<string,string>>('form:cv-builder',{});
    const name=document.querySelector('h1');if(name&&saved['input-fullname'])name.textContent=saved['input-fullname'];
    document.querySelectorAll<HTMLButtonElement>('main button').forEach(b=>{const text=label(b),icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim();
      if(/Sửa|Chỉnh sửa|Thêm dự án|Xem trước|Tải xuống/.test(text)||icon==='edit')bind(b,()=>location.assign('/pages/cv-builder/'+(/Tải xuống/.test(text)?'?print=1':'')));
      else if(icon==='photo_camera'){
        let container=b.parentElement;while(container&&!container.querySelector('img'))container=container.parentElement;
        const image=container?.querySelector('img');const savedAvatar=read<string|null>('demo:avatar',null);if(image&&savedAvatar)image.src=savedAvatar;
        bind(b,()=>upload('Cập nhật ảnh hồ sơ','image/png,image/jpeg,image/webp',file=>{if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>2*1024*1024){toast('Chọn ảnh PNG, JPG hoặc WebP dưới 2 MB.');return;}const reader=new FileReader();reader.onload=()=>{if(image)image.src=String(reader.result);write('demo:avatar',reader.result);toast('Đã cập nhật ảnh hồ sơ.');};reader.readAsDataURL(file);}));
      }
    });return;
  }
  const sheet=document.getElementById('a4-cv-sheet')!;
  const input=(name:string)=>(document.getElementById('input-'+name) as HTMLInputElement)?.value||'';
  const sections=[...document.querySelectorAll<HTMLElement>('main h2')].map(h=>h.closest<HTMLElement>('div.p-6')).filter((x):x is HTMLElement=>!!x);
  const projectSection=sections.find(s=>/Dự án thực tế/.test(s.querySelector('h2')?.textContent||''))!;
  const skillsSection=sections.find(s=>/Kỹ năng kỹ thuật/.test(s.querySelector('h2')?.textContent||''))!;
  const schoolSection=sections.find(s=>s.querySelector('#input-school'))!;
  const awardSection=sections.find(s=>/Hoạt động ngoại khóa/.test(s.querySelector('h2')?.textContent||''))!;
  let extras=read<Extra[]>('demo:cv-extras',[]);
  const removed=read<string[]>('demo:cv-removed',[]);
  let theme=read('demo:cv-theme','modern'),color=read('demo:cv-color','#3f5baa'),zoom=100;
  let avatar=read('demo:avatar','/assets/images/20d745aa4fbeee4e.png');
  (document.getElementById('cv-avatar-preview') as HTMLImageElement).src=avatar;
  function extrasHTML(kind:string){return extras.filter(x=>x.kind===kind).map(x=>`<div class="demo-cv-entry"><strong>${esc(x.title)}</strong><p>${esc(x.detail)}</p></div>`).join('');}
  function sync(){
    const projectFields=[...projectSection.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea')];
    const projectHidden=projectSection.querySelector<HTMLElement>('[data-demo-project]')?.hidden;
    const skills=[...skillsSection.querySelectorAll('span')].filter(s=>s.querySelector('button')&&s.querySelector('.material-symbols-outlined')?.textContent==='close').map(s=>label(s));
    sheet.style.setProperty('--cv-accent',color);sheet.dataset.template=theme;
    sheet.innerHTML=`<div class="demo-cv-header"><div><h3 id="preview-name">${esc(input('fullname').toUpperCase())}</h3><p id="preview-target">${esc(input('title'))}</p><p><span id="preview-email">${esc(input('email'))}</span> · <span id="preview-phone">${esc(input('phone'))}</span></p><p id="preview-location">${esc(input('location'))}</p><p id="preview-links">${esc([input('github'),input('linkedin')].filter(Boolean).join(' · '))}</p></div><img src="${esc(avatar)}" alt="Ảnh CV" width="64" height="64"></div>
    <section><h4>Mục tiêu nghề nghiệp</h4><p id="preview-summary">${esc(input('summary'))}</p></section>
    <section><h4>Học vấn</h4><strong>${esc(input('school'))}</strong><p>${esc(schoolSection.querySelectorAll('input')[2]?.value||'')}</p><p>${esc(input('major'))} · GPA: ${esc(input('gpa'))}</p><p>${esc(input('courses'))}</p>${extrasHTML('school')}</section>
    <section><h4>Dự án</h4>${projectHidden?'':`<strong>${esc(projectFields[0]?.value||'')}</strong><p>${esc(projectFields[1]?.value||'')}</p><p>${esc(projectFields[2]?.value||'')}</p><p class="demo-prewrap">${esc(projectFields[3]?.value||'')}</p>`}${extrasHTML('project')}</section>
    <section><h4>Kỹ năng & chứng chỉ</h4><p>${esc(skills.join(' · '))}</p>${extrasHTML('skill')}<p>${esc([...skillsSection.querySelectorAll('.grid p')].map(p=>p.textContent?.trim()).join(' · '))}</p></section>
    <section><h4>Hoạt động & giải thưởng</h4>${[...awardSection.querySelectorAll(':scope>div:last-of-type>div')].filter(e=>!e.classList.contains('demo-cv-extra-editor')).map(e=>`<p>${esc(e.textContent?.trim()||'')}</p>`).join('')}${extrasHTML('award')}</section>`;
    write('demo:cv-preview',sheet.innerText);
  }
  const project=projectSection.querySelector<HTMLElement>('.bg-surface-container-low.rounded-xl');if(project){project.dataset.demoProject='true';project.hidden=removed.includes('project');}
  function renderExtras(){
    document.querySelectorAll('.demo-cv-extra-editor').forEach(e=>e.remove());
    const places:Record<string,HTMLElement|undefined>={school:sections.find(s=>s.querySelector('#input-school')),project:projectSection,skill:skillsSection,award:sections.find(s=>/Hoạt động ngoại khóa/.test(s.querySelector('h2')?.textContent||''))};
    extras.forEach(x=>{const row=document.createElement('div');row.className='demo-card demo-cv-extra-editor';const title=document.createElement('strong');title.textContent=x.title;const detail=document.createElement('p');detail.textContent=x.detail;row.append(title,detail,button('Sửa',()=>edit(x.kind,x)),button('Xóa',()=>{extras=extras.filter(e=>e.id!==x.id);write('demo:cv-extras',extras);renderExtras();sync();}));places[x.kind]?.append(row);});
  }
  function edit(kind:string,entry?:Extra){const names:Record<string,string>={school:'trường học',project:'dự án',skill:'kỹ năng',award:'hoạt động / giải thưởng'};dialog((entry?'Sửa ':'Thêm ')+names[kind],field('title','Tên',entry?.title||'')+`<label>Mô tả<textarea name="detail">${esc(entry?.detail||'')}</textarea></label>`,'Lưu',form=>{const item={id:entry?.id||crypto.randomUUID(),kind,title:value(form,'title'),detail:value(form,'detail')};extras=extras.filter(x=>x.id!==item.id);extras.push(item);write('demo:cv-extras',extras);renderExtras();sync();});}
  document.querySelector('main')?.addEventListener('input',sync);
  document.querySelectorAll<HTMLButtonElement>('main button').forEach((b,index)=>{
    const text=label(b),icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim();
    if(/Thêm trường/.test(text))bind(b,()=>edit('school'));
    else if(/Thêm dự án/.test(text))bind(b,()=>edit('project'));
    else if(/Thêm kỹ năng/.test(text))bind(b,()=>edit('skill'));
    else if(/Thêm mục/.test(text))bind(b,()=>edit('award'));
    else if(/Hiện đại|Tối giản|Kỹ thuật/.test(text)){bind(b,()=>{theme=/Tối giản/.test(text)?'minimal':/Kỹ thuật/.test(text)?'tech':'modern';write('demo:cv-theme',theme);sync();b.parentElement?.querySelectorAll('button').forEach(x=>x.classList.toggle('demo-selected',x===b));});}
    else if(['Modern Blue','Teal','Navy Emerald','Charcoal'].includes(b.title))bind(b,()=>{color=({'Modern Blue':'#3f5baa',Teal:'#087f76','Navy Emerald':'#193a51',Charcoal:'#30343b'} as Record<string,string>)[b.title];write('demo:cv-color',color);sync();});
    else if(icon==='zoom_in'||icon==='zoom_out')bind(b,()=>{zoom=Math.max(70,Math.min(130,zoom+(icon==='zoom_in'?10:-10)));sheet.style.fontSize=14*zoom/100+'px';const text=b.parentElement?.querySelector('span:not(.material-symbols-outlined)');if(text)text.textContent=zoom+'%';});
    else if(icon==='close'){const key='tag-'+index;if(removed.includes(key))b.parentElement?.remove();else bind(b,()=>{b.parentElement?.remove();removed.push(key);write('demo:cv-removed',removed);sync();});}
    else if(icon==='delete'){const key=project?.contains(b)?'project':'certificate-'+index;if(removed.includes(key)&&key!=='project')b.closest('div.p-3')?.remove();else bind(b,()=>dialog('Xóa mục khỏi CV?','<p>Bạn có thể thêm lại mục này bằng nút Thêm.</p>','Xóa',()=>{if(project?.contains(b))project.hidden=true;else b.closest('div.p-3')?.remove();removed.push(key);write('demo:cv-removed',removed);sync();}));}
    else if(icon==='edit')bind(b,()=>{const target=projectFields();target?.focus();target?.select();});
    else if(icon==='photo_camera')bind(b,()=>upload('Đổi ảnh CV','image/png,image/jpeg,image/webp',file=>{if(file.size>2*1024*1024||!/^image\/(png|jpeg|webp)$/.test(file.type)){toast('Chọn ảnh PNG, JPG hoặc WebP dưới 2 MB.');return;}const reader=new FileReader();reader.onload=()=>{avatar=String(reader.result);try{write('demo:avatar',avatar);}catch{toast('Ảnh dùng cho phiên này; dung lượng lưu trữ đã đầy.');}const image=document.getElementById('cv-avatar-preview') as HTMLImageElement;image.src=avatar;sync();};reader.readAsDataURL(file);}));
    else if(b.id==='ai-summary-btn')bind(b,()=>{const summary=document.getElementById('input-summary') as HTMLTextAreaElement;summary.value=`Tôi là ${input('fullname')}, theo học ${input('major')} tại ${input('school')}. Mong muốn ứng tuyển ${input('title')}, vận dụng kiến thức qua dự án thực tế, học hỏi từ mentor và đóng góp vào sản phẩm của đội ngũ.`;sync();toast('Đã áp dụng gợi ý mẫu để bạn chỉnh sửa.');});
    else if(/Lưu &/.test(text))bind(b,()=>{saveForm('cv-builder');sync();});
    else if(/Tải PDF/.test(text))bind(b,()=>window.print());
    else if(/Xuất liên kết/.test(text))bind(b,()=>{saveForm('cv-builder');share('Chia sẻ hồ sơ',location.origin+'/pages/profile/');});
  });
  function projectFields(){return projectSection.querySelector<HTMLInputElement>('input');}
  window.addEventListener('beforeprint',()=>{document.getElementById('demo-print-region')?.remove();const print=document.createElement('div');print.id='demo-print-region';print.append(sheet.cloneNode(true));document.body.append(print);});
  window.addEventListener('afterprint',()=>document.getElementById('demo-print-region')?.remove());
  renderExtras();sync();
  if(new URLSearchParams(location.search).has('print'))dialog('CV đã sẵn sàng','<p>Chọn In / Lưu PDF để mở hộp thoại in của trình duyệt.</p>','In / Lưu PDF',()=>window.print());
}
