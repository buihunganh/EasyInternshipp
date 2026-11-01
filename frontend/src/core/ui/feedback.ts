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
export interface DialogOptions {
  /**
   * Keep the dialog open while `action` runs. If it throws, the error is shown inside the dialog
   * (`.app-form-error`) and the user can fix the form; it closes when the action finishes, unless
   * the action returns `false`.
   */
  keepOpen?: boolean;
}

export function dialog(title: string, content: string, confirm = 'Xác nhận', action?: (form: HTMLFormElement) => unknown, options: DialogOptions = {}) {
  const previousFocus=document.activeElement as HTMLElement|null;
  const el = document.createElement('dialog'); el.className = 'app-dialog';
  el.innerHTML = `<form><div class="app-dialog-heading"><h2></h2><button type="button" aria-label="Đóng">×</button></div><div class="app-dialog-content">${content}</div><div class="app-dialog-actions"><button type="button">Hủy</button><button type="submit" class="app-primary"></button></div></form>`;
  el.querySelector('h2')!.textContent = title;
  const titleId=`dialog-title-${crypto.randomUUID()}`;
  el.querySelector('h2')!.id=titleId;el.setAttribute('aria-labelledby',titleId);
  const submit = el.querySelector<HTMLButtonElement>('[type=submit]')!;
  submit.textContent = confirm;
  // Only the header "×" and the footer "Hủy" close the dialog (content may contain its own buttons)
  el.querySelectorAll('.app-dialog-heading>button,.app-dialog-actions>[type=button]').forEach(b => b.addEventListener('click', () => el.close()));
  el.addEventListener('close', () => {el.remove();if(!document.querySelector('dialog[open]'))previousFocus?.focus();});
  el.addEventListener('click',event=>{if(event.target===el){const rect=el.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)el.close();}});
  el.querySelector('form')!.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    if (!options.keepOpen) { el.close(); action?.(form); return; }
    let box = el.querySelector<HTMLElement>('.app-form-error');
    if (!box) { box = document.createElement('p'); box.className = 'app-form-error'; box.setAttribute('role', 'alert'); el.querySelector('.app-dialog-content')!.prepend(box); }
    box.hidden = true;
    submit.disabled = true; submit.setAttribute('aria-busy', 'true');
    try {
      const result = await action?.(form);
      if (result !== false) el.close();
    } catch (error) {
      box.textContent = (error as Error)?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.';
      box.hidden = false;
    } finally { submit.disabled = false; submit.removeAttribute('aria-busy'); }
  });
  document.body.append(el); el.showModal();
  return el;
}
