import { isRecruiterWorkspace, workspaceHref } from '../../core/workspace';
import { currentRole, currentProfile, currentSession } from '../../core/session';
import { dialog, toast } from '../../core/ui/feedback';
import { attachMenu } from '../../core/ui/menu';
import { bind, button, field, normal, upload, value } from '../../core/ui/actions';
import { publicUrl } from '../../core/supabase';
import { showError } from '../../core/errors';
import { esc, el } from '../../core/render';
import { initialsAvatar } from '../../core/layout/siteHeader';
import { formatDateTime, relativeTime, formatBytes, localDateTimeInput } from '../../core/format';
import { reportContent } from '../../core/report';
import { routes, companyHref, jobHref } from '../../core/navigation';
import {
  listConversations, listMessages, sendMessage, uploadMessageAttachment,
  messageAttachmentUrl, cvSignedUrl, markConversationRead, setConversationPreference,
  subscribeToMessages, getConversationContext, getInterview, respondInterview,
  type ConversationItem, type MessageItem, type ConversationContextData
} from './api';

/** Replace a button's label text while keeping its child elements (dots, icons). */
function setIconlessText(button: HTMLElement, text: string) {
  const node = [...button.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
  if (node) node.textContent = ` ${text} `; else button.append(text);
}

export async function setupMessages() {
  const root = document.querySelector<HTMLElement>('main[data-page="messages"], body[data-page="messages"] main');
  const input = document.querySelector<HTMLInputElement>('input[placeholder^="Nhập tin nhắn"]')!;
  const stream = document.querySelector<HTMLElement>('.overflow-y-auto.space-y-md')!;
  if (!input || !stream) return;

  const section = input.closest('section')!;
  const grid = section.parentElement!;
  const leftAside = grid.querySelector('aside:first-child')!;
  const rightAside = grid.querySelector('aside:last-child');
  const feedContainer = leftAside.querySelector('.flex-1.overflow-y-auto')!;
  feedContainer.classList.add('msg-rows');
  const searchInput = leftAside.querySelector<HTMLInputElement>('input')!;

  const recruiter = isRecruiterWorkspace() || currentRole() === 'employer';
  const myUid = currentSession()?.user.id ?? '';

  // --- Remove the design's sample content that has no real data behind it -----------------
  const topBar = grid.previousElementSibling;   // breadcrumb + trust badges, right above the 3-column grid
  const crumbs = topBar?.firstElementChild;
  const crumbCurrent = crumbs?.lastElementChild as HTMLElement | null | undefined;
  if (crumbCurrent) crumbCurrent.textContent = 'Tin nhắn tuyển dụng';
  const trustRow = topBar?.children[1];   // "Hệ thống … xác minh" | "Tỉ lệ phản hồi HR: 98% …"
  if (trustRow && /Tỉ lệ phản hồi/.test(trustRow.textContent || '')) [...trustRow.children].slice(1).forEach(c => c.remove());
  const tabs = [...leftAside.querySelectorAll<HTMLButtonElement>('button')].filter(b => /Tất cả|Chưa đọc|Phỏng vấn|Lưu trữ/.test(b.textContent || ''));
  tabs.forEach(b => b.childNodes.forEach(n => { if (n.nodeType === Node.TEXT_NODE) n.textContent = n.textContent!.replace(/\s*\(\d+\)/, ''); }));
  const allTab = tabs.find(b => /Tất cả/.test(b.textContent || ''));
  tabs.forEach(b => b.setAttribute('aria-pressed', String(b === allTab)));
  allTab?.parentElement?.classList.add('msg-filters');
  tabs.find(b => /Phỏng vấn/.test(b.textContent || ''))?.remove();   // conversations have no interview filter
  [...leftAside.querySelectorAll('span')].find(sp => /Đang tìm thực tập/.test(sp.textContent || ''))?.closest('.m-xs')?.remove();   // static status footer
  const header = section.firstElementChild as HTMLElement;   // chat header
  header.querySelector('.relative > span.absolute')?.remove();   // fake "online" dot on the avatar
  [...header.querySelectorAll('span')].find(sp => sp.textContent?.trim() === 'Đang online')?.remove();
  const subbar = section.children[1] as HTMLElement;   // "Đang thảo luận: <job>" bar
  subbar.querySelector('.font-mono')?.remove();   // design job code "TN-2024-FE"
  const headerAvatar = header.querySelector<HTMLImageElement>('img');
  const headerSubtitle = header.querySelector<HTMLElement>('.text-on-surface-variant');
  const headerActions = header.lastElementChild as HTMLElement;
  const headerTick = header.querySelector<HTMLElement>('h2 + .material-symbols-outlined');   // "verified" tick next to the name
  /** Show or hide everything that only makes sense with an open conversation. */
  // The composer (tools row + input/send row) only makes sense with an open conversation
  const composer = [section.querySelector<HTMLElement>('.msg-composer'), input.closest<HTMLElement>('.msg-field')];
  function showThreadChrome(on: boolean) {
    composer.forEach(node => { if (node) node.hidden = !on; });
    if (headerAvatar) headerAvatar.parentElement!.hidden = !on;
    if (headerSubtitle) headerSubtitle.hidden = !on;
    headerActions.hidden = !on;
    if (headerTick) headerTick.hidden = !on;
    subbar.hidden = !on;
    if (rightAside) (rightAside as HTMLElement).hidden = !on;
  }
  showThreadChrome(false);

  // Narrow screens show either the list or the thread; the back button returns to the list.
  const backBtn = section.querySelector<HTMLButtonElement>('.msg-back');
  if (backBtn) bind(backBtn, () => grid.classList.remove('msg-show-thread'));

  let conversations: ConversationItem[] = [];
  let activeConv: ConversationItem | null = null;
  let activeContext: ConversationContextData | null = null;
  let activeMessages: MessageItem[] = [];
  let unsubscribeRealtime: (() => void) | null = null;
  let currentFilterMode = 'all';

  // Status text for muted/archived indicator
  const statusEl = document.createElement('p');
  statusEl.id = 'conversation-status';
  statusEl.className = 'app-conversation-status';
  statusEl.hidden = true;
  section.children[1]?.after(statusEl);

  // Mobile conversation switcher button
  const switcher = button('Đổi hội thoại', () => {
    if (!conversations.length) {
      toast('Không có cuộc trò chuyện nào.');
      return;
    }
    const modal = dialog('Chọn cuộc trò chuyện',
      `<label>Người nhận<select name="conversation">${conversations.map(c => {
        const name = c.other_user?.full_name || c.company?.name || 'Hội thoại';
        return `<option value="${c.id}" ${c.id === activeConv?.id ? 'selected' : ''}>${esc(name)}</option>`;
      }).join('')}</select></label>`,
      'Mở hội thoại', form => {
        const selectedId = value(form, 'conversation');
        selectConversation(selectedId, true);
      });
  });
  switcher.classList.add('demo-conversation-switch');
  section.firstElementChild?.append(switcher);

  // Initialize
  async function loadData() {
    try {
      feedContainer.innerHTML = '<div class="msg-note">Đang tải cuộc trò chuyện...</div>';
      conversations = await listConversations();

      const urlParams = new URLSearchParams(location.search);
      const convParam = urlParams.get('conversation');
      const candidateParam = urlParams.get('candidate');

      let initial: ConversationItem | undefined;
      if (convParam) {
        initial = conversations.find(c => c.id === convParam);
      } else if (candidateParam) {
        initial = conversations.find(c =>
          normal(c.other_user?.full_name || '').includes(normal(candidateParam)));
      }

      if (!initial && conversations.length > 0) {
        initial = conversations[0];
      }

      if (allTab) setIconlessText(allTab, `Tất cả (${conversations.filter(c => !c.is_archived).length})`);
      renderConversationsList();

      if (initial) {
        await selectConversation(initial.id, !!(convParam || candidateParam));
      } else {
        renderEmptyThread();
      }
    } catch (e) {
      showError(e, feedContainer as HTMLElement);
    }
  }

  function renderEmptyThread() {
    section.querySelector('h2')!.textContent = 'Chưa chọn cuộc trò chuyện';
    input.placeholder = 'Chọn một cuộc trò chuyện để bắt đầu nhắn tin...';
    input.disabled = true;
    showThreadChrome(false);
    if (crumbCurrent) crumbCurrent.textContent = 'Tin nhắn tuyển dụng';
    stream.innerHTML = `
      <div class="ui-empty msg-empty">
        <span class="ui-empty__icon material-symbols-outlined" aria-hidden="true">forum</span>
        <h3 class="ui-empty__title">Hộp thư tuyển dụng</h3>
        <p>Chọn một cuộc trò chuyện từ danh sách bên trái hoặc ứng tuyển việc làm để bắt đầu trao đổi với nhà tuyển dụng.</p>
      </div>`;
  }

  function renderConversationsList() {
    feedContainer.replaceChildren();
    if (!conversations.length) {
      feedContainer.innerHTML = `
        <div class="ui-empty msg-empty">
          <span class="ui-empty__icon material-symbols-outlined" aria-hidden="true">chat_bubble_outline</span>
          <p>Chưa có cuộc trò chuyện nào.</p>
        </div>`;
      if (currentRole() === 'student') feedContainer.querySelector('.msg-empty')?.append(el('a', { className: 'ui-btn ui-btn--neutral ui-btn--sm', href: routes.applications }, 'Xem đơn ứng tuyển'));
      return;
    }

    const query = normal(searchInput.value || '');

    conversations.forEach((conv) => {
      const isArchived = conv.is_archived;
      const isUnread = conv.unread_count > 0;
      const partnerName = conv.other_user?.full_name || conv.company?.name || 'Nhà tuyển dụng';
      const companyOrRole = conv.company?.name || (conv.other_user?.role === 'student' ? 'Sinh viên ứng tuyển' : 'Nhà tuyển dụng');
      const snippet = conv.last_message_preview || 'Bắt đầu cuộc trò chuyện...';

      // Mode filter
      if (currentFilterMode === 'archived' && !isArchived) return;
      if (currentFilterMode !== 'archived' && isArchived) return;
      if (currentFilterMode === 'unread' && !isUnread) return;
      // Filter search
      if (query && !normal(partnerName).includes(query) && !normal(companyOrRole).includes(query) && !normal(snippet).includes(query)) {
        return;
      }

      const isSelected = activeConv?.id === conv.id;
      const card = document.createElement('div');
      card.className = `msg-row${isSelected ? ' is-selected' : ''}${isUnread ? ' is-unread' : ''}`;
      card.dataset.conversationId = conv.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      if (isSelected) card.setAttribute('aria-current', 'true');

      const avatarSrc = conv.other_user?.avatar_path
        ? publicUrl('avatars', conv.other_user.avatar_path)
        : (conv.company?.logo_path ? publicUrl('company-assets', conv.company.logo_path) : initialsAvatar(partnerName));

      const timeStr = conv.last_message_at ? relativeTime(conv.last_message_at) : '';

      card.innerHTML = `
        <img class="msg-row__avatar" src="${esc(avatarSrc)}" alt="${esc(partnerName)}">
        <div class="msg-row__body">
          <div class="msg-row__top">
            <h3 class="msg-row__name">${esc(partnerName)}</h3>
            <span class="msg-row__time">${esc(timeStr)}</span>
          </div>
          <p class="msg-row__sub">${esc(companyOrRole)}</p>
          <div class="msg-row__last">
            <p class="msg-row__snippet">${esc(snippet)}</p>
            ${isUnread ? `<span class="msg-row__dot" role="img" aria-label="${conv.unread_count} tin chưa đọc"></span>` : ''}
          </div>
        </div>`;

      bind(card, () => selectConversation(conv.id, true));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter') selectConversation(conv.id, true);
      });

      feedContainer.append(card);
    });
  }

  async function selectConversation(id: string, reveal = false) {
    const target = conversations.find(c => c.id === id);
    if (!target) return;
    activeConv = target;
    if (reveal) grid.classList.add('msg-show-thread');

    // Unsubscribe previous realtime channel
    if (unsubscribeRealtime) {
      unsubscribeRealtime();
      unsubscribeRealtime = null;
    }

    // Update URL query param
    const url = new URL(location.href);
    url.searchParams.set('conversation', target.id);
    history.replaceState(null, '', url.toString());

    // Update Col 1 visual selection
    renderConversationsList();

    // Mark conversation read in database
    target.unread_count = 0;
    void markConversationRead(target.id).catch(() => {});

    // Update status indicator
    statusEl.textContent = [
      target.is_muted ? 'Đã tắt thông báo' : '',
      target.is_archived ? 'Đã lưu trữ cuộc trò chuyện' : ''
    ].filter(Boolean).join(' · ');
    statusEl.hidden = !statusEl.textContent;

    // Enable input
    input.disabled = false;
    const partnerName = target.other_user?.full_name || target.company?.name || 'Nhà tuyển dụng';
    input.placeholder = `Nhập tin nhắn cho ${partnerName}... (Nhấn Enter để gửi)`;

    // Update Header
    section.querySelector('h2')!.textContent = partnerName;
    if (crumbCurrent) crumbCurrent.textContent = partnerName;
    if (headerAvatar) {
      headerAvatar.src = target.other_user?.avatar_path
        ? publicUrl('avatars', target.other_user.avatar_path)
        : (target.company?.logo_path ? publicUrl('company-assets', target.company.logo_path) : initialsAvatar(partnerName));
      headerAvatar.alt = partnerName;
    }
    showThreadChrome(true);

    // Load messages and context
    try {
      stream.innerHTML = '<div class="msg-note">Đang tải tin nhắn...</div>';
      const [messagesData, contextData] = await Promise.all([
        listMessages(target.id),
        getConversationContext(target)
      ]);
      activeMessages = messagesData;
      activeContext = contextData;

      renderThreadHeader();
      renderStream();
      renderContextSidebar();

      // Subscribe to realtime messages for this conversation
      unsubscribeRealtime = subscribeToMessages(target.id, (newMsg) => {
        // Prevent duplicate if already in activeMessages
        if (activeMessages.some(m => m.id === newMsg.id)) return;
        const msgItem: MessageItem = {
          id: newMsg.id,
          conversation_id: newMsg.conversation_id,
          sender_id: newMsg.sender_id,
          kind: newMsg.kind,
          body: newMsg.body,
          attachment_name: newMsg.attachment_name,
          attachment_path: newMsg.attachment_path,
          attachment_size: newMsg.attachment_size,
          metadata: (newMsg.metadata ?? {}) as Record<string, any>,
          created_at: newMsg.created_at,
          sender: newMsg.sender_id === myUid
            ? currentProfile()
            : (target.other_user ?? null),
        };
        activeMessages.push(msgItem);
        appendMessage(msgItem);
        // Also update last message preview in conversations list
        target.last_message_preview = msgItem.body;
        target.last_message_at = msgItem.created_at;
        renderConversationsList();
        void markConversationRead(target.id).catch(() => {});
      });

    } catch (e) {
      showError(e, stream);
    }
  }

  function renderThreadHeader() {
    if (!activeConv) return;
    const partner = activeConv.other_user;
    const company = activeContext?.company || activeConv.company;

    // Subtitle in header
    const subtitleEl = section.querySelector('.backdrop-blur-md .text-on-surface-variant');
    if (subtitleEl) {
      if (partner?.role === 'student' && activeContext?.student) {
        subtitleEl.innerHTML = `<span>${esc(activeContext.student.major || 'Sinh viên')}</span> • <span>${esc(activeContext.student.university_name || 'Ứng viên tiềm năng')}</span>`;
      } else {
        subtitleEl.innerHTML = `<span>Tuyển dụng</span> • <span>${esc(company?.name || 'Doanh nghiệp')}</span>`;
      }
    }

    // Sub-bar (job vacancy info)
    if (subbar) {
      const app = activeContext?.application;
      const statusBox = subbar.querySelector<HTMLElement>('.text-tertiary');
      if (statusBox) statusBox.hidden = !app;
      if (app) {
        subbar.classList.remove('hidden');
        const titleEl = subbar.querySelector('.font-semibold');
        if (titleEl) titleEl.textContent = app.job_title;
        const statusBadge = subbar.querySelector('.text-tertiary');
        if (statusBadge) {
          const statusMap: Record<string, string> = {
            applied: 'Đã nộp đơn',
            cv_viewed: 'Đã xem CV',
            shortlisted: 'Đã vào danh sách ngắn',
            interviewing: 'Đang phỏng vấn',
            offered: 'Đã gửi offer',
            hired: 'Đã tuyển dụng',
            rejected: 'Không phù hợp',
            withdrawn: 'Đã rút đơn'
          };
          statusBadge.innerHTML = `<span class="msg-dot" aria-hidden="true"></span><span>${esc(statusMap[app.status] || app.status)}</span>`;
        }
      } else {
        // Just general conversation
        const titleEl = subbar.querySelector('.font-semibold');
        if (titleEl) titleEl.textContent = company?.name ? `Trao đổi cơ hội nghề nghiệp tại ${company.name}` : 'Trao đổi tuyển dụng';
      }
    }

    // Bind action buttons in header
    const companyBtn = [...section.querySelectorAll<HTMLButtonElement>('button')].find(b => b.querySelector('.material-symbols-outlined')?.textContent?.trim() === 'apartment') ||
      [...section.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Hồ sơ'));
    if (companyBtn) {
      if (recruiter && activeContext?.application) {
        companyBtn.innerHTML = '<span class="material-symbols-outlined">badge</span><span>Xem đơn ứng tuyển</span>';
        bind(companyBtn, () => location.assign(`/pages/candidates/?job=${activeContext!.application!.job_id}`));
      } else if (company?.id) {
        companyBtn.innerHTML = '<span class="material-symbols-outlined">apartment</span><span>Hồ sơ công ty</span>';
        bind(companyBtn, () => location.assign(companyHref(company.id)));
      }
    }

    const videoBtn = [...section.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('Video Call'));
    if (videoBtn) {
      bind(videoBtn, () => {
        // Check if there is an active interview with meeting_url
        const interviewMsg = [...activeMessages].reverse().find(m => m.kind === 'interview_invite');
        const meetingUrl = interviewMsg?.metadata?.meeting_url;
        if (meetingUrl) {
          window.open(meetingUrl, '_blank', 'noopener,noreferrer');
        } else if (recruiter) {
          dialog('Phỏng vấn trực tuyến', '<p>Cuộc trò chuyện này chưa có lịch phỏng vấn trực tuyến. Lên lịch phỏng vấn (kèm đường dẫn Google Meet, Zoom…) từ hồ sơ ứng viên; lời mời sẽ xuất hiện ngay trong cuộc trò chuyện.</p>',
            activeContext?.application ? 'Mở hồ sơ ứng viên' : 'Đã hiểu',
            activeContext?.application ? () => location.assign(`/pages/candidates/?job=${activeContext!.application!.job_id}`) : undefined);
        } else {
          dialog('Phỏng vấn trực tuyến', '<p>Chưa có lịch phỏng vấn trực tuyến. Khi nhà tuyển dụng gửi lời mời, đường dẫn phòng họp sẽ xuất hiện trong cuộc trò chuyện và nút này sẽ mở phòng họp.</p>', 'Đã hiểu');
        }
      });
    }

    const moreBtn = section.querySelector<HTMLButtonElement>('button[title="Thêm tuỳ chọn"]') ||
      [...section.querySelectorAll<HTMLButtonElement>('button')].find(b => b.querySelector('.material-symbols-outlined')?.textContent?.trim() === 'more_vert');
    if (moreBtn && activeConv) {
      moreBtn.setAttribute('aria-label', 'Tùy chọn cuộc trò chuyện');
      attachMenu(moreBtn, () => [
        {
          label: activeConv!.is_muted ? 'Bật thông báo cuộc trò chuyện' : 'Tắt thông báo cuộc trò chuyện',
          icon: 'notifications',
          action: async () => {
            try {
              const nextMuted = !activeConv!.is_muted;
              await setConversationPreference(activeConv!.id, { is_muted: nextMuted });
              activeConv!.is_muted = nextMuted;
              toast(nextMuted ? 'Đã tắt thông báo cuộc trò chuyện.' : 'Đã bật thông báo cuộc trò chuyện.');
              statusEl.textContent = [
                activeConv!.is_muted ? 'Đã tắt thông báo' : '',
                activeConv!.is_archived ? 'Đã lưu trữ cuộc trò chuyện' : ''
              ].filter(Boolean).join(' · ');
              statusEl.hidden = !statusEl.textContent;
            } catch (err) { showError(err); }
          }
        },
        {
          label: activeConv!.is_archived ? 'Bỏ lưu trữ cuộc trò chuyện' : 'Lưu trữ cuộc trò chuyện',
          icon: 'archive',
          action: async () => {
            try {
              const nextArchived = !activeConv!.is_archived;
              await setConversationPreference(activeConv!.id, { is_archived: nextArchived });
              activeConv!.is_archived = nextArchived;
              toast(nextArchived ? 'Đã lưu trữ cuộc trò chuyện.' : 'Đã bỏ lưu trữ cuộc trò chuyện.');
              renderConversationsList();
            } catch (err) { showError(err); }
          }
        },
        {
          label: 'Báo cáo cuộc trò chuyện',
          icon: 'flag',
          action: () => {
            const partnerId = activeConv?.other_user?.id;
            const partnerName = activeConv?.other_user?.full_name || activeConv?.company?.name || 'Người dùng';
            if (partnerId) {
              reportContent(`Cuộc trò chuyện với ${partnerName}`, { type: 'user', id: partnerId });
            } else {
              toast('Không thể báo cáo cuộc trò chuyện này.');
            }
          }
        }
      ]);
    }
  }

  function renderStream() {
    stream.replaceChildren();
    lastGroup = null;

    if (!activeMessages.length) {
      const welcome = document.createElement('div');
      welcome.className = 'ui-empty msg-empty';
      welcome.innerHTML = `
        <span class="ui-empty__icon material-symbols-outlined" aria-hidden="true">lock</span>
        <p>Cuộc trò chuyện được mã hoá bảo mật giữa bạn và ${esc(activeConv?.other_user?.full_name || activeConv?.company?.name || 'nhà tuyển dụng')}.</p>
      `;
      stream.append(welcome);
      return;
    }

    // Render date separator
    const dateDiv = document.createElement('div');
    dateDiv.className = 'msg-date';
    dateDiv.innerHTML = `<span>${esc(formatDateTime(activeMessages[0].created_at))}</span>`;
    stream.append(dateDiv);

    activeMessages.forEach(msg => appendMessage(msg));
    stream.scrollTop = stream.scrollHeight;
  }

  /** Sender and time of the previous bubble, so a run of messages from one person shows the name and avatar once. */
  let lastGroup: { sender: string; at: number } | null = null;

  function appendMessage(msg: MessageItem) {
    const isOutbound = msg.sender_id === myUid;
    const at = new Date(msg.created_at);
    const timeFormatted = at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const senderName = isOutbound
      ? 'Bạn'
      : (msg.sender?.full_name || activeConv?.other_user?.full_name || 'Nhà tuyển dụng');

    const avatarSrc = isOutbound
      ? (publicUrl('avatars', currentProfile()?.avatar_path) || '/assets/images/33290a779af11a09.png')
      : (msg.sender?.avatar_path ? publicUrl('avatars', msg.sender.avatar_path) : (activeConv?.other_user?.avatar_path ? publicUrl('avatars', activeConv.other_user.avatar_path) : '/assets/images/41410c47c78c26aa.png'));

    const row = document.createElement('div');

    if (msg.kind === 'interview_invite') {
      // Interactive interview invite card
      lastGroup = null;
      renderInterviewCard(row, msg);
    } else {
      const continued = !!lastGroup && lastGroup.sender === msg.sender_id && at.getTime() - lastGroup.at < 5 * 60000;
      lastGroup = { sender: msg.sender_id ?? '', at: at.getTime() };
      row.className = `msg-item ${isOutbound ? 'msg-item--out' : 'msg-item--in'}${continued ? ' msg-item--cont' : ''}`;
      const avatar = isOutbound ? '' : `<img class="msg-item__avatar" src="${esc(avatarSrc)}" alt="${esc(senderName)}">`;
      const meta = `<div class="msg-item__meta"><span class="msg-item__name">${esc(senderName)}</span><span class="msg-item__time">${esc(timeFormatted)}</span></div>`;
      if (msg.kind === 'file') {
        // File attachment message
        row.innerHTML = `${avatar}<div class="msg-item__col">${meta}${fileBubble(msg)}</div>`;
        bindFileDownload(row, msg.attachment_path || '');
      } else {
        // Standard text message
        row.innerHTML = `${avatar}<div class="msg-item__col">${meta}<div class="msg-bubble"><p>${esc(msg.body || '')}</p></div></div>`;
      }
    }

    stream.append(row);
    stream.scrollTop = stream.scrollHeight;
  }

  function fileBubble(msg: MessageItem) {
    const filename = msg.attachment_name || msg.body || 'attachment';
    const sizeStr = msg.attachment_size ? ` (${formatBytes(msg.attachment_size)})` : '';
    return `
      <div class="msg-bubble msg-bubble--file">
        <span class="material-symbols-outlined" aria-hidden="true">description</span>
        <div class="msg-file__text">
          <p class="msg-file__name">${esc(filename)}</p>
          <span class="msg-file__size">${esc(sizeStr)}</span>
        </div>
        <button type="button" class="ui-btn ui-btn--icon ui-btn--sm app-file-download" title="Tải xuống tệp" aria-label="Tải xuống tệp">
          <span class="material-symbols-outlined">download</span>
        </button>
      </div>`;
  }

  function bindFileDownload(row: HTMLElement, path: string) {
    const downloadBtn = row.querySelector<HTMLButtonElement>('.app-file-download');
    if (downloadBtn && path) {
      bind(downloadBtn, async () => {
        try {
          const url = await messageAttachmentUrl(path);
          window.open(url, '_blank', 'noopener,noreferrer');
        } catch (e) { showError(e); }
      });
    }
  }

  function renderInterviewCard(row: HTMLElement, msg: MessageItem) {
    const meta = msg.metadata || {};
    const interviewId = meta.interview_id;
    const round = meta.round || 1;
    const scheduledAt = meta.scheduled_at ? formatDateTime(meta.scheduled_at) : 'Thời gian thông báo sau';
    const duration = meta.duration_minutes || 45;
    const mode = meta.mode === 'onsite' ? 'Trực tiếp tại văn phòng' : 'Trực tuyến (Google Meet / Video Room)';
    const meetingUrl = meta.meeting_url || '';
    const locationStr = meta.location || '';

    row.className = 'msg-ticket';

    row.innerHTML = `
      <div class="msg-ticket__head">
        <span class="material-symbols-outlined" aria-hidden="true">calendar_month</span>
        <span class="msg-ticket__kind">Lời mời phỏng vấn kỹ thuật (Vòng ${esc(String(round))})</span>
        <span class="app-rsvp-badge ui-chip">Đang cập nhật...</span>
      </div>
      <div class="msg-ticket__body">
        <div>
          <h3 class="msg-ticket__title">Vòng ${esc(String(round))}: Phỏng vấn trao đổi chuyên môn & định hướng</h3>
          <p class="msg-ticket__sub">Thời lượng: ${esc(String(duration))} phút • Hình thức: ${esc(mode)}</p>
        </div>
        <dl class="msg-ticket__facts">
          <div>
            <dt>Thời gian phỏng vấn</dt>
            <dd><span class="material-symbols-outlined" aria-hidden="true">schedule</span><span>${esc(scheduledAt)}</span></dd>
          </div>
          <div>
            <dt>Địa điểm / Đường dẫn</dt>
            <dd><span class="material-symbols-outlined" aria-hidden="true">${meetingUrl ? 'videocam' : 'location_on'}</span><span class="msg-ticket__where">${esc(meetingUrl || locationStr || 'Sẽ gửi thông báo trước buổi họp')}</span></dd>
            ${meetingUrl ? `<a href="${esc(meetingUrl)}" target="_blank" rel="noopener noreferrer" class="ui-link msg-ticket__link">Mở phòng họp</a>` : ''}
          </div>
        </dl>
        <div class="app-rsvp-actions msg-ticket__foot">
          <div class="app-rsvp-status-note msg-ticket__note">
            <span class="material-symbols-outlined" aria-hidden="true">info</span>
            <span>Vui lòng xác nhận lịch tham gia trước buổi họp</span>
          </div>
          <div class="app-rsvp-buttons"></div>
        </div>
      </div>`;

    const badge = row.querySelector<HTMLElement>('.app-rsvp-badge')!;
    const statusNote = row.querySelector<HTMLElement>('.app-rsvp-status-note')!;
    const btnContainer = row.querySelector<HTMLElement>('.app-rsvp-buttons')!;
    const setBadge = (tone: string, text: string) => {
      badge.className = `app-rsvp-badge ui-chip ui-chip--${tone}`;
      badge.textContent = text;
    };

    async function refreshRsvpState() {
      if (!interviewId) return;
      try {
        const interview = await getInterview(interviewId);
        if (!interview) return;

        const isStudent = currentRole() === 'student' || !recruiter;
        btnContainer.replaceChildren();

        if (interview.rsvp === 'accepted') {
          setBadge('success', 'Đã xác nhận');
          statusNote.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">check_circle</span><span>Ứng viên đã xác nhận tham gia đúng hẹn</span>';
          if (isStudent && interview.status === 'scheduled') {
            const rescheduleBtn = button('Đổi lịch khác', () => promptReschedule(interviewId));
            rescheduleBtn.className = 'ui-btn ui-btn--neutral ui-btn--sm';
            btnContainer.append(rescheduleBtn);
          }
        } else if (interview.rsvp === 'declined') {
          setBadge('danger', 'Đã từ chối');
          statusNote.innerHTML = '<span class="material-symbols-outlined" aria-hidden="true">cancel</span><span>Ứng viên đã từ chối lịch phỏng vấn này</span>';
        } else if (interview.rsvp === 'reschedule_requested') {
          setBadge('warning', 'Đề xuất đổi lịch');
          const proposed = interview.proposed_at ? ` sang ${formatDateTime(interview.proposed_at)}` : '';
          statusNote.innerHTML = `<span class="material-symbols-outlined" aria-hidden="true">update</span><span>Ứng viên đề xuất đổi lịch${esc(proposed)}</span>`;
        } else {
          // Pending
          setBadge('neutral', 'Chờ phản hồi');

          if (isStudent && interview.status === 'scheduled') {
            const declineBtn = button('Từ chối', () => promptDecline(interviewId));
            declineBtn.className = 'ui-btn ui-btn--neutral ui-btn--sm';

            const rescheduleBtn = button('Đổi lịch khác', () => promptReschedule(interviewId));
            rescheduleBtn.className = 'ui-btn ui-btn--neutral ui-btn--sm';

            const acceptBtn = button('Đồng ý tham dự', async () => {
              try {
                await respondInterview(interviewId, 'accepted');
                toast('Đã xác nhận tham dự buổi phỏng vấn!');
                if (activeConv) {
                  await sendMessage(activeConv.id, 'Dạ em xác nhận tham dự buổi phỏng vấn đúng giờ ạ. Em cảm ơn Anh/Chị!');
                }
                await refreshRsvpState();
              } catch (e) { showError(e); }
            });
            acceptBtn.className = 'ui-btn ui-btn--secondary ui-btn--sm';

            btnContainer.append(declineBtn, rescheduleBtn, acceptBtn);
          }
        }
      } catch { /* ignore */ }
    }

    void refreshRsvpState();
  }

  function promptReschedule(interviewId: string) {
    const tomorrow = localDateTimeInput(new Date(Date.now() + 86400000));
    const modal = dialog('Đề xuất thời gian phỏng vấn mới', `
      <p class="app-muted mb-3">Vui lòng chọn thời gian bạn có thể tham gia và gửi kèm lý do cho nhà tuyển dụng.</p>
      <label class="ei-field">Thời gian mong muốn *
        <input type="datetime-local" name="proposed_at" required min="${tomorrow}" value="${tomorrow}">
      </label>
      <label class="ei-field">Ghi chú gửi nhà tuyển dụng
        <textarea name="note" placeholder="Dạ em có lịch học trùng vào giờ này, em xin phép đề xuất chuyển sang..."></textarea>
      </label>
    `, 'Gửi đề xuất', async (form) => {
      const proposedAt = (form.elements.namedItem('proposed_at') as HTMLInputElement).value;
      const note = (form.elements.namedItem('note') as HTMLTextAreaElement).value.trim();
      if (!proposedAt) { toast('Vui lòng chọn thời gian mới.'); return; }
      try {
        await respondInterview(interviewId, 'reschedule_requested', note, new Date(proposedAt).toISOString());
        toast('Đã gửi đề xuất dời lịch phỏng vấn.');
        if (activeConv) {
          await sendMessage(activeConv.id, `Em xin phép đề xuất dời lịch phỏng vấn sang ${formatDateTime(proposedAt)}. Lý do: ${note || 'Trùng lịch học'}`);
        }
      } catch (e) { showError(e); }
    });
  }

  function promptDecline(interviewId: string) {
    const modal = dialog('Từ chối lịch phỏng vấn', `
      <p class="app-muted mb-3">Bạn có chắc muốn từ chối buổi phỏng vấn này?</p>
      <label class="ei-field">Lý do từ chối *
        <textarea name="reason" required placeholder="Lý do không thể tham gia..."></textarea>
      </label>
    `, 'Xác nhận từ chối', async (form) => {
      const reason = (form.elements.namedItem('reason') as HTMLTextAreaElement).value.trim();
      if (!reason) { toast('Vui lòng nhập lý do từ chối.'); return; }
      try {
        await respondInterview(interviewId, 'declined', reason);
        toast('Đã từ chối lịch phỏng vấn.');
        if (activeConv) {
          await sendMessage(activeConv.id, `Em xin phép từ chối tham dự buổi phỏng vấn. Lý do: ${reason}`);
        }
      } catch (e) { showError(e); }
    });
  }

  function renderContextSidebar() {
    if (!rightAside || !activeConv) return;

    const company = activeContext?.company || activeConv.company;
    const student = activeContext?.student;
    const partner = activeConv.other_user;
    const app = activeContext?.application;

    // Overview Card (Card 1)
    const overviewCard = rightAside.firstElementChild as HTMLElement;
    if (overviewCard) {
      if (recruiter && partner?.role === 'student') {
        // Employer view: show Candidate Overview
        const gpaStr = student?.gpa ? `GPA: ${student.gpa.toFixed(2)} / 4.0` : 'GPA chưa cập nhật';
        const uniStr = student?.university_name || 'Chưa cập nhật trường';
        const majorStr = student?.major || 'Chưa cập nhật chuyên ngành';
        overviewCard.className = 'msg-ctx';
        overviewCard.innerHTML = `
          <div class="msg-ctx__id">
            <span class="msg-ctx__mark" aria-hidden="true">${esc((partner.full_name || 'UV').slice(0, 2).toUpperCase())}</span>
            <div class="msg-ctx__who">
              <h3 class="msg-ctx__name">${esc(partner.full_name || 'Ứng viên')}</h3>
              <p class="msg-ctx__sub">${esc(uniStr)} • ${esc(majorStr)}</p>
            </div>
          </div>
          <span class="ui-chip ui-chip--neutral">Ứng viên ứng tuyển</span>
          <ul class="msg-ctx__facts">
            <li><span class="material-symbols-outlined" aria-hidden="true">school</span><span>${esc(gpaStr)}</span></li>
            <li><span class="material-symbols-outlined" aria-hidden="true">mail</span><span>${esc(partner.email || '')}</span></li>
          </ul>
          <button type="button" class="ui-btn ui-btn--neutral ui-btn--sm ui-btn--block app-view-candidate-btn">
            <span>Xem hồ sơ ứng viên chi tiết</span>
            <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
          </button>`;

        const viewCandidateBtn = overviewCard.querySelector<HTMLButtonElement>('.app-view-candidate-btn');
        if (viewCandidateBtn && app) {
          bind(viewCandidateBtn, () => location.assign(`/pages/candidates/?job=${app.job_id}`));
        }
      } else {
        // Student view: show Company Overview
        const comp = activeContext?.company;
        const companyName = comp?.name || activeConv.company?.name || 'Doanh nghiệp tuyển dụng';
        const address = comp?.address || comp?.city || 'Chưa cập nhật địa chỉ';
        const size = comp?.company_size || 'Chưa cập nhật';
        const industry = comp?.industry?.name || 'Chưa cập nhật lĩnh vực';

        overviewCard.className = 'msg-ctx';
        overviewCard.innerHTML = `
          <div class="msg-ctx__id">
            <span class="msg-ctx__mark" aria-hidden="true">${esc(companyName.slice(0, 2).toUpperCase())}</span>
            <div class="msg-ctx__who">
              <h3 class="msg-ctx__name">${esc(companyName)}</h3>
              <p class="msg-ctx__sub">${esc(industry)}</p>
            </div>
          </div>
          <span class="ui-chip ui-chip--neutral">Đối tác doanh nghiệp</span>
          <ul class="msg-ctx__facts">
            <li><span class="material-symbols-outlined" aria-hidden="true">group</span><span>Quy mô: ${esc(size)}</span></li>
            <li><span class="material-symbols-outlined" aria-hidden="true">location_on</span><span>${esc(address)}</span></li>
          </ul>
          <button type="button" class="ui-btn ui-btn--neutral ui-btn--sm ui-btn--block app-view-company-btn">
            <span>Xem trang công ty</span>
            <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
          </button>`;

        const viewCompanyBtn = overviewCard.querySelector<HTMLButtonElement>('.app-view-company-btn');
        if (viewCompanyBtn && company?.id) {
          bind(viewCompanyBtn, () => location.assign(companyHref(company.id)));
        }
      }
    }

    // Pipeline tracker (Card 2)
    const pipelineTracker = rightAside.children[1] as HTMLElement;
    if (pipelineTracker) pipelineTracker.hidden = !app;   // never leave the design's sample pipeline visible
    if (pipelineTracker && app) {
      const stepIndex = ['applied', 'cv_viewed'].includes(app.status)
        ? 2
        : (['shortlisted', 'interviewing'].includes(app.status)
          ? 3
          : (['offered', 'hired'].includes(app.status) ? 4 : 1));

      pipelineTracker.className = 'msg-ctx';
      const steps: [string, string][] = [
        ['1. Nộp hồ sơ ứng tuyển', formatDateTime(app.applied_at)],
        ['2. Duyệt CV & Đánh giá năng lực', stepIndex >= 2 ? 'Đã xem hồ sơ' : 'Chờ xét duyệt'],
        ['3. Phỏng vấn kỹ thuật & văn hoá', stepIndex >= 3 ? 'Lịch trao đổi chuyên môn' : 'Chờ sắp lịch'],
        ['4. Thư mời nhận việc (Offer)', app.status === 'hired' ? 'Đã nhận việc thành công' : 'Giai đoạn quyết định'],
      ];
      pipelineTracker.innerHTML = `
        <div class="msg-ctx__title">
          <h4>Tiến trình tuyển dụng</h4>
          <span class="msg-ctx__count">Giai đoạn ${stepIndex}/4</span>
        </div>
        <ol class="msg-steps">
          ${steps.map(([title, note], i) => {
            const n = i + 1;
            const state = n < stepIndex || (n === 4 && stepIndex === 4 && app.status === 'hired') ? 'is-done' : (n === stepIndex ? 'is-current' : '');
            return `<li class="msg-step ${state}">
              <span class="msg-step__dot" aria-hidden="true">${state === 'is-done' ? '<span class="material-symbols-outlined">check</span>' : n}</span>
              <span class="msg-step__title">${esc(title)}</span>
              <span class="msg-step__note">${esc(note)}</span>
            </li>`;
          }).join('')}
        </ol>`;
    }

    // Shared Documents (Card 3)
    const docsCard = rightAside.children[2] as HTMLElement;
    if (docsCard) {
      const files: { name: string; path: string; size?: number; sender: string; isCv?: boolean }[] = [];
      if (app?.cv_file_path) {
        files.push({ name: 'Hồ sơ CV ứng tuyển.pdf', path: app.cv_file_path, sender: 'Ứng viên', isCv: true });
      }
      activeMessages.filter(m => m.kind === 'file' && m.attachment_path).forEach(m => {
        files.push({
          name: m.attachment_name || m.body || 'Tệp đính kèm',
          path: m.attachment_path!,
          size: m.attachment_size || undefined,
          sender: m.sender_id === myUid ? 'Bạn' : (activeConv!.other_user?.full_name || 'Đối tác'),
        });
      });

      docsCard.className = 'msg-ctx';
      docsCard.innerHTML = `
        <div class="msg-ctx__title">
          <h4>Tài liệu đã chia sẻ (${files.length})</h4>
          <button type="button" class="ui-btn ui-btn--icon ui-btn--sm app-upload-doc-btn" title="Tải lên tệp mới" aria-label="Tải lên tệp mới">
            <span class="material-symbols-outlined">upload_file</span>
          </button>
        </div>
        <div class="msg-docs app-docs-list">
          ${!files.length ? '<p class="msg-ctx__empty">Chưa có tài liệu nào được chia sẻ.</p>' : ''}
        </div>`;

      const listEl = docsCard.querySelector<HTMLElement>('.app-docs-list')!;
      files.forEach(f => {
        const item = document.createElement('div');
        item.className = 'msg-doc';
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.innerHTML = `
          <span class="material-symbols-outlined" aria-hidden="true">description</span>
          <div class="msg-doc__text">
            <p class="msg-doc__name">${esc(f.name)}</p>
            <p class="msg-doc__meta">${esc(f.sender)}${f.size ? ` • ${formatBytes(f.size)}` : ''}</p>
          </div>
          <span class="material-symbols-outlined msg-doc__dl" aria-hidden="true">download</span>`;

        bind(item, async () => {
          try {
            const url = f.isCv ? await cvSignedUrl(f.path) : await messageAttachmentUrl(f.path);
            window.open(url, '_blank', 'noopener,noreferrer');
          } catch (e) { showError(e); }
        });
        listEl.append(item);
      });

      const uploadDocBtn = docsCard.querySelector<HTMLButtonElement>('.app-upload-doc-btn');
      if (uploadDocBtn) {
        bind(uploadDocBtn, () => {
          upload('Tải lên tài liệu', '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg', async file => {
            if (!activeConv) return;
            try {
              toast('Đang tải lên tài liệu...');
              await uploadMessageAttachment(activeConv.id, file);
              toast('Đã chia sẻ tài liệu thành công.');
            } catch (e) { showError(e); }
          });
        });
      }
    }

    // Security box (Card 4)
    const securityCard = rightAside.children[3] as HTMLElement;
    if (securityCard) {
      securityCard.classList.add('msg-safety');
      const reportBtn = securityCard.querySelector<HTMLButtonElement>('button');
      if (reportBtn) {
        bind(reportBtn, () => {
          const partnerId = activeConv?.other_user?.id;
          const partnerName = activeConv?.other_user?.full_name || activeConv?.company?.name || 'Doanh nghiệp';
          if (partnerId) {
            reportContent(`Báo cáo nghi vấn đối với ${partnerName}`, { type: 'user', id: partnerId });
          } else {
            toast('Không thể gửi báo cáo.');
          }
        });
      }
    }
  }

  // Send message action
  async function handleSend(text = input.value.trim()) {
    if (!text) {
      input.focus();
      toast('Nhập nội dung trước khi gửi tin nhắn.');
      return;
    }
    if (!activeConv) {
      toast('Vui lòng chọn cuộc trò chuyện.');
      return;
    }
    try {
      input.value = '';
      const inserted = await sendMessage(activeConv.id, text);
      const msgItem: MessageItem = {
        id: inserted.id,
        conversation_id: inserted.conversation_id,
        sender_id: inserted.sender_id,
        kind: inserted.kind,
        body: inserted.body,
        attachment_name: inserted.attachment_name,
        attachment_path: inserted.attachment_path,
        attachment_size: inserted.attachment_size,
        metadata: (inserted.metadata ?? {}) as Record<string, any>,
        created_at: inserted.created_at,
        sender: currentProfile(),
      };
      activeMessages.push(msgItem);
      appendMessage(msgItem);

      // Update preview in list
      activeConv.last_message_preview = text;
      activeConv.last_message_at = inserted.created_at;
      renderConversationsList();
    } catch (e) {
      showError(e);
    }
  }

  // Bind input and send button
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      void handleSend();
    }
  });

  const sendBtn = input.parentElement?.querySelector<HTMLButtonElement>('button');
  if (sendBtn) {
    bind(sendBtn, () => { void handleSend(); });
  }

  // Bind search input in Column 1
  searchInput.addEventListener('input', () => {
    renderConversationsList();
  });

  // Bind filter tabs in Column 1
  leftAside.querySelectorAll<HTMLButtonElement>('button').forEach(b => {
    const text = b.textContent?.trim() || '';
    if (/Tất cả|Chưa đọc|Phỏng vấn|Lưu trữ/.test(text)) {
      bind(b, () => {
        if (/Chưa đọc/.test(text)) currentFilterMode = 'unread';
        else if (/Phỏng vấn/.test(text)) currentFilterMode = 'interview';
        else if (/Lưu trữ/.test(text)) currentFilterMode = 'archived';
        else currentFilterMode = 'all';

        leftAside.querySelectorAll('button').forEach(x => {
          if (/Tất cả|Chưa đọc|Phỏng vấn|Lưu trữ/.test(x.textContent || '')) {
            x.classList.toggle('bg-primary', x === b);
            x.classList.toggle('text-on-primary', x === b);
            x.classList.toggle('bg-surface-container', x !== b);
            x.classList.toggle('text-on-surface-variant', x !== b);
            x.setAttribute('aria-pressed', String(x === b));
          }
        });
        renderConversationsList();
      });
    } else {
      bind(b, () => {
        dialog('Lọc cuộc trò chuyện',
          `<label>Hiển thị<select name="mode"><option value="all">Đang hoạt động</option><option value="unread">Chưa đọc</option><option value="archived">Đã lưu trữ</option></select></label>`,
          'Áp dụng', f => {
            currentFilterMode = value(f, 'mode');
            renderConversationsList();
          });
      });
    }
  });

  // Bind toolbar buttons below chat input
  document.querySelectorAll<HTMLButtonElement>('main button').forEach(b => {
    if (b.dataset.appControl) return;
    const icon = b.querySelector('.material-symbols-outlined')?.textContent?.trim();

    if (icon === 'attach_file' || icon === 'upload_file') {
      bind(b, () => {
        if (!activeConv) { toast('Vui lòng chọn cuộc trò chuyện.'); return; }
        upload('Đính kèm tệp tin', '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg', async (file) => {
          try {
            toast('Đang tải lên tệp đính kèm...');
            await uploadMessageAttachment(activeConv!.id, file);
            toast('Đã gửi tệp đính kèm.');
          } catch (e) { showError(e); }
        });
      });
    } else if (icon === 'code') {
      // Code/link insert is for recruiters; students don't get the "<>" button
      if (currentRole() === 'student') { b.hidden = true; return; }
      bind(b, () => {
        if (!activeConv) { toast('Vui lòng chọn cuộc trò chuyện.'); return; }
        dialog('Chèn liên kết', field('url', 'GitHub / Portfolio / Tài liệu', 'https://', 'url'), 'Gửi liên kết', f => {
          const url = value(f, 'url');
          if (url) void handleSend(url);
        });
      });
    } else if (icon === 'sentiment_satisfied') {
      bind(b, () => {
        const modal = dialog('Chọn emoji', '<div class="demo-emojis flex flex-wrap gap-2 text-2xl p-2"></div>', 'Đóng');
        const container = modal.querySelector<HTMLElement>('.demo-emojis')!;
        for (const emoji of ['😊', '👍', '🎉', '🙏', '💼', '✅', '❤️', '👏', '🎯', '🚀']) {
          const btn = button(emoji, () => {
            input.value += emoji;
            modal.close();
            input.focus();
          });
          btn.className = 'ui-btn ui-btn--icon';
          container.append(btn);
        }
      });
    } else if (icon === 'event') {
      bind(b, () => {
        if (recruiter) {
          if (activeContext?.application) {
            location.assign(`/pages/candidates/?job=${activeContext.application.job_id}`);
          } else {
            toast('Lên lịch phỏng vấn qua danh sách hồ sơ ứng viên.');
          }
        } else {
          // Proposes a time as a chat message (the employer schedules the actual interview)
          const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(9, 0, 0, 0);
          dialog('Đề xuất thời gian trao đổi', `<label>Thời gian<input type="datetime-local" name="when" required min="${localDateTimeInput(new Date())}" value="${localDateTimeInput(tomorrow)}"></label>
            <label>Ghi chú (tùy chọn)<input name="note" maxlength="200" placeholder="VD: em rảnh cả buổi sáng"></label>`, 'Gửi đề xuất', form => {
            const when = (form.elements.namedItem('when') as HTMLInputElement).value;
            const note = (form.elements.namedItem('note') as HTMLInputElement).value.trim();
            if (when) void handleSend(`Dạ em có thể trao đổi vào ${formatDateTime(new Date(when))}${note ? ` (${note})` : ''}.`);
          });
        }
      });
    }
  });

  // Clean up realtime subscription on page unload
  window.addEventListener('pagehide', () => {
    if (unsubscribeRealtime) {
      unsubscribeRealtime();
      unsubscribeRealtime = null;
    }
  });

  // Start data loading
  await loadData();
}
