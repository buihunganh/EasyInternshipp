import { listAllNotifications, markNotificationsRead, unreadNotificationCount } from '../../core/accountApi';
import { relativeTime } from '../../core/format';
import { el } from '../../core/render';
import { showError } from '../../core/errors';
import { bind } from '../../core/ui/actions';
import { toast } from '../../core/ui/feedback';

export function setupNotifications() {
  const page = document.querySelector<HTMLElement>('#notifications-page');
  if (!page) return;

  const listEl = page.querySelector<HTMLUListElement>('#notifications-list')!;
  const markAllBtn = page.querySelector<HTMLButtonElement>('#mark-all-read-btn');
  const tabAll = page.querySelector<HTMLButtonElement>('#tab-all');
  const tabUnread = page.querySelector<HTMLButtonElement>('#tab-unread');

  let unreadOnly = false;

  const iconMap: Record<string, string> = {
    cv_viewed: 'visibility',
    interview_invite: 'calendar_month',
    interview_rsvp: 'event_available',
    offer_received: 'workspace_premium',
    offer_accepted: 'check_circle',
    offer_declined: 'cancel',
    message: 'chat',
    job_alert: 'notifications_active',
    verification: 'verified',
  };

  const icon = (name: string) => el('span', { className: 'material-symbols-outlined' }, name);
  const skeletons = () => Array.from({ length: 4 }, () => el('li', { className: 'notif-skeleton', 'aria-hidden': 'true' },
    el('span', { className: 'ui-skeleton ui-skeleton--avatar' }), el('span', {}, el('span', { className: 'ui-skeleton ui-skeleton--title' }), el('span', { className: 'ui-skeleton ui-skeleton--text' }))));

  async function render() {
    listEl.replaceChildren(...skeletons());
    try {
      const items = await listAllNotifications(unreadOnly);
      listEl.replaceChildren();

      if (!items.length) {
        listEl.append(el('li', { className: 'ui-empty', role: 'status' }, el('span', { className: 'ui-empty__icon' }, icon('notifications')),
          el('h3', {}, unreadOnly ? 'Không có thông báo chưa đọc nào.' : 'Bạn chưa có thông báo nào.')));
        return;
      }

      items.forEach(n => {
        const isUnread = !n.read_at;
        const li = el('li', { className: `ui-row notif${isUnread ? ' is-unread' : ''}`, tabIndex: 0, role: 'button' },
          el('span', { className: 'ui-avatar notif__icon' }, icon(iconMap[n.type] || 'notifications')),
          el('div', { className: 'ui-row__body' },
            el('h3', { className: 'notif__title' }, n.title),
            n.body ? el('p', { className: 'ui-row__subtitle' }, n.body) : null,
            el('span', { className: 'ui-meta' }, relativeTime(n.created_at))),
          isUnread ? el('span', { className: 'notif__dot', 'aria-label': 'Chưa đọc' }) : null);

        bind(li, async () => {
          try {
            if (isUnread) {
              await markNotificationsRead([n.id]);
            }
            if (n.link) {
              location.assign(n.link);
            } else {
              await render();
            }
          } catch (e) { showError(e); }
        });

        li.addEventListener('keydown', e => {
          if (e.key === 'Enter') li.click();
        });

        listEl.append(li);
      });
    } catch (e) {
      showError(e, listEl);
    }
  }

  if (markAllBtn) {
    bind(markAllBtn, async () => {
      try {
        await markNotificationsRead();
        toast('Đã đánh dấu tất cả thông báo là đã đọc.');
        document.querySelectorAll('.app-notification-badge').forEach(b => b.remove());
        await render();
      } catch (e) { showError(e); }
    });
  }

  if (tabAll && tabUnread) {
    const select = (unread: boolean) => {
      unreadOnly = unread;
      tabAll.setAttribute('aria-selected', String(!unread));
      tabUnread.setAttribute('aria-selected', String(unread));
      void render();
    };
    bind(tabAll, () => select(false));
    bind(tabUnread, () => select(true));
  }

  void render();
}
