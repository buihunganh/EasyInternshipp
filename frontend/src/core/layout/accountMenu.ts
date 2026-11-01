import { isRecruiterWorkspace, workspaceHref } from '../workspace';
import { attachMenu, type MenuItem } from '../ui/menu';
import { dialog, toast } from '../ui/feedback';
import { applications, jobHref, routes } from '../navigation';
import { flash } from '../auth';
import { currentProfile, currentRole, roleLabel, signOut } from '../session';
import { publicUrl, supabase, type Tables } from '../supabase';
import { showError } from '../errors';
import { relativeTime } from '../format';
import { el } from '../render';
import {
  getNotificationPrefs, latestNotifications, listSavedJobs, markNotificationsRead, saveNotificationPrefs,
  setJobSaved, unreadNotificationCount, type NotificationPrefs,
} from '../accountApi';

function logout() {
  const modal=dialog('Đăng xuất tài khoản','<div class="app-modal-icon"><span class="material-symbols-outlined">logout</span></div><p>Bạn có chắc muốn đăng xuất khỏi Internships.io?</p><p class="app-muted">Bản nháp đang soạn trên trình duyệt này vẫn được giữ lại.</p>','Đăng xuất',async ()=>{
    await signOut();
    flash('Bạn đã đăng xuất.');
    location.assign(routes.login);
  });
  modal.querySelector('[type=submit]')?.classList.add('app-danger');
}

export async function savedJobs() {
  const modal=dialog('Việc làm đã lưu','<div class="app-saved-list"><p class="app-muted">Đang tải...</p></div>','Đóng');
  const list=modal.querySelector('.app-saved-list')!;
  async function render(){
    try {
      const jobs = await listSavedJobs();
      list.replaceChildren();
      if(!jobs.length){list.append(el('p',{className:'app-muted'},'Bạn chưa lưu công việc nào. Bấm biểu tượng đánh dấu ở một tin tuyển dụng để lưu lại.'));return;}
      for (const saved of jobs) {
        const title = saved.job?.title ?? 'Tin đã gỡ';
        const remove = el('button',{type:'button',className:'app-remove-saved','aria-label':`Bỏ lưu ${title}`},'Bỏ lưu');
        remove.addEventListener('click',async()=>{try{await setJobSaved(saved.job_id,false);await render();}catch(e){showError(e);}});
        list.append(el('div',{className:'app-saved-row'},
          el('a',{href:jobHref(saved.job_id)},title, saved.job?.company ? el('small',{},` · ${saved.job.company.name}`) : null), remove));
      }
    } catch (error) { showError(error, list as HTMLElement); }
  }
  await render();
}

const prefRows: [keyof NotificationPrefs, string, string][] = [
  ['in_app', 'Thông báo trong ứng dụng', 'Chuông thông báo trên Internships.io'],
  ['email_application_updates', 'Email về đơn ứng tuyển', 'Trạng thái hồ sơ, lịch phỏng vấn, offer'],
  ['email_messages', 'Email tin nhắn', 'Khi có tin nhắn tuyển dụng mới'],
  ['email_job_alerts', 'Email việc làm phù hợp', 'Cơ hội thực tập mới theo bộ lọc của bạn'],
  ['email_community', 'Email cộng đồng', 'Bài viết và bình luận trong cộng đồng'],
];

async function settings(){
  try {
    const prefs = await getNotificationPrefs();
    const modal=dialog('Cài đặt thông báo','<p class="app-muted">Chọn các thông báo bạn muốn nhận.</p>'+prefRows.map(([key,title,hint])=>`<label class="app-setting-row"><span><strong>${title}</strong><small>${hint}</small></span><input type="checkbox" name="${key}"></label>`).join(''),'Lưu cài đặt',async form=>{
      const value=(name:string)=>(form.elements.namedItem(name) as HTMLInputElement).checked;
      try { await saveNotificationPrefs(Object.fromEntries(prefRows.map(([key])=>[key,value(key)])) as NotificationPrefs); toast('Đã lưu cài đặt thông báo.'); }
      catch (error) { showError(error); }
    });
    for(const [key] of prefRows)modal.querySelector<HTMLInputElement>(`[name=${key}]`)!.checked=Boolean(prefs[key]);
  } catch (error) { showError(error); }
}

export async function notifications(){
  const modal=dialog('Thông báo','<div class="app-notification-list"><p class="app-muted">Đang tải...</p></div>','Cài đặt thông báo',settings);
  modal.querySelector('.app-dialog-actions>button[type=button]')!.textContent='Đóng';
  const actions = modal.querySelector('.app-dialog-actions')!;
  const viewAllBtn = el('button', { type: 'button', className: 'app-btn-secondary' }, 'Xem tất cả →');
  viewAllBtn.addEventListener('click', () => { modal.close(); location.assign(routes.notifications); });
  actions.prepend(viewAllBtn);

  const list=modal.querySelector<HTMLElement>('.app-notification-list')!;
  try {
    const items = await latestNotifications();
    if (!items.length) { list.innerHTML='<div class="app-empty-notifications"><span class="material-symbols-outlined">notifications_none</span><h3>Bạn đã cập nhật hết thông báo</h3><p>Thông báo mới về việc làm và tin nhắn sẽ xuất hiện tại đây.</p></div>'; return; }
    list.replaceChildren(...items.map(n => {
      const body = el('span',{}, el('strong',{},n.title), n.body ? el('small',{},n.body) : null, el('small',{className:'app-muted'},relativeTime(n.created_at)));
      return n.link ? el('a',{href:n.link,className:`app-notification${n.read_at?'':' app-unread'}`},body) : el('div',{className:`app-notification${n.read_at?'':' app-unread'}`},body);
    }));
    const unread = items.filter(n => !n.read_at).map(n => n.id);
    if (unread.length) { await markNotificationsRead(unread); document.querySelectorAll('.app-notification-badge').forEach(b=>b.remove()); }
  } catch (error) { showError(error, list); }
}

function menuItems(): MenuItem[] {
  const role = currentRole();
  const employer = role === 'employer' || isRecruiterWorkspace();
  const items: MenuItem[] = [];
  if (role === 'student') items.push(
    {label:'Xem hồ sơ cá nhân',icon:'person',action:()=>location.assign(routes.profile)},
    {label:'Chỉnh sửa hồ sơ / CV',icon:'edit',action:()=>location.assign(routes['cv-builder'])},
    {label:'Đơn ứng tuyển',icon:'send',action:applications},
    {label:'Việc làm đã lưu',icon:'bookmark',action:()=>{void savedJobs();}});
  else if (employer) items.push(
    {label:'Hồ sơ doanh nghiệp',icon:'business',action:()=>location.assign(routes['company-settings'])},
    {label:'Xem trang công ty',icon:'storefront',action:()=>location.assign(workspaceHref(routes.company))},
    {label:'Quản lý tuyển dụng',icon:'dashboard',action:()=>location.assign(routes.employer)},
    {label:'Quản lý ứng viên',icon:'group',action:()=>location.assign(routes.candidates)});
  else if (role === 'university_officer') items.push({label:'Trang nhà trường',icon:'school',action:()=>location.assign(routes.university)});
  else if (role === 'admin') items.push({label:'Bảng quản trị',icon:'admin_panel_settings',action:()=>location.assign('/pages/admin/')});
  items.push({label:'Cài đặt thông báo',icon:'settings',action:()=>{void settings();},divider:true});
  items.push({label:'Đăng xuất',icon:'logout',action:logout,danger:true,divider:true});
  return items;
}

/** Avatar URL for the signed-in user, or a generated initial when none is uploaded. */
export function avatarUrl() {
  return publicUrl('avatars', currentProfile()?.avatar_path) || '';
}

function updateBadges(count: number) {
  document.querySelectorAll<HTMLElement>('[data-app-control="notifications"]').forEach(trigger => {
    trigger.querySelectorAll('.app-notification-badge').forEach(b => b.remove());
    if (count > 0) {
      trigger.style.position ||= 'relative';
      trigger.append(el('span', { className: 'app-notification-badge', 'aria-label': `${count} thông báo chưa đọc` }, count > 9 ? '9+' : String(count)));
    }
  });
}

export function setupAccount(page:string){
  if(['login','register','reset-password'].includes(page)) return;
  const profile = currentProfile();
  if (!profile) return;
  for(const header of document.querySelectorAll('header')){
    header.querySelectorAll<HTMLElement>('[class~="group-hover:block"]').forEach(menu=>{if(menu.textContent?.includes('Đăng xuất'))menu.remove();});
    const trigger = header.querySelector<HTMLElement>('.site-header-account');
    if(!trigger) continue;
    attachMenu(trigger, menuItems, ()=>{
      const heading=el('div',{className:'app-menu-account'});
      const photo=trigger.querySelector('img')?.cloneNode() as HTMLImageElement|undefined;
      if (photo) { photo.removeAttribute('class'); photo.alt=''; heading.append(photo); }
      heading.append(el('div',{}, el('strong',{},profile.full_name || profile.email || ''), el('small',{},`Tài khoản ${roleLabel[profile.role].toLowerCase()}`)));
      return heading;
    });
  }
  document.querySelectorAll<HTMLElement>('header .material-symbols-outlined').forEach(icon=>{
    if(icon.textContent?.trim()!=='notifications')return;
    const trigger=icon.closest<HTMLElement>('button,[title]') || icon.parentElement!;
    trigger.dataset.appControl='notifications';trigger.setAttribute('aria-label','Thông báo');
    if(trigger.tagName!=='BUTTON'){trigger.tabIndex=0;trigger.setAttribute('role','button');trigger.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();void notifications();}});}
    trigger.addEventListener('click',()=>{void notifications();});
    unreadNotificationCount().then(updateBadges).catch(()=>{});
  });

  // Realtime notifications for the current user
  const notifChannel = supabase.channel(`user-notifications:${profile.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${profile.id}`
    }, payload => {
      const n = payload.new as Tables<'notifications'>;
      toast(n.title + (n.body ? `: ${n.body}` : ''));
      unreadNotificationCount().then(updateBadges).catch(() => {});
    })
    .subscribe();

  window.addEventListener('pagehide', () => {
    void supabase.removeChannel(notifChannel);
  });
}
