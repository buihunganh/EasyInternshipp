import { dialog, toast } from '../../core/ui/feedback';
import { label } from '../../core/navigation';
import { read, write } from '../../core/storage';
import { bind, button, compose, csv, esc, field, normal, record, schedule, value, video } from '../../core/ui/actions';

/** Candidate board (demo data until Phase 7 wires it to applications / pipeline_stages). */
export function setupCandidates(){candidates();}
function candidates(){
  const columns=[...document.querySelectorAll<HTMLElement>('.candidate-board>div')];
  const cards=columns.flatMap((column,stage)=>[...column.children].slice(1).filter(c=>c.querySelector('img')).map((element,i)=>({el:element as HTMLElement,name:element.querySelector('.font-headline-md')?.textContent?.trim()||'Ứng viên',stage,id:`candidate-${stage}-${i}`})));
  const state=read<Record<string,{stage:number;note?:string}>>('demo:pipeline',{});
  let selected=cards.find(c=>c.el.id==='targetCandidateCard')||cards[0];
  const selects=[...document.querySelectorAll<HTMLSelectElement>('.candidate-filters select')];selects.forEach(s=>s.selectedIndex=0);
  const activeTags=document.querySelector('.candidate-filters>div:last-child');if(activeTags)activeTags.replaceChildren(button('Thiết lập lại bộ lọc',()=>{selects.forEach(s=>s.selectedIndex=0);filter();}));
  const chosen=new URLSearchParams(location.search).get('job');if(chosen)document.getElementById('jobSelectorBtn')!.textContent=chosen;
  function counts(){columns.forEach(col=>{const count=col.firstElementChild?.lastElementChild;if(count)count.textContent=String(cards.filter(c=>c.el.parentElement===col&&!c.el.hidden).length);});}
  function filter(){cards.forEach((c,i)=>{const content=normal(c.el.innerText);const score=[78,82,94,88,96,90][i]||85;
    c.el.hidden=!!((selects[0]?.selectedIndex&&(selects[0].selectedIndex===1?score<=90:selects[0].selectedIndex===2?score<=80:score>80))||(selects[1]?.selectedIndex&&!content.includes(normal(selects[1].value).replace('dh ','').replace('dai hoc ','')))||(selects[2]?.selectedIndex&&i%3!==selects[2].selectedIndex-1)||(selects[3]?.selectedIndex&&!normal(selects[3].value).split(/,\s*/).some(s=>content.includes(s)))||(selects[4]?.selectedIndex&&[3.4,3.2,3.7,3.1,3.65,3.5][i]<[0,3,3.2,3.6][selects[4].selectedIndex]));});counts();}
  function move(c:typeof selected,stage:number,note=''){c.stage=stage;columns[stage].append(c.el);state[c.id]={stage,note};write('demo:pipeline',state);let status=c.el.querySelector<HTMLElement>('.demo-pipeline-status');if(!status){status=document.createElement('p');status.className='demo-pipeline-status';c.el.append(status);}status.textContent=note||`Đã chuyển: ${columns[stage].querySelector('h2')?.textContent}`;counts();}
  function profile(c:typeof selected){selected=c;const modal=dialog('Hồ sơ — '+c.name,`<h3>${esc(c.name)}</h3><p class="demo-prewrap">${esc(c.el.innerText)}</p><p>CV minh họa để trải nghiệm quy trình tuyển dụng.</p>`,'Đóng');modal.querySelector('.app-dialog-content')!.append(button('Chuyển vòng',()=>{modal.close();stage(c);}));}
  function stage(c:typeof selected){dialog('Chuyển vòng — '+c.name,`<label>Vòng tuyển dụng<select name="stage">${columns.map((col,i)=>`<option value="${i}" ${i===Math.min(3,c.stage+1)?'selected':''}>${esc(col.querySelector('h2')?.textContent||'')}</option>`).join('')}</select></label><label>Ghi chú<textarea name="note"></textarea></label>`,'Chuyển vòng',f=>{move(c,Number(value(f,'stage')),value(f,'note'));toast('Đã cập nhật pipeline.');});}
  function score(c:typeof selected){dialog('Đánh giá — '+c.name,field('score','Điểm đánh giá (0–100)','85','number')+'<label>Nhận xét<textarea name="note" required></textarea></label>','Lưu đánh giá',f=>{const n=Number(value(f,'score'));if(n<0||n>100){toast('Điểm phải từ 0 đến 100.');return;}move(c,c.stage,`Điểm: ${n}/100 · ${value(f,'note')}`);});}
  cards.forEach(c=>{c.el.dataset.demoCard=c.id;c.el.tabIndex=0;c.el.setAttribute('aria-label','Xem hồ sơ '+c.name);c.el.addEventListener('keydown',e=>{if(e.target===c.el&&e.key==='Enter')profile(c);});
    if(c.el.id!=='targetCandidateCard')c.el.addEventListener('click',e=>{if(!(e.target as Element).closest('button,a,details'))profile(c);});
    if(state[c.id])move(c,state[c.id].stage,state[c.id].note);
    c.el.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{const text=label(b);
      if(/Chuyển vòng/.test(text))bind(b,()=>stage(c));
      else if(/Xem CV|Chi tiết/.test(text))bind(b,()=>profile(c));
      else if(/Xếp lịch/.test(text))bind(b,()=>schedule('Phỏng vấn '+c.name,t=>move(c,2,t)));
      else if(/Xem lời giải/.test(text))bind(b,()=>dialog('Bài test — '+c.name,'<p>Bài mẫu: tìm phần tử trùng lặp trong một mảng.</p><pre>const unique = [...new Set(values)];</pre><p>Kết quả mẫu: 8/10 test case đạt.</p>','Chấm bài',()=>score(c)));
      else if(/Chat/.test(text))bind(b,()=>location.assign('/pages/messages/?workspace=employer&candidate='+encodeURIComponent(c.name)));
      else if(/Video/.test(text))bind(b,video);
      else if(/Đánh giá/.test(text))bind(b,()=>score(c));
    });
    if(![...c.el.querySelectorAll('button')].some(b=>/Chuyển vòng/.test(label(b))))c.el.append(button('Chuyển vòng',()=>stage(c)));
  });
  selects.forEach(s=>s.addEventListener('change',filter));
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b=>{
    if(b.dataset.appControl)return;const text=label(b);
    if(b.id==='jobSelectorBtn')bind(b,()=>dialog('Chọn vị trí tuyển dụng','<label>Vị trí<select name="job"><option>Software Engineering Intern</option><option>UI/UX Design Intern</option><option>Data Analyst Intern</option></select></label>','Xem ứng viên',f=>{b.textContent=value(f,'job');toast('Đang hiển thị bộ ứng viên mẫu cho vị trí đã chọn.');}));
    else if(/Xuất Excel/.test(text))bind(b,()=>csv('ung-vien.csv',[['Họ tên','Vòng tuyển dụng','Ghi chú'],...cards.map(c=>[c.name,columns[c.stage].querySelector('h2')?.textContent||'',state[c.id]?.note||''])]));
    else if(/Gửi mail/.test(text))bind(b,()=>compose('Gửi mail cho ứng viên',cards.filter(c=>!c.el.hidden).map(c=>c.name).join(', ')));
    else if(/Quy trình/.test(text))bind(b,()=>dialog('Cấu hình quy trình',columns.map((col,i)=>field('stage'+i,'Tên vòng '+(i+1),col.querySelector('h2')!.textContent!)).join(''),'Lưu quy trình',f=>{columns.forEach((col,i)=>col.querySelector('h2')!.textContent=value(f,'stage'+i));write('demo:stages',columns.map(c=>c.querySelector('h2')!.textContent));}));
    else if(b.id==='makeOfferBtn')bind(b,()=>dialog('Thư mời nhận việc',field('name','Ứng viên',selected.name)+field('salary','Phụ cấp / tháng','8.000.000 VNĐ')+field('date','Ngày bắt đầu','','date'),'Gửi offer demo',f=>{record('offers',{name:value(f,'name'),salary:value(f,'salary'),start:value(f,'date')});move(selected,3,'Đã gửi offer demo');toast('Đã tạo thư mời. Xem lại trong Hoạt động demo.');}));
    else if(/Đặt thêm vòng/.test(text))bind(b,()=>schedule('Phỏng vấn bổ sung '+selected.name,t=>move(selected,2,t)));
    else if(/Từ chối hồ sơ/.test(text))bind(b,()=>dialog('Từ chối — '+selected.name,field('reason','Lý do'),'Xác nhận',f=>move(selected,selected.stage,'Đã từ chối: '+value(f,'reason'))));
  });
  read<string[]>('demo:stages',[]).forEach((title,i)=>{if(columns[i])columns[i].querySelector('h2')!.textContent=title;});filter();
}
