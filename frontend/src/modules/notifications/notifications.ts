import { listAllNotifications, markNotificationsRead, unreadNotificationCount } from '../../core/accountApi';
import { relativeTime } from '../../core/format';
import { el, showState } from '../../core/render';
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

  async function render() {
    showState(listEl, 'loading', 'Đang tải thông báo...');
    try {
      const items = await listAllNotifications(unreadOnly);
      listEl.replaceChildren();

      if (!items.length) {
        showState(listEl, 'empty', unreadOnly ? 'Không có thông báo chưa đọc nào.' : 'Bạn chưa có thông báo nào.');
        return;
      }

      items.forEach(n => {
        const isUnread = !n.read_at;
        const iconName = iconMap[n.type] || 'notifications';

        const li = el('li', {
          className: `ei-list-row cursor-pointer transition-all ${isUnread ? 'bg-primary/5 font-medium' : ''}`,
          tabIndex: 0,
          role: 'button',
        },
          el('div', { className: 'flex items-start gap-3 w-full p-2' },
            el('div', { className: `w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isUnread ? 'bg-primary/10 text-primary' : 'bg-surface-container text-on-surface-variant'}` },
              el('span', { className: 'material-symbols-outlined text-[20px]' }, iconName)
            ),
            el('div', { className: 'flex-1 min-w-0' },
              el('div', { className: 'flex items-center justify-between gap-2' },
                el('h3', { className: `font-label-md text-[14px] ${isUnread ? 'text-primary font-bold' : 'text-on-surface'}` }, n.title),
                el('span', { className: 'text-[12px] text-on-surface-variant shrink-0' }, relativeTime(n.created_at))
              ),
              n.body ? el('p', { className: 'text-[13px] text-on-surface-variant mt-0.5' }, n.body) : null
            ),
            isUnread ? el('span', { className: 'w-2 h-2 rounded-full bg-primary shrink-0 self-center' }) : null
          )
        );

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
    bind(tabAll, () => {
      unreadOnly = false;
      tabAll.classList.add('ei-button-primary');
      tabUnread.classList.remove('ei-button-primary');
      void render();
    });

    bind(tabUnread, () => {
      unreadOnly = true;
      tabUnread.classList.add('ei-button-primary');
      tabAll.classList.remove('ei-button-primary');
      void render();
    });
  }

  void render();
}
