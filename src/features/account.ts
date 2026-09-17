import { isRecruiterWorkspace, workspaceHref } from '../lib/workspace';
import { attachMenu, type MenuItem } from '../components/menu';
import { dialog, toast } from '../components/feedback';
import { applications, routes } from '../lib/navigation';
import { read, write } from '../lib/storage';

function logout() {
  const modal=dialog('Đăng xuất tài khoản','<div class="app-modal-icon"><span class="material-symbols-outlined">logout</span></div><p>Bạn có chắc muốn đăng xuất khỏi Internships.io?</p><p class="app-muted">Hồ sơ và các mục đã lưu trên trình duyệt vẫn được giữ lại.</p>','Đăng xuất',()=>{
    localStorage.removeItem('internships:demo-session');
    sessionStorage.setItem('internships:logged-out','true');
    location.assign(routes.login);
  });
  modal.querySelector('[type=submit]')?.classList.add('app-danger');
}

export function savedJobs() {
  const modal=dialog('Việc làm đã lưu','<div class="app-saved-list"></div>','Đóng');
  const list=modal.querySelector('.app-saved-list')!;
  function render(){
    list.replaceChildren();const jobs=read<string[]>('saved-jobs',[]);
    if(!jobs.length){const empty=document.createElement('p');empty.className='app-muted';empty.textContent='Bạn chưa lưu công việc nào. Bấm biểu tượng đánh dấu ở một tin tuyển dụng để lưu lại.';list.append(empty);return;}
    jobs.forEach(job=>{
      const row=document.createElement('div');row.className='app-saved-row';
      const link=document.createElement('a');link.href=routes['job-detail']+'?job='+encodeURIComponent(job);link.textContent=job;
      const remove=document.createElement('button');remove.type='button';remove.className='app-remove-saved';remove.textContent='Bỏ lưu';remove.setAttribute('aria-label',`Bỏ lưu ${job}`);
      remove.addEventListener('click',()=>{write('saved-jobs',read<string[]>('saved-jobs',[]).filter(value=>value!==job));render();window.dispatchEvent(new Event('saved-jobs-changed'));});
      row.append(link,remove);list.append(row);
    });
  }
  render();
}

function settings(){
  const saved=read('notification-settings',{jobs:true,messages:true,community:false});
  const modal=dialog('Cài đặt thông báo','<p class="app-muted">Chọn các thông báo bạn muốn nhận.</p><label class="app-setting-row"><span><strong>Việc làm phù hợp</strong><small>Cơ hội thực tập mới theo hồ sơ của bạn</small></span><input type="checkbox" name="jobs"></label><label class="app-setting-row"><span><strong>Tin nhắn tuyển dụng</strong><small>Tin nhắn và lịch phỏng vấn mới</small></span><input type="checkbox" name="messages"></label><label class="app-setting-row"><span><strong>Cộng đồng hướng nghiệp</strong><small>Bài viết và hoạt động trong cộng đồng</small></span><input type="checkbox" name="community"></label>','Lưu cài đặt',form=>{
    const value=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement).checked;
    write('notification-settings',{jobs:value('jobs'),messages:value('messages'),community:value('community')});toast('Đã lưu cài đặt thông báo trên trình duyệt.');
  });
  for(const [key,value] of Object.entries(saved))modal.querySelector<HTMLInputElement>(`[name=${key}]`)!.checked=value;
}

export function notifications(){
  const modal=dialog('Thông báo','<div class="app-empty-notifications"><span class="material-symbols-outlined">notifications_none</span><h3>Bạn đã cập nhật hết thông báo</h3><p>Thông báo mới về việc làm và tin nhắn sẽ xuất hiện tại đây.</p></div>','Cài đặt thông báo',settings);
  modal.querySelector('.app-dialog-actions>button[type=button]')!.textContent='Đóng';
}

export function setupAccount(page:string){
  if(['login','register'].includes(page)){
    if(page==='login'&&sessionStorage.getItem('internships:logged-out')){sessionStorage.removeItem('internships:logged-out');toast('Bạn đã đăng xuất.');}
    return;
  }
  const employer=isRecruiterWorkspace();
  for(const header of document.querySelectorAll('header')){
    header.querySelectorAll<HTMLElement>('[class~="group-hover:block"]').forEach(menu=>{if(menu.textContent?.includes('Đăng xuất'))menu.remove();});
    const images=[...header.querySelectorAll<HTMLImageElement>('img')];
    const avatar=images.filter(img=>! /logo|internships/i.test(img.alt)).at(-1);
    if(!avatar)continue;
    let trigger:HTMLElement=avatar;
    for(let ancestor=avatar.parentElement;ancestor&&ancestor!==header;ancestor=ancestor.parentElement){
      if(ancestor.querySelectorAll('img').length!==1||ancestor.querySelector('nav')||ancestor.textContent!.trim().length>220)break;
      if([...ancestor.querySelectorAll('.material-symbols-outlined')].some(icon=>/notifications|chat|forum|add/.test(icon.textContent || '')))break;
      if([...ancestor.querySelectorAll('button')].some(button=>!button.contains(avatar)))break;
      trigger=ancestor;
    }
    const existingControl=avatar.closest<HTMLElement>('button,a');
    if(existingControl&&header.contains(existingControl))trigger=existingControl;
    trigger.setAttribute('aria-label','Mở menu tài khoản');trigger.style.cursor='pointer';
    const displayName=employer?'Mai Phương':(trigger.querySelector('.text-left span')?.textContent?.trim() || 'Nguyễn Minh Thư');
    attachMenu(trigger,():MenuItem[]=>[
      {label:employer?'Xem hồ sơ doanh nghiệp':'Xem hồ sơ cá nhân',icon:employer?'business':'person',action:()=>location.assign(employer?workspaceHref(routes.company):routes.profile)},
      ...(!employer?[{label:'Chỉnh sửa hồ sơ / CV',icon:'edit',action:()=>location.assign(routes['cv-builder'])},{label:'Đơn ứng tuyển',icon:'send',action:applications},{label:'Việc làm đã lưu',icon:'bookmark',action:savedJobs}]:[{label:'Quản lý tuyển dụng',icon:'dashboard',action:()=>location.assign(routes.employer)},{label:'Quản lý ứng viên',icon:'group',action:()=>location.assign(routes.candidates)}]),
      {label:'Cài đặt thông báo',icon:'settings',action:settings,divider:true},
      {label:'Đăng xuất',icon:'logout',action:logout,danger:true,divider:true}
    ],()=>{
      const heading=document.createElement('div');heading.className='app-menu-account';const photo=avatar.cloneNode() as HTMLImageElement;photo.removeAttribute('class');photo.removeAttribute('style');photo.removeAttribute('role');photo.removeAttribute('tabindex');photo.removeAttribute('aria-label');photo.removeAttribute('data-app-control');photo.alt='';
      const text=document.createElement('div');const name=document.createElement('strong');name.textContent=displayName;const role=document.createElement('small');role.textContent=employer?'Tài khoản nhà tuyển dụng':'Tài khoản sinh viên';text.append(name,role);heading.append(photo,text);return heading;
    });
  }
  document.querySelectorAll<HTMLElement>('header .material-symbols-outlined').forEach(icon=>{
    if(icon.textContent?.trim()!=='notifications')return;
    const trigger=icon.closest<HTMLElement>('button,[title]') || icon.parentElement!;
    trigger.dataset.appControl='notifications';trigger.setAttribute('aria-label','Thông báo');
    if(trigger.tagName!=='BUTTON'){trigger.tabIndex=0;trigger.setAttribute('role','button');trigger.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();notifications();}});}
    trigger.addEventListener('click',notifications);
  });
}
