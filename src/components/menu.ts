export interface MenuItem { label: string; icon: string; action: () => void; danger?: boolean; divider?: boolean }
let dismiss: (() => void) | undefined;
let sequence = 0;

export function attachMenu(trigger: HTMLElement, items: () => MenuItem[], heading?: () => HTMLElement) {
  trigger.dataset.appControl = 'menu';
  trigger.setAttribute('aria-haspopup','menu'); trigger.setAttribute('aria-expanded','false');
  if (trigger.tagName!=='BUTTON') {trigger.setAttribute('role','button');trigger.tabIndex=0;}
  trigger.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    if(trigger.getAttribute('aria-expanded')==='true'){dismiss?.();return;}
    open();
  });
  trigger.addEventListener('keydown',event=>{
    if(['Enter',' ','ArrowDown'].includes(event.key)){event.preventDefault();event.stopPropagation();if(trigger.getAttribute('aria-expanded')!=='true')open();}
  });
  function open() {
    dismiss?.();
    const menu=document.createElement('div');menu.className='app-menu';menu.id=`app-menu-${++sequence}`;menu.setAttribute('role','menu');
    menu.setAttribute('aria-label',trigger.getAttribute('aria-label') || 'Tùy chọn');
    trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('aria-expanded','true');
    if(heading){const head=heading();head.setAttribute('role','presentation');menu.append(head);}
    for(const item of items()){
      if(item.divider){const divider=document.createElement('div');divider.className='app-menu-divider';divider.setAttribute('role','separator');menu.append(divider);}
      const button=document.createElement('button');button.type='button';button.className=`app-menu-item${item.danger?' app-menu-danger':''}`;button.setAttribute('role','menuitem');button.tabIndex=-1;
      const icon=document.createElement('span');icon.className='material-symbols-outlined';icon.setAttribute('aria-hidden','true');icon.textContent=item.icon;
      const text=document.createElement('span');text.textContent=item.label;button.append(icon,text);
      button.addEventListener('click',()=>{close();item.action();});menu.append(button);
    }
    document.body.append(menu);
    function position(){
      const rect=trigger.getBoundingClientRect();const width=menu.offsetWidth;
      menu.style.left=`${Math.max(12,Math.min(rect.right-width,innerWidth-width-12))}px`;
      menu.style.top=`${Math.max(12,Math.min(rect.bottom+10,innerHeight-menu.offsetHeight-12))}px`;
    }
    function outside(event:PointerEvent){if(!menu.contains(event.target as Node)&&!trigger.contains(event.target as Node))close(false);}
    function keyboard(event:KeyboardEvent){
      if(event.key==='Escape'){event.preventDefault();close();return;}
      if(event.key==='Tab'){close(false);return;}
      const buttons=[...menu.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];
      const index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
      }
    }
    function close(restore=true){
      menu.remove();trigger.setAttribute('aria-expanded','false');trigger.removeAttribute('aria-controls');
      document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',keyboard);window.removeEventListener('resize',position);window.removeEventListener('scroll',position,true);
      if(restore)trigger.focus();if(dismiss===close)dismiss=undefined;
    }
    dismiss=close;position();menu.querySelector<HTMLButtonElement>('button')?.focus();
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',keyboard);window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  }
}
