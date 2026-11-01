import { attachMenu } from '../../core/ui/menu';
import { toast } from '../../core/ui/feedback';
import { read, write } from '../../core/storage';
import { reportContent } from '../../core/report';

/** "…" menu on each community post: save, copy link, hide, report. */
export function setupPostMenus(){
  for(const button of document.querySelectorAll<HTMLButtonElement>('button')){
    const icon=button.querySelector('.material-symbols-outlined')?.textContent?.trim();
    if(!['more_horiz','more_vert'].includes(icon || ''))continue;
    button.type='button';button.setAttribute('aria-label','Tùy chọn bài viết');
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
      {label:'Báo cáo bài viết',icon:'flag',divider:true,danger:true,action:()=>reportContent(title)}
    ]);
  }
}
