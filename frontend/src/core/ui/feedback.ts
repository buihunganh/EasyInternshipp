export function toast(message: string) {
  let element = document.getElementById('app-feedback');
  if (!element) {
    element = document.createElement('div'); element.id = 'app-feedback';
    element.setAttribute('role', 'status'); document.body.append(element);
  }
  element.textContent = message; element.hidden = false;
  window.clearTimeout(Number(element.dataset.timer));
  element.dataset.timer = String(window.setTimeout(() => { element!.hidden = true; }, 4000));
}
export function dialog(title: string, content: string, confirm = 'Xác nhận', action?: (form: HTMLFormElement) => void) {
  const previousFocus=document.activeElement as HTMLElement|null;
  const el = document.createElement('dialog'); el.className = 'app-dialog';
  el.innerHTML = `<form><div class="app-dialog-heading"><h2></h2><button type="button" aria-label="Đóng">×</button></div><div class="app-dialog-content">${content}</div><div class="app-dialog-actions"><button type="button">Hủy</button><button type="submit" class="app-primary"></button></div></form>`;
  el.querySelector('h2')!.textContent = title;
  const titleId=`dialog-title-${crypto.randomUUID()}`;
  el.querySelector('h2')!.id=titleId;el.setAttribute('aria-labelledby',titleId);
  el.querySelector('[type=submit]')!.textContent = confirm;
  el.querySelectorAll('[type=button]').forEach(b => b.addEventListener('click', () => el.close()));
  el.addEventListener('close', () => {el.remove();if(!document.querySelector('dialog[open]'))previousFocus?.focus();});
  el.addEventListener('click',event=>{if(event.target===el){const rect=el.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)el.close();}});
  el.querySelector('form')!.addEventListener('submit', e => { e.preventDefault();el.close();action?.(e.currentTarget as HTMLFormElement); });
  document.body.append(el); el.showModal();
  return el;
}
