import { dialog, toast } from '../../core/ui/feedback';
import { label } from '../../core/navigation';
import { read, write } from '../../core/storage';
import { requireSignIn } from '../../core/auth';
import { bind, button, compose, download, esc, field, normal, schedule, share, value } from '../../core/ui/actions';

type Post={id:string;body:string;category:string;anonymous:boolean;file?:string};
export function setupCommunity(){
  let posts=read<Post[]>('demo:posts',[]);
  const composer=[...document.querySelectorAll<HTMLButtonElement>('main button')].find(b=>/Chia sẻ kinh nghiệm phỏng vấn/.test(label(b)))!;
  const host=document.createElement('section');host.id='demo-posts';composer.closest('div.bg-surface-container-lowest')?.after(host);
  if(!host.isConnected)document.querySelector('main')?.prepend(host);
  function comment(id:string){const comments=read<string[]>('demo:comments:'+id,[]);dialog('Bình luận',`<div>${comments.map(c=>`<p class="demo-card">${esc(c)}</p>`).join('')||'<p>Chưa có bình luận.</p>'}</div><label>Bình luận của bạn<textarea name="comment" required></textarea></label>`,'Đăng bình luận',f=>{if(!requireSignIn())return;comments.push(value(f,'comment'));write('demo:comments:'+id,comments);toast('Đã thêm bình luận.');});}
  function attach(card:HTMLElement,id:string){
    card.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{const text=label(b),icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim();
      if(icon==='thumb_up'){const active=read('demo:like:'+id,false);b.setAttribute('aria-pressed',String(active));if(active)b.textContent='Đã thích';bind(b,()=>{if(!requireSignIn())return;const liked=!read('demo:like:'+id,false);write('demo:like:'+id,liked);b.textContent=liked?'Đã thích':'Thích';b.setAttribute('aria-pressed',String(liked));});}
      else if(/Bình luận/.test(text))bind(b,()=>comment(id));
      else if(icon==='bookmark')bind(b,()=>{if(!requireSignIn())return;const saved=!read('demo:save-post:'+id,false);write('demo:save-post:'+id,saved);b.textContent=saved?'Đã lưu tài liệu':'Lưu tài liệu';b.setAttribute('aria-pressed',String(saved));});
      else if(icon==='download')bind(b,()=>download('tai-lieu-phong-van-demo.txt','TÀI LIỆU PHỎNG VẤN MẪU\n1. Giới thiệu dự án của bạn.\n2. Phân biệt state và props.\n3. Trình bày cách xử lý một lỗi khó.\n4. Bạn mong đợi điều gì ở kỳ thực tập?'));
      else if(icon==='share')bind(b,()=>share('Chia sẻ bài viết',location.origin+'/pages/community/#'+id));
    });
  }
  function render(){host.replaceChildren();posts.forEach(post=>{const card=document.createElement('article');card.className='demo-card';card.id=post.id;card.dataset.category=post.category;
    card.innerHTML=`<p><strong>${post.anonymous?'Người đăng ẩn danh':'Bạn'}</strong> · ${esc(post.category)}</p><p class="demo-prewrap">${esc(post.body)}</p>${post.file?`<p>Đính kèm: ${esc(post.file)} (mô phỏng)</p>`:''}<div class="demo-actions"><button type="button"><span class="material-symbols-outlined">thumb_up</span>Thích</button><button type="button">Bình luận</button><button type="button"><span class="material-symbols-outlined">share</span>Chia sẻ</button></div>`;
    card.querySelector('.demo-actions')!.append(button('Sửa',()=>edit(post.category,post.anonymous,post)),button('Xóa',()=>dialog('Xóa bài viết?','<p>Bài viết sẽ được gỡ khỏi bảng tin demo.</p>','Xóa',()=>{posts=posts.filter(p=>p.id!==post.id);write('demo:posts',posts);render();})));
    attach(card,post.id);host.append(card);
  });}
  function edit(category='Chia sẻ kinh nghiệm',anonymous=false,post?:Post){if(!requireSignIn())return;dialog(post?'Sửa bài viết':'Viết bài — '+category,`<label>Nội dung<textarea name="body" required>${esc(post?.body||'')}</textarea></label><label>Đính kèm tài liệu (tùy chọn)<input name="file" type="file" accept=".pdf,.txt,.doc,.docx"></label><label><input name="anonymous" type="checkbox" ${anonymous?'checked':''}> Đăng ẩn danh</label>`,'Đăng bài',f=>{const file=(f.elements.namedItem('file') as HTMLInputElement).files?.[0];const item={id:post?.id||'post-'+crypto.randomUUID(),body:value(f,'body'),category,anonymous:(f.elements.namedItem('anonymous') as HTMLInputElement).checked,file:file?.name||post?.file};posts=posts.filter(p=>p.id!==item.id);posts.unshift(item);write('demo:posts',posts);render();host.scrollIntoView({behavior:'smooth',block:'center'});});}
  const existing:HTMLElement[]=[];
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b=>{const icon=b.querySelector('.material-symbols-outlined')?.textContent?.trim();if(icon!=='more_horiz')return;let card=b.parentElement;while(card&&card.tagName!=='MAIN'&&!(card.querySelector('h2')&&card.querySelector('p')))card=card.parentElement;if(card&&card.tagName!=='MAIN'){card.id='community-post-'+existing.length;existing.push(card);attach(card,card.id);}});
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b=>{
    if(b.dataset.appControl)return;const text=label(b);
    if(/^(Thích|Bình luận)$/.test(text)){
      const card=b.closest<HTMLElement>('article,.bg-surface-container-lowest');
      if(card){if(!card.id)card.id='community-card-'+existing.length;if(!existing.includes(card))existing.push(card);attach(card,card.id);return;}
    }
    if(/Chia sẻ kinh nghiệm|Đăng bài|Hỏi ẩn danh|Tài liệu \/ Đề test/.test(text))bind(b,()=>edit(/Hỏi ẩn danh/.test(text)?'Hỏi đáp':/Tài liệu/.test(text)?'Tài liệu':'Chia sẻ kinh nghiệm',/ẩn danh/.test(text)));
    else if(/^(Nổi bật|Mới nhất|Từ Cựu sinh viên|Review phỏng vấn|Cổng ĐH)/.test(text))bind(b,()=>{const all=[...existing,...host.querySelectorAll<HTMLElement>('article')];all.forEach(card=>card.hidden=!/Nổi bật|Mới nhất/.test(text)&&!normal(card.innerText).includes(/Cựu/.test(text)?'mentor':/Review/.test(text)?'phong van':'bach khoa'));if(/Mới nhất/.test(text))host.scrollIntoView({behavior:'smooth'});b.parentElement?.querySelectorAll('button').forEach(x=>x.classList.toggle('demo-selected',x===b));toast(`${all.filter(c=>!c.hidden).length} bài viết phù hợp.`);});
    else if(/Kết nối/.test(text))bind(b,()=>compose('Kết nối với mentor','mentor@example.com'));
    else if(/Mentoring/.test(text))bind(b,()=>schedule('Mentoring 30 phút'));
  });
  document.querySelectorAll<HTMLAnchorElement>('main a').forEach(a=>{if(/đã lưu/i.test(label(a)))bind(a,()=>dialog('Tài liệu đã lưu',existing.filter(c=>read('demo:save-post:'+c.id,false)).map(c=>`<p>${esc(c.querySelector('h2')?.textContent||'Tài liệu phỏng vấn')}</p>`).join('')||'<p>Chưa lưu tài liệu nào.</p>','Đóng'));});
  render();if(location.hash)document.getElementById(location.hash.slice(1))?.scrollIntoView();
}
