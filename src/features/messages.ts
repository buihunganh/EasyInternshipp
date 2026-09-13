import { read, write } from '../lib/storage';
export function setupMessages() {
  const input=document.querySelector<HTMLInputElement>('input[placeholder^="Nhập tin nhắn"]');
  const stream=document.querySelector<HTMLElement>('.overflow-y-auto.space-y-md');
  if(!input || !stream)return;
  const messages=read<string[]>('messages',[]);
  const append=(text:string)=>{const bubble=document.createElement('div');bubble.className='app-chat-message';bubble.textContent=text;stream.append(bubble);stream.scrollTop=stream.scrollHeight;};
  messages.forEach(append);
  const send=()=>{const value=input.value.trim();if(!value)return;messages.push(value);write('messages',messages);append(value);input.value='';};
  input.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();send();}});
  input.parentElement?.querySelector('button')?.addEventListener('click',send);
}
