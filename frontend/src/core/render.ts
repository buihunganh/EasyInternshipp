// Rendering helpers: reuse the design's own markup as templates so generated Tailwind classes keep working.

/** Deep-clone an element to use as a list item template. */
export function cloneTemplate<T extends Element>(template: T): T {
  const copy = template.cloneNode(true) as T;
  copy.removeAttribute('id');
  copy.removeAttribute('hidden');
  return copy;
}

/** Replace `container`'s children with one clone of `template` per item, filled by `fill`. */
export function renderList<T, E extends Element>(container: Element, template: E, items: T[], fill: (el: E, item: T, index: number) => void) {
  const nodes = items.map((item, index) => { const el = cloneTemplate(template); fill(el, item, index); return el; });
  container.replaceChildren(...nodes);
  return nodes;
}

/** Set text on the first element matching `selector` inside `root` (no-op when missing). */
export function setText(root: ParentNode, selector: string, text: string | number | null | undefined) {
  const el = root.querySelector(selector);
  if (el) el.textContent = text == null ? '' : String(text);
  return el;
}

type StateKind = 'loading' | 'empty' | 'error';
const stateText: Record<StateKind, string> = {
  loading: 'Đang tải dữ liệu...',
  empty: 'Chưa có dữ liệu.',
  error: 'Không tải được dữ liệu. Vui lòng thử lại.',
};

/** A consistent loading / empty / error block (class `app-state app-state-<kind>`). */
export function stateBlock(kind: StateKind, message = stateText[kind], retry?: () => void) {
  const block = document.createElement('div');
  block.className = `app-state app-state-${kind}`;
  block.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  const text = document.createElement('p');
  text.textContent = message;
  block.append(text);
  if (retry) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'app-state-retry'; button.textContent = 'Thử lại';
    button.dataset.appControl = 'retry';
    button.addEventListener('click', retry);
    block.append(button);
  }
  return block;
}

/** Show a state block inside `container`, replacing its content. */
export function showState(container: Element, kind: StateKind, message?: string, retry?: () => void) {
  container.replaceChildren(stateBlock(kind, message, retry));
}

/** Small DOM builder: el('a', { href: '/', className: 'x' }, 'text'). */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & Record<string, unknown> = {}, ...children: (Node | string | null | undefined | false)[]) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null) continue;
    if (key.startsWith('data-') || key.startsWith('aria-') || key === 'role') node.setAttribute(key, String(value));
    else (node as unknown as Record<string, unknown>)[key] = value;
  }
  for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

/** Escape HTML characters in strings for safe interpolation. */
export function esc(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
