import { label, routes } from '../lib/navigation';
import { read, write } from '../lib/storage';

export function setupJobs() {
  const headings = [...document.querySelectorAll<HTMLElement>('h3')].filter(el => /Intern/.test(el.textContent || ''));
  const cards = headings.map(h => h.closest<HTMLElement>('.group')!).filter(Boolean);
  headings.forEach(h => {h.style.cursor='pointer';h.tabIndex=0;h.setAttribute('role','link');h.addEventListener('click',()=>location.assign(routes['job-detail']));h.addEventListener('keydown',e=>{if(e.key==='Enter')location.assign(routes['job-detail']);});});
  const form = document.querySelector('form');
  const inputs = form?.querySelectorAll('input');
  let quick = '';
  const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replaceAll('đ','d');
  const empty = document.createElement('div'); empty.className='app-empty';empty.hidden=true;empty.textContent='Không tìm thấy vị trí phù hợp. Hãy đổi từ khóa hoặc thiết lập lại bộ lọc.';cards[0]?.parentElement?.append(empty);
  function filter() {
    const query = normalize(inputs?.[0]?.value || '').replace('thuc tap sinh','').trim();
    const city = normalize(inputs?.[1]?.value || '').replace(/tp\.?\s*/g,'').replace('ho chi minh','hcm').trim();
    let count=0;
    cards.forEach(card => {
      const text = normalize(card.textContent || '');
      const quickMatch = !quick || (quick==='urgent' ? text.includes('tuyen gap') : quick==='remote' ? /remote|hybrid/.test(text) : quick==='salary' ? /(?:8 - 12|10 - 14)/.test(text) : quick==='school' ? /bach khoa|do an/.test(text) : /tot nghiep|do an/.test(text));
      card.hidden=!(text.includes(query) && (!city || text.includes(city)) && quickMatch);if(!card.hidden)count++;
    });
    empty.hidden=count>0;
    const countEl=document.querySelector('h2 span');if(countEl)countEl.textContent=String(count);
  }
  form?.addEventListener('submit',e=>{e.preventDefault();filter();});
  document.querySelectorAll('section button').forEach(button => {
    if(button.getAttribute('type')==='submit')return;
    button.addEventListener('click',()=>{
      const text=label(button);quick=/Tuyển gấp/.test(text)?'urgent':/Remote/.test(text)?'remote':/Phụ cấp/.test(text)?'salary':/ĐHQG/.test(text)?'school':/tốt nghiệp/.test(text)?'graduate':'';
      document.querySelectorAll('section button:not([type=submit])').forEach(b=>{b.classList.remove('bg-primary','text-on-primary');b.setAttribute('aria-pressed','false');});button.classList.add('bg-primary','text-on-primary');button.setAttribute('aria-pressed','true');filter();
    });
  });
  const reset=[...document.querySelectorAll('button')].find(b=>label(b)==='Thiết lập lại');
  reset?.addEventListener('click',()=>{if(inputs)inputs.forEach(i=>i.value='');quick='';document.querySelectorAll<HTMLInputElement>('aside input[type=checkbox]').forEach(i=>i.checked=false);filter();});
  const sort=document.querySelectorAll<HTMLSelectElement>('select')[1];
  sort?.addEventListener('change',()=>{
    const container=cards[0]?.parentElement;
    const order=sort.selectedIndex===2 ? [...cards].sort((a,b)=>{
      const salary=(card:HTMLElement)=>Number(card.textContent?.match(/(\d+)\s*-\s*\d+\s*Triệu/i)?.[1] || 0);
      return salary(b)-salary(a);
    }) : cards;
    order.forEach(c=>container?.append(c));
  });
  document.querySelectorAll<HTMLButtonElement>('button[title="Lưu công việc"]').forEach((button,index)=>{
    const key=headings[index]?.textContent?.trim() || String(index);let saved=read<string[]>('saved-jobs',[]);
    const render=()=>{const active=saved.includes(key);button.setAttribute('aria-pressed',String(active));button.querySelector('span')!.textContent=active?'bookmark':'bookmark_border';};render();
    window.addEventListener('saved-jobs-changed',()=>{saved=read<string[]>('saved-jobs',[]);render();});
    button.addEventListener('click',e=>{e.stopPropagation();saved=read<string[]>('saved-jobs',[]);saved=saved.includes(key)?saved.filter(x=>x!==key):[...saved,key];write('saved-jobs',saved);render();});
  });
}
