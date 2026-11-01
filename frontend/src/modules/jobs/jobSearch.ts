import { isSignedIn, requireSignIn } from '../../core/auth';
import { jobHref, label } from '../../core/navigation';
import { read, write } from '../../core/storage';
import { bind, esc, normal } from '../../core/ui/actions';
import type { DemoJob } from '../../core/models';

export function setupJobs() {
  const host=document.querySelector('main article')?.parentElement;
  read<DemoJob[]>('demo:jobs',[]).filter(j=>!j.id.startsWith('seed-')&&j.status==='active').forEach(job=>{
    const card=document.createElement('article');card.className='demo-card group';card.innerHTML=`<div class="demo-actions"><h3>${esc(job.title)}</h3><button title="Lưu công việc" type="button"><span class="material-symbols-outlined">bookmark_border</span></button></div><p>${esc(job.location)}</p><p>${esc(job.description.slice(0,180))}</p><p>Tin tuyển dụng mới · Intern · 5 - 10 Triệu VNĐ</p>`;host?.prepend(card);
  });
  const headings=[...document.querySelectorAll<HTMLElement>('main article h3')];
  const cards=headings.map(h=>h.closest<HTMLElement>('article')!);
  const form=document.querySelector('form')!;
  const inputs=[...form.querySelectorAll('input')];
  if(inputs[1])inputs[1].value='';
  const checks=[...document.querySelectorAll<HTMLInputElement>('aside input[type=checkbox]')];
  const selects=[...document.querySelectorAll<HTMLSelectElement>('select')];
  const industry=selects[0], sort=selects[1];
  industry.prepend(new Option('Tất cả chuyên ngành',''));industry.selectedIndex=0;
  checks.forEach(c=>c.checked=false);
  const range=document.querySelector<HTMLInputElement>('input[type=range]')!;
  range.min='0';range.max='20';range.value='0';range.setAttribute('aria-label','Phụ cấp tối thiểu (triệu đồng)');
  let quick='', current=1;const size=3;
  const data=cards.map((card,i)=>({card,title:headings[i].textContent!.trim(),text:normal(card.textContent||''),salary:[8,10,5,7,4][i]||5,industry:[1,1,2,3,4][i]||1,type:i%3,mode:i%3}));
  const empty=document.createElement('p');empty.className='app-empty';empty.hidden=true;empty.textContent='Không có vị trí phù hợp. Hãy thay đổi hoặc thiết lập lại bộ lọc.';cards[0]?.parentElement?.append(empty);
  const pageButtons=[...document.querySelectorAll<HTMLButtonElement>('main button')].filter(b=>/^\d+$/.test(label(b))||/chevron_(left|right)/.test(b.textContent||''));
  const quickButtons=[...document.querySelectorAll<HTMLButtonElement>('section button')].filter(b=>b.type!=='submit'||!b.form);
  function render(){
    const query=normal(inputs[0]?.value||'').replace('thuc tap sinh','').trim();
    const city=normal(inputs[1]?.value||'').replace(/tp\.?\s*/g,'').replace('ho chi minh','hcm').trim();
    let matches=data.filter(d=>d.text.includes(query)&&(!city||d.text.includes(city))&&(!industry.selectedIndex||d.industry===industry.selectedIndex)&&d.salary>=Number(range.value)&&(!checks.slice(0,3).some(c=>c.checked)||checks[d.type]?.checked)&&(!checks.slice(3).some(c=>c.checked)||checks[d.mode+3]?.checked)&&(!quick||(quick==='urgent'?d.text.includes('tuyen gap'):quick==='remote'?/remote|hybrid/.test(d.text):quick==='salary'?d.salary>8:quick==='school'?/bach khoa|do an/.test(d.text):/tot nghiep|do an/.test(d.text))));
    if(sort.selectedIndex===2)matches.sort((a,b)=>b.salary-a.salary);else if(sort.selectedIndex===1)matches.reverse();else if(sort.selectedIndex===3)matches.sort((a,b)=>b.text.length-a.text.length);
    const pages=Math.max(1,Math.ceil(matches.length/size));current=Math.min(current,pages);
    cards.forEach(c=>c.hidden=true);matches.forEach((d,i)=>{d.card.hidden=i<(current-1)*size||i>=current*size;d.card.parentElement?.append(d.card);});
    data.filter(d=>!matches.includes(d)).forEach(d=>d.card.parentElement?.append(d.card));
    empty.hidden=!!matches.length;const count=document.querySelector('h2 span');if(count)count.textContent=String(matches.length);
    pageButtons.forEach(b=>{const n=Number(label(b));if(n){b.hidden=n>pages;b.setAttribute('aria-current',n===current?'page':'false');b.classList.toggle('demo-selected',n===current);}else b.disabled=b.textContent?.includes('left')?current===1:current===pages;});
    const caption=range.previousElementSibling?.lastElementChild;if(caption)caption.textContent=`Từ ${range.value} triệu / tháng`;
  }
  form.addEventListener('submit',e=>{e.preventDefault();current=1;render();});
  [...checks,industry,sort,range].forEach(el=>el.addEventListener('input',()=>{current=1;render();}));
  quickButtons.forEach(b=>bind(b,()=>{const text=label(b);quick=/Tuyển gấp/.test(text)?'urgent':/Remote/.test(text)?'remote':/Phụ cấp/.test(text)?'salary':/ĐHQG/.test(text)?'school':/tốt nghiệp/.test(text)?'graduate':'';current=1;quickButtons.forEach(x=>{x.setAttribute('aria-pressed',String(x===b));x.classList.toggle('demo-selected',x===b);});render();}));
  bind([...document.querySelectorAll('button')].find(b=>label(b)==='Thiết lập lại'),()=>{inputs.forEach(i=>i.value='');checks.forEach(c=>c.checked=false);industry.selectedIndex=0;range.value='0';quick='';current=1;quickButtons.forEach(b=>b.classList.remove('demo-selected'));render();});
  pageButtons.forEach(b=>bind(b,()=>{current=Number(label(b))||current+(b.textContent?.includes('left')?-1:1);render();document.querySelector('main')?.scrollIntoView({behavior:'smooth'});}));
  headings.forEach((h,i)=>{h.tabIndex=0;h.setAttribute('role','link');h.dataset.demoClick='job';bind(h,()=>location.assign(jobHref(data[i].title)));h.addEventListener('keydown',e=>{if(e.key==='Enter')location.assign(jobHref(data[i].title));});});
  document.querySelectorAll<HTMLButtonElement>('button[title="Lưu công việc"]').forEach((b,i)=>{
    const key=data[i].title;const renderSave=()=>{const active=isSignedIn()&&read<string[]>('saved-jobs',[]).includes(key);b.setAttribute('aria-pressed',String(active));b.querySelector('span')!.textContent=active?'bookmark':'bookmark_border';};
    bind(b,()=>{if(!requireSignIn())return;const saved=read<string[]>('saved-jobs',[]);write('saved-jobs',saved.includes(key)?saved.filter(x=>x!==key):[...saved,key]);renderSave();});window.addEventListener('saved-jobs-changed',renderSave);renderSave();
  });
  bind(document.querySelector('button[title="Chế độ danh sách"]'),()=>{document.querySelector('main')?.classList.toggle('demo-compact');});
  render();
}
