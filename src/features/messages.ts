import { isRecruiterWorkspace } from '../lib/workspace';
import { read, write } from '../lib/storage';
export function setupMessages() {
  const input=document.querySelector<HTMLInputElement>('input[placeholder^="Nhập tin nhắn"]');
  const stream=document.querySelector<HTMLElement>('.overflow-y-auto.space-y-md');
  if(!input || !stream)return;
  const recruiter = isRecruiterWorkspace();
  const key = recruiter ? 'messages:employer:minh-thu' : 'messages';
  if (recruiter) {
    input.placeholder = 'Nhập tin nhắn cho Nguyễn Minh Thư...';
    const section = input.closest('section');
    const title = section?.querySelector('h2');
    if (title) title.textContent = 'Nguyễn Minh Thư';
    const identity = title?.parentElement?.parentElement;
    if (identity?.children[1]) identity.children[1].textContent = 'Ứng viên • Software Engineering Intern';
    const photo = section?.querySelector<HTMLImageElement>('img');
    if (photo) photo.src = '/assets/images/ffad8b7c22e93965.png';
    const quickActions = section?.firstElementChild?.lastElementChild;
    if (quickActions) quickActions.innerHTML = '<a href="/pages/candidates/">Xem hồ sơ ứng viên</a>';
    stream.replaceChildren();
    const note = document.createElement('p'); note.className = 'app-muted';
    note.textContent = 'Trao đổi với Nguyễn Minh Thư về vị trí thực tập. Tin nhắn trong bản demo chỉ lưu trên trình duyệt, chưa gửi đến ứng viên.';
    stream.append(note);
    const grid = section?.parentElement;
    const list = grid?.querySelector('aside:first-child');
    if (list) list.innerHTML = '<div class="p-md"><h2>Ứng viên</h2><a class="workflow-conversation" aria-current="page" href="/pages/messages/?workspace=employer&candidate=minh-thu"><strong>Nguyễn Minh Thư</strong><span>Software Engineering Intern</span></a></div>';
    const context = grid?.querySelector('aside:last-child');
    if (context) context.innerHTML = '<h2>Hồ sơ tuyển dụng</h2><p>Nguyễn Minh Thư</p><p>Software Engineering Intern</p><a href="/pages/candidates/">Quay lại quản lý ứng viên →</a>';
  }
  const messages=read<string[]>(key,[]);
  const append=(text:string)=>{const bubble=document.createElement('div');bubble.className='app-chat-message';bubble.textContent=text;stream.append(bubble);stream.scrollTop=stream.scrollHeight;};
  messages.forEach(append);
  const send=()=>{const value=input.value.trim();if(!value)return;messages.push(value);write(key,messages);append(value);input.value='';};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();send();}});
  input.parentElement?.querySelector('button')?.addEventListener('click',send);
}
