import { attachMenu, type MenuItem } from '../components/menu';
import { dialog, toast } from '../components/feedback';
import { routes } from '../lib/navigation';
import { read, write } from '../lib/storage';

function report(context:string){
  dialog('Báo cáo nội dung','<p class="app-muted">Mô tả vấn đề bạn gặp với nội dung này.</p><label>Lý do báo cáo<textarea name="reason" required placeholder="Thông tin sai lệch, nội dung không phù hợp..."></textarea></label>','Lưu báo cáo',form=>{
    const reports=read<{context:string;reason:string}[]>('reports',[]);reports.push({context,reason:(form.elements.namedItem('reason') as HTMLTextAreaElement).value});write('reports',reports);toast('Đã lưu báo cáo trong bản demo.');
  });
}

export function setupOptions(page:string){
  for(const button of document.querySelectorAll<HTMLButtonElement>('button')){
    const icon=button.querySelector('.material-symbols-outlined')?.textContent?.trim();
    if(!['more_horiz','more_vert'].includes(icon || ''))continue;
    button.type='button';button.setAttribute('aria-label',page==='messages'?'Tùy chọn cuộc trò chuyện':'Tùy chọn bài viết');
    if(page==='messages'){
      const setStatus=(key:string,enabled:boolean)=>{
        write(key,enabled);
        let status=document.getElementById('conversation-status');
        if(!status){status=document.createElement('p');status.id='conversation-status';status.className='app-conversation-status';button.closest('section')?.children[1]?.after(status);}
        const statuses=[read('chat-muted',false)?'Đã tắt thông báo':'',read('chat-archived',false)?'Đã lưu trữ cuộc trò chuyện':''].filter(Boolean);
        status.textContent=statuses.join(' · ');status.hidden=!statuses.length;
      };
      setStatus('chat-muted',read('chat-muted',false));
      attachMenu(button,():MenuItem[]=>[
        {label:'Xem hồ sơ công ty',icon:'business',action:()=>location.assign(routes.company)},
        {label:read('chat-muted',false)?'Bật thông báo cuộc trò chuyện':'Tắt thông báo cuộc trò chuyện',icon:read('chat-muted',false)?'notifications_active':'notifications_off',action:()=>setStatus('chat-muted',!read('chat-muted',false))},
        {label:read('chat-archived',false)?'Bỏ lưu trữ cuộc trò chuyện':'Lưu trữ cuộc trò chuyện',icon:'archive',action:()=>setStatus('chat-archived',!read('chat-archived',false))},
        {label:'Báo cáo cuộc trò chuyện',icon:'flag',danger:true,divider:true,action:()=>report('Cuộc trò chuyện TechNova')}
      ]);
    }else if(page==='community'){
      let card=button.closest<HTMLElement>('article');
      if(!card){for(let parent=button.parentElement;parent&&parent.tagName!=='MAIN';parent=parent.parentElement){if(parent.querySelector('p')&&parent.querySelector('h2')){card=parent;break;}}}
      const title=card?.querySelector('h2')?.textContent?.trim() || 'Bài viết cộng đồng';
      const key=`saved-post:${title}`;
      attachMenu(button,()=>[
        {label:read(key,false)?'Bỏ lưu bài viết':'Lưu bài viết',icon:'bookmark',action:()=>{const saved=!read(key,false);write(key,saved);toast(saved?'Đã lưu bài viết.':'Đã bỏ lưu bài viết.');}},
        {label:'Sao chép liên kết',icon:'link',action:()=>{navigator.clipboard.writeText(location.href).then(()=>toast('Đã sao chép liên kết.')).catch(()=>toast('Không thể sao chép. Vui lòng sao chép từ thanh địa chỉ.'));}},
        {label:'Ẩn bài viết',icon:'visibility_off',action:()=>{
          if(!card)return;
          const notice=document.createElement('div');notice.className='app-hidden-post';const text=document.createElement('span');text.textContent='Đã ẩn bài viết.';const undo=document.createElement('button');undo.type='button';undo.textContent='Hoàn tác';notice.append(text,undo);card.before(notice);card.hidden=true;undo.addEventListener('click',()=>{card!.hidden=false;notice.remove();});
        }},
        {label:'Báo cáo bài viết',icon:'flag',divider:true,danger:true,action:()=>report(title)}
      ]);
    }
  }
}
