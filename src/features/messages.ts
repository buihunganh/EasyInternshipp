import { isRecruiterWorkspace } from '../lib/workspace';
import { read, write } from '../lib/storage';
import { label } from '../lib/navigation';
import { dialog, toast } from '../components/feedback';
import { attachMenu } from '../components/menu';
import { bind, button, field, normal, schedule, upload, value, video } from './demo/ui';

type Message={text:string;incoming?:boolean};
export function setupMessages(){
  const input=document.querySelector<HTMLInputElement>('input[placeholder^="Nhập tin nhắn"]')!;
  const stream=document.querySelector<HTMLElement>('.overflow-y-auto.space-y-md')!;
  const section=input.closest('section')!;const recruiter=isRecruiterWorkspace();
  const grid=section.parentElement!;const list=grid.querySelector('aside:first-child')!;
  const cards=[...list.querySelectorAll<HTMLElement>('.group')].filter(c=>c.querySelector('h3'));
  if(recruiter)cards.forEach((c,i)=>c.querySelector('h3')!.textContent=['Nguyễn Minh Thư','Lê Tuấn Anh','Trần Minh Đức','Vũ Khánh Linh'][i]);
  const names=cards.map(c=>c.querySelector('h3')!.textContent!.trim());
  const candidate=new URLSearchParams(location.search).get('candidate');let active=Math.max(0,names.indexOf(candidate||''));
  const prefix=recruiter?'employer:':'student:';let mode='all';
  const key=(i=active)=>'demo:chat:'+prefix+i;
  const flag=(name:string,i=active)=>key(i)+':'+name;
  const original=stream.innerHTML;
  const switcher=button('Đổi hội thoại',()=>dialog('Chọn cuộc trò chuyện',`<label>Người nhận<select name="conversation">${names.map((name,i)=>`<option value="${i}" ${i===active?'selected':''}>${name}</option>`).join('')}</select></label>`,'Mở hội thoại',form=>{active=Number(value(form,'conversation'));write(flag('read'),true);render();}));
  switcher.classList.add('demo-conversation-switch');section.firstElementChild?.append(switcher);
  const search=list.querySelector<HTMLInputElement>('input')!;
  const status=document.createElement('p');status.id='conversation-status';status.className='app-conversation-status';section.children[1]?.after(status);
  function filter(){cards.forEach((c,i)=>{const archived=read(flag('archived',i),false);c.hidden=!normal(c.innerText).includes(normal(search.value))||(mode==='archived'?!archived:archived)||(mode==='unread'&&read(flag('read',i),false))||(mode==='interview'&&i!==0);c.classList.toggle('demo-selected',i===active);});}
  function append(message:Message){const bubble=document.createElement('div');bubble.className=message.incoming?'demo-incoming-message':'app-chat-message';bubble.textContent=message.text;stream.append(bubble);stream.scrollTop=stream.scrollHeight;}
  function render(){
    section.querySelector('h2')!.textContent=names[active];input.placeholder='Nhập tin nhắn cho '+names[active]+'...';
    const photo=section.querySelector<HTMLImageElement>('img'),source=cards[active]?.querySelector<HTMLImageElement>('img');if(photo&&source)photo.src=source.src;
    if(active===0&&!recruiter)stream.innerHTML=original;else{stream.replaceChildren();const welcome=document.createElement('p');welcome.className='app-muted';welcome.textContent='Cuộc trò chuyện demo với '+names[active]+'. Tin nhắn không gửi ra ngoài.';stream.append(welcome);}
    read<Message[]>(key(),[]).forEach(append);
    status.textContent=[read(flag('muted'),false)?'Đã tắt thông báo':'',read(flag('archived'),false)?'Đã lưu trữ cuộc trò chuyện':''].filter(Boolean).join(' · ');status.hidden=!status.textContent;
    bindStream();filter();
  }
  function send(text=input.value.trim()){if(!text){input.focus();toast('Nhập nội dung trước khi gửi tin nhắn.');return;}const target=key();const messages=read<Message[]>(target,[]);messages.push({text});write(target,messages);append({text});input.value='';
    window.setTimeout(()=>{const reply={text:'Phản hồi tự động (demo): Cảm ơn bạn! Mình đã nhận được thông tin và sẽ trao đổi thêm trong buổi phỏng vấn.',incoming:true};const entries=read<Message[]>(target,[]);entries.push(reply);write(target,entries);if(key()===target)append(reply);},650);
  }
  function report(){dialog('Báo cáo cuộc trò chuyện','<label>Lý do<textarea name="reason" required></textarea></label>','Lưu báo cáo',f=>{const reports=read<{context:string;reason:string}[]>('reports',[]);reports.push({context:'Cuộc trò chuyện '+names[active],reason:value(f,'reason')});write('reports',reports);toast('Đã lưu báo cáo demo.');});}
  function bindStream(){stream.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{const text=label(b);
    if(/Đổi lịch/.test(text))bind(b,()=>schedule('Đổi lịch phỏng vấn',send));
    else if(/Đã nhận lịch/.test(text))bind(b,()=>{b.textContent='Đã xác nhận tham dự';send('Tôi xác nhận tham dự buổi phỏng vấn.');});
    else if(/Xem chi tiết/.test(text))bind(b,()=>location.assign('/pages/job-detail/'));
  });}
  cards.forEach((card,i)=>{card.dataset.demoClick='conversation';card.tabIndex=0;card.setAttribute('role','button');bind(card,()=>{active=i;write(flag('read'),true);render();});card.addEventListener('keydown',e=>{if(e.key==='Enter'){active=i;render();}});});
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();send();}});bind(input.parentElement?.querySelector('button'),()=>send());
  search.addEventListener('input',filter);
  list.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{const text=label(b);if(/Tất cả|Chưa đọc|Phỏng vấn|Lưu trữ/.test(text))bind(b,()=>{mode=/Chưa đọc/.test(text)?'unread':/Phỏng vấn/.test(text)?'interview':/Lưu trữ/.test(text)?'archived':'all';filter();b.parentElement?.querySelectorAll('button').forEach(x=>x.classList.toggle('demo-selected',x===b));});else bind(b,()=>dialog('Lọc cuộc trò chuyện','<label>Hiển thị<select name="mode"><option value="all">Đang hoạt động</option><option value="unread">Chưa đọc</option><option value="archived">Đã lưu trữ</option></select></label>','Áp dụng',f=>{mode=value(f,'mode');filter();}));});
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b=>{
    if(b.dataset.appControl)return;const text=label(b),icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim();
    if(icon==='more_vert'){b.setAttribute('aria-label','Tùy chọn cuộc trò chuyện');attachMenu(b,()=>[
      {label:read(flag('muted'),false)?'Bật thông báo cuộc trò chuyện':'Tắt thông báo cuộc trò chuyện',icon:'notifications',action:()=>{write(flag('muted'),!read(flag('muted'),false));render();}},
      {label:read(flag('archived'),false)?'Bỏ lưu trữ cuộc trò chuyện':'Lưu trữ cuộc trò chuyện',icon:'archive',action:()=>{write(flag('archived'),!read(flag('archived'),false));render();}},
      {label:'Báo cáo cuộc trò chuyện',icon:'flag',action:report}
    ]);}
    else if(icon==='attach_file'||icon==='upload_file')bind(b,()=>upload('Đính kèm tài liệu','.pdf,.doc,.docx,.txt,.png,.jpg',file=>send('📎 '+file.name+' (tệp demo, chưa tải lên máy chủ)')));
    else if(icon==='code')bind(b,()=>dialog('Chèn liên kết',field('url','GitHub / Portfolio','https://','url'),'Gửi liên kết',f=>send(value(f,'url'))));
    else if(icon==='sentiment_satisfied')bind(b,()=>{const modal=dialog('Chọn emoji','<div class="demo-emojis"></div>','Đóng');for(const emoji of ['😊','👍','🎉','🙏','💼','✅'])modal.querySelector('.demo-emojis')!.append(button(emoji,()=>{input.value+=emoji;modal.close();input.focus();}));});
    else if(icon==='event'||/Đổi lịch/.test(text))bind(b,()=>schedule('Đề xuất lịch phỏng vấn',send));
    else if(/Video Call/.test(text))bind(b,video);
    else if(/Báo cáo/.test(text))bind(b,report);
  });render();
}
