import { hasAdminSession, endAdminSession } from '../lib/adminSession';
import { read, write } from '../lib/storage';
import { dialog, toast } from '../components/feedback';

type Tab = 'overview' | 'jobs' | 'users' | 'reports' | 'audit';
type Item = {id:string; name:string; detail:string; status:string; note?:string};
type Audit = {id:string; time:string; target:string; action:string; reason:string};
type State = {jobs:Item[]; users:Item[]; reports:Item[]; audit:Audit[]};
const seed:State = {
  jobs:[
    {id:'JOB-001',name:'Frontend Intern',detail:'TechNova Solutions · TP.HCM · React / TypeScript · Phụ cấp 5–8 triệu · Thực tập 3 tháng',status:'pending'},
    {id:'JOB-002',name:'Marketing Intern',detail:'GreenTech · Hà Nội · Nội dung số · Phụ cấp 3 triệu · Thực tập 6 tháng',status:'pending'},
    {id:'JOB-003',name:'Backend Intern',detail:'TechNova Solutions · TP.HCM · Node.js · Phụ cấp 6 triệu',status:'approved'}
  ],
  users:[
    {id:'USR-001',name:'Nguyễn Minh Thư',detail:'Sinh viên · minhthu@example.com',status:'active'},
    {id:'USR-002',name:'Mai Phương',detail:'Nhà tuyển dụng · TechNova Solutions · hr@example.com',status:'active'},
    {id:'USR-003',name:'Tài khoản cần xác minh',detail:'Nhà tuyển dụng · pending@example.com',status:'suspended'}
  ],
  reports:[{id:'RPT-001',name:'Tin tuyển dụng yêu cầu phí',detail:'Báo cáo mẫu: yêu cầu ứng viên đóng phí trước khi phỏng vấn. Cần xác minh với đơn vị đăng tin.',status:'open'}],audit:[]
};
const stored=read<Partial<State>|null>('admin:v1',null);
let state:State = stored && ['jobs','users','reports','audit'].every(key=>Array.isArray(stored[key as keyof State])) ? stored as State : structuredClone(seed);
const labels:Record<string,string>={pending:'Chờ duyệt',approved:'Đã duyệt',rejected:'Từ chối',active:'Hoạt động',suspended:'Tạm khóa',open:'Chờ xử lý',resolved:'Đã xử lý',dismissed:'Không vi phạm'};
const titles:Record<Tab,string>={overview:'Tổng quan hệ thống',jobs:'Duyệt tin tuyển dụng',users:'Quản lý tài khoản',reports:'Báo cáo vi phạm',audit:'Nhật ký thao tác'};
const descriptions:Record<Tab,string>={overview:'Những việc cần xử lý trên nền tảng.',jobs:'Kiểm tra nội dung trước khi cho phép tin xuất hiện.',users:'Theo dõi tài khoản và xử lý trường hợp vi phạm.',reports:'Xem phản ánh, ghi nhận kết quả xác minh và xử lý.',audit:'Lịch sử quyết định quản trị được lưu trong bản demo.'};
const tabs=Object.keys(titles) as Tab[];
let tab:Tab='overview';
const panel=document.getElementById('admin-panel')!;
const search=document.getElementById('admin-search') as HTMLInputElement;
const filter=document.getElementById('admin-filter') as HTMLSelectElement;
const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
function importReports(){
  const incoming=read<{context:string;reason:string}[]>('reports',[]);
  incoming.forEach((report,index)=>{
    const id=`USER-REPORT-${index+1}`;
    if(!state.reports.some(item=>item.id===id))state.reports.push({id,name:report.context,detail:report.reason,status:'open'});
  });
}
function chooseTab(){
  const hash=location.hash.slice(1) as Tab;tab=tabs.includes(hash)?hash:'overview';
  search.value='';filter.innerHTML='<option value="">Tất cả trạng thái</option>';
  if(['jobs','users','reports'].includes(tab)){
    const statuses=tab==='jobs'?['pending','approved','rejected']:tab==='users'?['active','suspended']:['open','resolved','dismissed'];
    statuses.forEach(status=>filter.add(new Option(labels[status],status)));
  }
  render();
}
function render(){
  document.getElementById('admin-title')!.textContent=titles[tab];
  document.getElementById('admin-description')!.textContent=descriptions[tab];
  document.querySelectorAll('[data-tab]').forEach(link=>{if((link as HTMLElement).dataset.tab===tab)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
  document.getElementById('admin-toolbar')!.hidden=tab==='overview';
  filter.parentElement!.hidden=tab==='audit';
  const stats=[['Tin chờ duyệt',state.jobs.filter(x=>x.status==='pending').length,'jobs'],['Tài khoản hoạt động',state.users.filter(x=>x.status==='active').length,'users'],['Báo cáo cần xử lý',state.reports.filter(x=>x.status==='open').length,'reports'],['Thao tác đã ghi',state.audit.length,'audit']];
  document.getElementById('admin-stats')!.innerHTML=stats.map(([name,count,target])=>`<a class="admin-stat" href="#${target}"><span>${name}</span><strong>${count}</strong><span>Xem danh sách →</span></a>`).join('');
  if(tab==='overview'){
    panel.innerHTML='<div class="admin-overview"><article><h2>Kiểm duyệt nội dung</h2><p>Kiểm tra công ty, mô tả, phụ cấp và yêu cầu ứng viên trước khi duyệt tin.</p><a href="#jobs">Mở hàng đợi duyệt tin →</a></article><article><h2>Tiếp nhận phản ánh</h2><p>Báo cáo được gửi từ cộng đồng hoặc tin nhắn trong cùng trình duyệt cũng xuất hiện tại đây.</p><a href="#reports">Xem báo cáo vi phạm →</a></article></div>';return;
  }
  const query=search.value.trim().toLocaleLowerCase('vi');
  if(tab==='audit'){
    const rows=state.audit.filter(item=>[item.target,item.action,item.reason].join(' ').toLocaleLowerCase('vi').includes(query));
    document.getElementById('admin-count')!.textContent=`${rows.length} thao tác`;
    panel.innerHTML=rows.length?table(['Thời gian','Đối tượng','Thao tác','Lý do'],rows.map(item=>`<tr><td>${escape(new Date(item.time).toLocaleString('vi-VN'))}<small>Quản trị viên demo</small></td><td>${escape(item.target)}</td><td>${escape(item.action)}</td><td>${escape(item.reason)}</td></tr>`).join('')):'<p class="admin-empty">Chưa có thao tác phù hợp.</p>';return;
  }
  const category=tab;
  const rows=state[category].filter(item=>(!filter.value||item.status===filter.value)&&[item.id,item.name,item.detail].join(' ').toLocaleLowerCase('vi').includes(query));
  document.getElementById('admin-count')!.textContent=`${rows.length} kết quả`;
  panel.innerHTML=rows.length?table(['Nội dung','Trạng thái','Thao tác'],rows.map(item=>{
    const actions=category==='jobs'?(item.status==='pending'?[['approve','Duyệt'],['reject','Từ chối']]:[['reopen','Duyệt lại']]):category==='users'?(item.status==='active'?[['suspend','Tạm khóa']]:[['activate','Mở khóa']]):item.status==='open'?[['resolve','Đã xử lý'],['dismiss','Không vi phạm']]:[['reopen','Mở lại']];
    return `<tr><td><strong>${escape(item.name)}</strong><small>${escape(item.id)} · ${escape(item.detail)}</small>${item.note?`<small>Lý do: ${escape(item.note)}</small>`:''}</td><td><span class="admin-badge" data-status="${item.status}">${labels[item.status]}</span></td><td><div class="admin-actions"><button data-id="${escape(item.id)}" data-action="view">Chi tiết</button>${actions.map(([action,name])=>`<button data-id="${escape(item.id)}" data-action="${action}">${name}</button>`).join('')}</div></td></tr>`;
  }).join('')):'<p class="admin-empty">Không có kết quả. Hãy thử từ khóa hoặc trạng thái khác.</p>';
}
function table(headings:string[],body:string){return `<div class="admin-table-wrap"><table class="admin-table"><thead><tr>${headings.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;}
panel.addEventListener('click',event=>{
  if (!checkSession()) return;
  const button=(event.target as Element).closest<HTMLButtonElement>('button[data-action]');
  if(!button||!['jobs','users','reports'].includes(tab))return;
  const category=tab as 'jobs'|'users'|'reports';const item=state[category].find(x=>x.id===button.dataset.id);if(!item)return;
  const action=button.dataset.action!;
  if(action==='view'){dialog('Chi tiết',`<h3>${escape(item.name)}</h3><p class="admin-detail">${escape(item.detail)}</p><p>Trạng thái: ${labels[item.status]}</p>${item.note?`<p>Ghi chú: ${escape(item.note)}</p>`:''}`,'Đóng');return;}
  const next:Record<string,string>={approve:'approved',reject:'rejected',suspend:'suspended',activate:'active',resolve:'resolved',dismiss:'dismissed',reopen:category==='jobs'?'pending':'open'};
  const actionName=button.textContent!;
  dialog(actionName,`<p>${escape(item.name)}</p><label>Lý do / kết quả xác minh<textarea name="reason" required maxlength="1000" placeholder="Ghi rõ lý do để lưu vào nhật ký..."></textarea></label>`, 'Xác nhận',form=>{
    if (!checkSession()) return;
    const reason=(form.elements.namedItem('reason') as HTMLTextAreaElement).value.trim();if(!reason){toast('Vui lòng nhập lý do cụ thể.');return;}
    const updated=structuredClone(state);const target=updated[category].find(x=>x.id===item.id)!;target.status=next[action];target.note=reason;
    updated.audit.unshift({id:crypto.randomUUID(),time:new Date().toISOString(),target:`${item.id} · ${item.name}`,action:actionName,reason});
    try{write('admin:v1',updated);state=updated;render();toast('Đã lưu quyết định quản trị demo.');}catch{toast('Không thể lưu. Vui lòng kiểm tra dung lượng hoặc quyền lưu trữ trình duyệt.');}
  });
});
search.addEventListener('input',render);filter.addEventListener('change',render);
window.addEventListener('hashchange',chooseTab);
function checkSession() {
  if (!hasAdminSession()) { endAdminSession(); return false; }
  return true;
}
document.getElementById('exit-admin')!.addEventListener('click', endAdminSession);
window.addEventListener('pageshow', checkSession);
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkSession(); });
window.setInterval(checkSession, 60000);
if (checkSession()) {
  document.getElementById('admin-app')!.hidden = false;
  importReports(); chooseTab();
}