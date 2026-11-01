import { isRecruiterWorkspace, workspaceHref } from '../../core/workspace';
import { currentRole, currentProfile, currentSession } from '../../core/session';
import { dialog, toast } from '../../core/ui/feedback';
import { attachMenu } from '../../core/ui/menu';
import { bind, button, field, normal, schedule, upload, value, video } from '../../core/ui/actions';
import { publicUrl } from '../../core/supabase';
import { showError } from '../../core/errors';
import { esc, el } from '../../core/render';
import { formatDateTime, relativeTime, formatBytes, localDateTimeInput } from '../../core/format';
import { reportContent } from '../../core/report';
import { routes, companyHref, jobHref } from '../../core/navigation';
import {
  listConversations, listMessages, sendMessage, uploadMessageAttachment,
  messageAttachmentUrl, cvSignedUrl, markConversationRead, setConversationPreference,
  subscribeToMessages, getConversationContext, getInterview, respondInterview,
  type ConversationItem, type MessageItem, type ConversationContextData
} from './api';

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
  const searchInput = leftAside.querySelector<HTMLInputElement>('input')!;

  const recruiter = isRecruiterWorkspace() || currentRole() === 'employer';
  const myUid = currentSession()?.user.id ?? '';

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
        selectConversation(selectedId);
      });
  });
  switcher.classList.add('demo-conversation-switch');
  section.firstElementChild?.append(switcher);

  // Initialize
  async function loadData() {
    try {
      feedContainer.innerHTML = '<div class="p-md text-center text-on-surface-variant font-body-sm">Đang tải cuộc trò chuyện...</div>';
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

      renderConversationsList();

      if (initial) {
        await selectConversation(initial.id);
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
    stream.innerHTML = `
      <div class="h-full flex flex-col items-center justify-center text-center p-xl text-on-surface-variant">
        <span class="material-symbols-outlined text-[48px] text-outline-variant mb-2">forum</span>
        <h3 class="font-headline-md text-on-surface mb-1">Hộp thư tuyển dụng</h3>
        <p class="font-body-md max-w-sm">Chọn một cuộc trò chuyện từ danh sách bên trái hoặc ứng tuyển việc làm để bắt đầu trao đổi với nhà tuyển dụng.</p>
      </div>`;
    if (rightAside) rightAside.classList.add('opacity-40');
  }

  function renderConversationsList() {
    feedContainer.replaceChildren();
    if (!conversations.length) {
      feedContainer.innerHTML = `
        <div class="p-lg text-center text-on-surface-variant space-y-2">
          <span class="material-symbols-outlined text-[36px] text-outline-variant">chat_bubble_outline</span>
          <p class="font-body-sm">Chưa có cuộc trò chuyện nào.</p>
        </div>`;
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
      card.className = `p-sm rounded-xl cursor-pointer transition-all group relative ${isSelected ? 'bg-surface-container shadow-sm' : 'hover:bg-surface-container-low'}`;
      card.dataset.conversationId = conv.id;
      card.tabIndex = 0;
      card.setAttribute('role', 'button');

      const avatarSrc = conv.other_user?.avatar_path
        ? publicUrl('avatars', conv.other_user.avatar_path)
        : (conv.company?.logo_path ? publicUrl('company-assets', conv.company.logo_path) : '/assets/images/41410c47c78c26aa.png');

      const timeStr = conv.last_message_at ? relativeTime(conv.last_message_at) : '';

      card.innerHTML = `
        ${isSelected ? '<div class="absolute left-1 top-3 bottom-3 w-1 bg-primary rounded-full"></div>' : ''}
        <div class="flex items-start gap-sm pl-2">
          <div class="relative shrink-0">
            <img class="w-11 h-11 rounded-full object-cover shadow-sm" src="${esc(avatarSrc)}" alt="${esc(partnerName)}">
            <span class="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-tertiary shadow-sm"></span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1 min-w-0">
                <h3 class="font-headline-md text-[14px] text-on-surface truncate">${esc(partnerName)}</h3>
                <span class="material-symbols-outlined text-[15px] text-primary" style="font-variation-settings: 'FILL' 1;" title="Đã xác thực">verified</span>
              </div>
              <span class="font-label-sm text-[11px] ${isUnread ? 'text-primary font-bold' : 'text-on-surface-variant'}">${esc(timeStr)}</span>
            </div>
            <p class="font-label-sm text-label-sm text-on-surface-variant truncate">${esc(companyOrRole)}</p>
            <div class="mt-1 flex items-center gap-xs">
              ${isUnread ? `<span class="inline-flex items-center justify-center px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-error text-on-error shrink-0">${conv.unread_count}</span>` : ''}
              <p class="font-body-sm text-[12px] ${isUnread ? 'text-on-surface font-semibold' : 'text-on-surface-variant'} truncate">${esc(snippet)}</p>
            </div>
          </div>
        </div>`;

      bind(card, () => selectConversation(conv.id));
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter') selectConversation(conv.id);
      });

      feedContainer.append(card);
    });
  }

  async function selectConversation(id: string) {
    const target = conversations.find(c => c.id === id);
    if (!target) return;
    activeConv = target;

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
    const headerAvatar = section.querySelector<HTMLImageElement>('.backdrop-blur-md img');
    if (headerAvatar) {
      headerAvatar.src = target.other_user?.avatar_path
        ? publicUrl('avatars', target.other_user.avatar_path)
        : (target.company?.logo_path ? publicUrl('company-assets', target.company.logo_path) : '/assets/images/2ec498645c3d7186.png');
    }

    // Load messages and context
    try {
      stream.innerHTML = '<div class="p-md text-center text-on-surface-variant font-body-sm">Đang tải tin nhắn...</div>';
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
        subtitleEl.innerHTML = `<span>${esc(activeContext.student.major || 'Sinh viên')}</span> • <span class="font-medium text-primary">${esc(activeContext.student.university_name || 'Ứng viên tiềm năng')}</span>`;
      } else {
        subtitleEl.innerHTML = `<span>Tuyển dụng</span> • <span class="font-medium text-primary">${esc(company?.name || 'Doanh nghiệp')}</span>`;
      }
    }

    // Sub-bar (job vacancy info)
    const subbar = section.children[1];
    if (subbar) {
      const app = activeContext?.application;
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
          statusBadge.innerHTML = `<span class="w-2 h-2 rounded-full bg-tertiary"></span><span>${statusMap[app.status] || app.status}</span>`;
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
        companyBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] text-primary">badge</span><span>Xem đơn ứng tuyển</span>';
        bind(companyBtn, () => location.assign(`/pages/candidates/?job=${activeContext!.application!.job_id}`));
      } else if (company?.id) {
        companyBtn.innerHTML = '<span class="material-symbols-outlined text-[18px] text-primary">apartment</span><span>Hồ sơ công ty</span>';
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
        } else {
          video();
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

    if (!activeMessages.length) {
      const welcome = document.createElement('div');
      welcome.className = 'py-xl text-center text-on-surface-variant font-body-sm';
      welcome.innerHTML = `
        <span class="material-symbols-outlined text-[36px] text-tertiary mb-1">lock</span>
        <p>Cuộc trò chuyện được mã hoá bảo mật giữa bạn và ${esc(activeConv?.other_user?.full_name || activeConv?.company?.name || 'nhà tuyển dụng')}.</p>
      `;
      stream.append(welcome);
      return;
    }

    // Render date separator
    const dateDiv = document.createElement('div');
    dateDiv.className = 'flex items-center justify-center my-2';
    dateDiv.innerHTML = `<span class="px-sm py-1 rounded-full bg-surface-container font-label-sm text-[11px] text-on-surface-variant shadow-sm">${formatDateTime(activeMessages[0].created_at)}</span>`;
    stream.append(dateDiv);

    activeMessages.forEach(msg => appendMessage(msg));
    stream.scrollTop = stream.scrollHeight;
  }

  function appendMessage(msg: MessageItem) {
    const isOutbound = msg.sender_id === myUid;
    const timeFormatted = new Date(msg.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    const senderName = isOutbound
      ? 'Bạn'
      : (msg.sender?.full_name || activeConv?.other_user?.full_name || 'Nhà tuyển dụng');

    const avatarSrc = isOutbound
      ? (publicUrl('avatars', currentProfile()?.avatar_path) || '/assets/images/33290a779af11a09.png')
      : (msg.sender?.avatar_path ? publicUrl('avatars', msg.sender.avatar_path) : (activeConv?.other_user?.avatar_path ? publicUrl('avatars', activeConv.other_user.avatar_path) : '/assets/images/41410c47c78c26aa.png'));

    const row = document.createElement('div');

    if (msg.kind === 'interview_invite') {
      // Interactive interview invite card
      renderInterviewCard(row, msg);
    } else if (msg.kind === 'file') {
      // File attachment message
      renderFileMessage(row, msg, isOutbound, avatarSrc, senderName, timeFormatted);
    } else {
      // Standard text message
      if (isOutbound) {
        row.className = 'flex items-start justify-end gap-sm max-w-[85%] ml-auto';
        row.innerHTML = `
          <div class="space-y-1 flex flex-col items-end">
            <div class="flex items-center gap-xs">
              <span class="font-body-sm text-[11px] text-on-surface-variant">${esc(timeFormatted)}</span>
              <span class="font-label-md text-[13px] text-on-surface font-semibold">${esc(senderName)}</span>
            </div>
            <div class="p-md rounded-2xl rounded-tr-xs bg-primary text-on-primary font-body-md text-body-md shadow-sm">
              <p class="whitespace-pre-wrap leading-relaxed">${esc(msg.body || '')}</p>
            </div>
          </div>`;
      } else {
        row.className = 'flex items-start gap-sm max-w-[85%]';
        row.innerHTML = `
          <img class="w-8 h-8 rounded-full object-cover mt-1 shrink-0 shadow-sm" src="${esc(avatarSrc)}" alt="${esc(senderName)}">
          <div class="space-y-1">
            <div class="flex items-center gap-xs">
              <span class="font-label-md text-[13px] text-on-surface font-semibold">${esc(senderName)}</span>
              <span class="font-body-sm text-[11px] text-on-surface-variant">${esc(timeFormatted)}</span>
            </div>
            <div class="p-md rounded-2xl rounded-tl-xs bg-surface-container-lowest text-on-surface font-body-md text-body-md shadow-sm">
              <p class="whitespace-pre-wrap leading-relaxed">${esc(msg.body || '')}</p>
            </div>
          </div>`;
      }
    }

    stream.append(row);
    stream.scrollTop = stream.scrollHeight;
  }

  function renderFileMessage(row: HTMLElement, msg: MessageItem, isOutbound: boolean, avatarSrc: string, senderName: string, timeFormatted: string) {
    const filename = msg.attachment_name || msg.body || 'attachment';
    const sizeStr = msg.attachment_size ? ` (${formatBytes(msg.attachment_size)})` : '';
    const path = msg.attachment_path || '';

    const contentBox = `
      <div class="p-md rounded-2xl ${isOutbound ? 'rounded-tr-xs bg-primary text-on-primary' : 'rounded-tl-xs bg-surface-container-lowest text-on-surface'} shadow-sm">
        <div class="flex items-center gap-sm">
          <span class="material-symbols-outlined text-[24px]">description</span>
          <div class="min-w-0">
            <p class="font-label-md text-[13px] font-semibold truncate">${esc(filename)}</p>
            <span class="text-[11px] opacity-80">${esc(sizeStr)}</span>
          </div>
          <button type="button" class="ml-2 p-1.5 rounded-lg bg-black/10 hover:bg-black/20 text-inherit transition-colors app-file-download" title="Tải xuống tệp">
            <span class="material-symbols-outlined text-[18px]">download</span>
          </button>
        </div>
      </div>`;

    if (isOutbound) {
      row.className = 'flex items-start justify-end gap-sm max-w-[85%] ml-auto';
      row.innerHTML = `
        <div class="space-y-1 flex flex-col items-end">
          <div class="flex items-center gap-xs">
            <span class="font-body-sm text-[11px] text-on-surface-variant">${esc(timeFormatted)}</span>
            <span class="font-label-md text-[13px] text-on-surface font-semibold">${esc(senderName)}</span>
          </div>
          ${contentBox}
        </div>`;
    } else {
      row.className = 'flex items-start gap-sm max-w-[85%]';
      row.innerHTML = `
        <img class="w-8 h-8 rounded-full object-cover mt-1 shrink-0 shadow-sm" src="${esc(avatarSrc)}" alt="${esc(senderName)}">
        <div class="space-y-1">
          <div class="flex items-center gap-xs">
            <span class="font-label-md text-[13px] text-on-surface font-semibold">${esc(senderName)}</span>
            <span class="font-body-sm text-[11px] text-on-surface-variant">${esc(timeFormatted)}</span>
          </div>
          ${contentBox}
        </div>`;
    }

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

    row.className = 'ml-6 sm:ml-10 max-w-[92%] sm:max-w-[88%] bg-surface-container-lowest rounded-2xl shadow-xl overflow-hidden my-3';

    row.innerHTML = `
      <div class="bg-primary px-md py-sm flex items-center justify-between text-on-primary">
        <div class="flex items-center gap-xs">
          <span class="material-symbols-outlined text-[20px]">calendar_month</span>
          <span class="font-label-md text-label-md font-bold tracking-wide uppercase text-[12px]">Lời mời phỏng vấn kỹ thuật (Vòng ${round})</span>
        </div>
        <span class="app-rsvp-badge px-2 py-0.5 rounded-full bg-surface-container-lowest/20 text-on-primary font-label-sm text-[11px] font-semibold">Đang cập nhật...</span>
      </div>
      <div class="p-lg space-y-md">
        <div>
          <h3 class="font-headline-md text-headline-md text-on-surface">Vòng ${round}: Phỏng vấn trao đổi chuyên môn & định hướng</h3>
          <p class="font-body-sm text-body-sm text-on-surface-variant">Thời lượng: ${duration} phút • Hình thức: ${esc(mode)}</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-sm bg-surface-container-low p-md rounded-xl">
          <div class="space-y-1">
            <span class="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider block">Thời gian phỏng vấn</span>
            <div class="flex items-center gap-xs font-label-md text-label-md text-on-surface">
              <span class="material-symbols-outlined text-primary text-[18px]">schedule</span>
              <span>${esc(scheduledAt)}</span>
            </div>
          </div>
          <div class="space-y-1">
            <span class="font-label-sm text-[11px] text-on-surface-variant uppercase tracking-wider block">Địa điểm / Đường dẫn</span>
            <div class="flex items-center gap-xs font-label-md text-label-md text-on-surface">
              <span class="material-symbols-outlined text-tertiary text-[18px]">${meetingUrl ? 'videocam' : 'location_on'}</span>
              <span class="truncate">${esc(meetingUrl || locationStr || 'Sẽ gửi thông báo trước buổi họp')}</span>
            </div>
            ${meetingUrl ? `<a href="${esc(meetingUrl)}" target="_blank" rel="noopener noreferrer" class="font-body-sm text-[12px] text-primary hover:underline">Mở phòng họp</a>` : ''}
          </div>
        </div>
        <div class="app-rsvp-actions flex flex-wrap items-center justify-between pt-xs gap-sm">
          <div class="app-rsvp-status-note flex items-center gap-xs text-tertiary font-label-sm text-label-sm">
            <span class="material-symbols-outlined text-[18px]">info</span>
            <span>Vui lòng xác nhận lịch tham gia trước buổi họp</span>
          </div>
          <div class="app-rsvp-buttons flex items-center gap-xs"></div>
        </div>
      </div>`;

    const badge = row.querySelector<HTMLElement>('.app-rsvp-badge')!;
    const statusNote = row.querySelector<HTMLElement>('.app-rsvp-status-note')!;
    const btnContainer = row.querySelector<HTMLElement>('.app-rsvp-buttons')!;

    async function refreshRsvpState() {
      if (!interviewId) return;
      try {
        const interview = await getInterview(interviewId);
        if (!interview) return;

        const isStudent = currentRole() === 'student' || !recruiter;
        btnContainer.replaceChildren();

        if (interview.rsvp === 'accepted') {
          badge.className = 'app-rsvp-badge px-2 py-0.5 rounded-full bg-tertiary text-on-tertiary font-label-sm text-[11px] font-semibold';
          badge.textContent = 'Đã xác nhận';
          statusNote.innerHTML = '<span class="material-symbols-outlined text-[18px] text-tertiary" style="font-variation-settings: \'FILL\' 1;">check_circle</span><span class="text-tertiary">Ứng viên đã xác nhận tham gia đúng hẹn</span>';
          if (isStudent && interview.status === 'scheduled') {
            const rescheduleBtn = button('Đổi lịch khác', () => promptReschedule(interviewId));
            rescheduleBtn.className = 'px-sm py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors';
            btnContainer.append(rescheduleBtn);
          }
        } else if (interview.rsvp === 'declined') {
          badge.className = 'app-rsvp-badge px-2 py-0.5 rounded-full bg-error text-on-error font-label-sm text-[11px] font-semibold';
          badge.textContent = 'Đã từ chối';
          statusNote.innerHTML = '<span class="material-symbols-outlined text-[18px] text-error">cancel</span><span class="text-error">Ứng viên đã từ chối lịch phỏng vấn này</span>';
        } else if (interview.rsvp === 'reschedule_requested') {
          badge.className = 'app-rsvp-badge px-2 py-0.5 rounded-full bg-secondary text-on-secondary font-label-sm text-[11px] font-semibold';
          badge.textContent = 'Đề xuất đổi lịch';
          const proposed = interview.proposed_at ? ` sang ${formatDateTime(interview.proposed_at)}` : '';
          statusNote.innerHTML = `<span class="material-symbols-outlined text-[18px] text-secondary">update</span><span>Ứng viên đề xuất đổi lịch${esc(proposed)}</span>`;
        } else {
          // Pending
          badge.className = 'app-rsvp-badge px-2 py-0.5 rounded-full bg-surface-container-highest text-on-surface-variant font-label-sm text-[11px] font-semibold';
          badge.textContent = 'Chờ phản hồi';

          if (isStudent && interview.status === 'scheduled') {
            const declineBtn = button('Từ chối', () => promptDecline(interviewId));
            declineBtn.className = 'px-sm py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors';

            const rescheduleBtn = button('Đổi lịch khác', () => promptReschedule(interviewId));
            rescheduleBtn.className = 'px-sm py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-label-sm transition-colors';

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
            acceptBtn.className = 'px-md py-1.5 rounded-lg bg-tertiary hover:bg-tertiary-dim text-on-tertiary font-label-md text-label-md flex items-center gap-xs shadow-sm transition-all';

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
    rightAside.classList.remove('opacity-40');

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
        const majorStr = student?.major || 'Chuyên ngành CNTT';
        overviewCard.innerHTML = `
          <div class="flex items-start justify-between">
            <div class="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary font-headline-lg text-[20px] shadow-sm">
              ${esc((partner.full_name || 'UV').slice(0, 2).toUpperCase())}
            </div>
            <span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-[11px] font-bold">
              Ứng viên ứng tuyển
            </span>
          </div>
          <div>
            <div class="flex items-center gap-xs">
              <h3 class="font-headline-md text-headline-md text-on-surface">${esc(partner.full_name || 'Ứng viên')}</h3>
              <span class="material-symbols-outlined text-primary text-[18px]" style="font-variation-settings: 'FILL' 1;">verified</span>
            </div>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${esc(uniStr)} • ${esc(majorStr)}</p>
          </div>
          <div class="space-y-xs pt-xs font-body-sm text-[13px] text-on-surface">
            <div class="flex items-center gap-xs text-on-surface-variant">
              <span class="material-symbols-outlined text-[16px]">school</span>
              <span>${esc(gpaStr)}</span>
            </div>
            <div class="flex items-center gap-xs text-on-surface-variant">
              <span class="material-symbols-outlined text-[16px]">mail</span>
              <span class="truncate">${esc(partner.email || '')}</span>
            </div>
          </div>
          <button type="button" class="w-full py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-primary font-label-md text-label-md transition-colors shadow-sm flex items-center justify-center gap-xs app-view-candidate-btn">
            <span>Xem hồ sơ ứng viên chi tiết</span>
            <span class="material-symbols-outlined text-[16px]">open_in_new</span>
          </button>`;

        const viewCandidateBtn = overviewCard.querySelector<HTMLButtonElement>('.app-view-candidate-btn');
        if (viewCandidateBtn && app) {
          bind(viewCandidateBtn, () => location.assign(`/pages/candidates/?job=${app.job_id}`));
        }
      } else {
        // Student view: show Company Overview
        const comp = activeContext?.company;
        const companyName = comp?.name || activeConv.company?.name || 'Doanh nghiệp tuyển dụng';
        const address = comp?.address || 'TP. Hồ Chí Minh';
        const size = comp?.company_size || '50 - 150 nhân sự';
        const industry = 'Công nghệ thông tin / Phần mềm';

        overviewCard.innerHTML = `
          <div class="flex items-start justify-between">
            <div class="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-on-primary font-headline-lg text-[22px] shadow-sm">
              ${esc(companyName.slice(0, 2).toUpperCase())}
            </div>
            <span class="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-[11px] font-bold">
              Đối tác doanh nghiệp
            </span>
          </div>
          <div>
            <div class="flex items-center gap-xs">
              <h3 class="font-headline-md text-headline-md text-on-surface">${esc(companyName)}</h3>
              <span class="material-symbols-outlined text-primary text-[18px]" style="font-variation-settings: 'FILL' 1;">verified</span>
            </div>
            <p class="font-body-sm text-body-sm text-on-surface-variant mt-0.5">${esc(industry)}</p>
          </div>
          <div class="space-y-xs pt-xs font-body-sm text-[13px] text-on-surface">
            <div class="flex items-center gap-xs text-on-surface-variant">
              <span class="material-symbols-outlined text-[16px]">group</span>
              <span>Quy mô: ${esc(size)}</span>
            </div>
            <div class="flex items-center gap-xs text-on-surface-variant">
              <span class="material-symbols-outlined text-[16px]">location_on</span>
              <span class="truncate">${esc(address)}</span>
            </div>
          </div>
          <button type="button" class="w-full py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container text-primary font-label-md text-label-md transition-colors shadow-sm flex items-center justify-center gap-xs app-view-company-btn">
            <span>Xem trang công ty</span>
            <span class="material-symbols-outlined text-[16px]">open_in_new</span>
          </button>`;

        const viewCompanyBtn = overviewCard.querySelector<HTMLButtonElement>('.app-view-company-btn');
        if (viewCompanyBtn && company?.id) {
          bind(viewCompanyBtn, () => location.assign(companyHref(company.id)));
        }
      }
    }

    // Pipeline tracker (Card 2)
    const pipelineTracker = rightAside.children[1] as HTMLElement;
    if (pipelineTracker && app) {
      const stepIndex = ['applied', 'cv_viewed'].includes(app.status)
        ? 2
        : (['shortlisted', 'interviewing'].includes(app.status)
          ? 3
          : (['offered', 'hired'].includes(app.status) ? 4 : 1));

      pipelineTracker.innerHTML = `
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-headline-md text-[15px] text-on-surface">Tiến trình tuyển dụng</h4>
          <span class="font-label-sm text-[11px] text-tertiary font-bold">Giai đoạn ${stepIndex}/4</span>
        </div>
        <div class="space-y-xs relative pl-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-surface-container-highest">
          <div class="relative flex flex-col py-1">
            <span class="absolute -left-6 top-1.5 w-5 h-5 rounded-full ${stepIndex >= 1 ? 'bg-tertiary text-on-tertiary' : 'bg-surface-container-high text-on-surface-variant'} flex items-center justify-center text-[12px] font-bold shadow-sm">
              ${stepIndex > 1 ? '✓' : '1'}
            </span>
            <span class="font-label-md text-[13px] text-on-surface">1. Nộp hồ sơ ứng tuyển</span>
            <span class="font-body-sm text-[11px] text-on-surface-variant">${formatDateTime(app.applied_at)}</span>
          </div>
          <div class="relative flex flex-col py-1">
            <span class="absolute -left-6 top-1.5 w-5 h-5 rounded-full ${stepIndex >= 2 ? 'bg-tertiary text-on-tertiary' : 'bg-surface-container-high text-on-surface-variant'} flex items-center justify-center text-[12px] font-bold shadow-sm">
              ${stepIndex > 2 ? '✓' : '2'}
            </span>
            <span class="font-label-md text-[13px] text-on-surface">2. Duyệt CV & Đánh giá năng lực</span>
            <span class="font-body-sm text-[11px] text-on-surface-variant">${stepIndex >= 2 ? 'Đã xem hồ sơ' : 'Chờ xét duyệt'}</span>
          </div>
          <div class="relative flex flex-col py-1 ${stepIndex === 3 ? 'p-sm rounded-xl bg-primary/5' : ''}">
            <span class="absolute -left-6 top-1.5 w-5 h-5 rounded-full ${stepIndex >= 3 ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'} flex items-center justify-center text-[11px] font-bold shadow-sm">
              ${stepIndex > 3 ? '✓' : '3'}
            </span>
            <span class="font-label-md text-[13px] ${stepIndex === 3 ? 'text-primary font-bold' : 'text-on-surface'}">3. Phỏng vấn kỹ thuật & văn hoá</span>
            <span class="font-body-sm text-[11px] text-on-surface-variant">${stepIndex >= 3 ? 'Lịch trao đổi chuyên môn' : 'Chờ sắp lịch'}</span>
          </div>
          <div class="relative flex flex-col py-1 ${stepIndex === 4 ? 'p-sm rounded-xl bg-primary/5' : ''}">
            <span class="absolute -left-6 top-1.5 w-5 h-5 rounded-full ${stepIndex === 4 ? 'bg-tertiary text-on-tertiary' : 'bg-surface-container-high text-on-surface-variant'} flex items-center justify-center text-[11px] font-bold shadow-sm">
              4
            </span>
            <span class="font-label-md text-[13px] ${stepIndex === 4 ? 'text-tertiary font-bold' : 'text-on-surface'}">4. Thư mời nhận việc (Offer)</span>
            <span class="font-body-sm text-[11px] text-on-surface-variant">${app.status === 'hired' ? 'Đã nhận việc thành công' : 'Giai đoạn quyết định'}</span>
          </div>
        </div>`;
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

      docsCard.innerHTML = `
        <div class="flex items-center justify-between">
          <h4 class="font-headline-md text-[15px] text-on-surface">Tài liệu đã chia sẻ (${files.length})</h4>
          <button type="button" class="p-xs text-primary hover:bg-surface-container rounded transition-colors app-upload-doc-btn" title="Tải lên tệp mới">
            <span class="material-symbols-outlined text-[18px]">upload_file</span>
          </button>
        </div>
        <div class="space-y-xs app-docs-list">
          ${!files.length ? '<p class="font-body-sm text-[12px] text-on-surface-variant py-2">Chưa có tài liệu nào được chia sẻ.</p>' : ''}
        </div>`;

      const listEl = docsCard.querySelector<HTMLElement>('.app-docs-list')!;
      files.forEach(f => {
        const item = document.createElement('div');
        item.className = 'p-sm rounded-xl bg-surface-container-low hover:bg-surface-container flex items-center justify-between transition-colors cursor-pointer group';
        item.innerHTML = `
          <div class="flex items-center gap-xs min-w-0">
            <span class="material-symbols-outlined text-primary text-[20px]">description</span>
            <div class="min-w-0">
              <p class="font-label-md text-[12px] text-on-surface truncate group-hover:text-primary transition-colors">${esc(f.name)}</p>
              <p class="font-body-sm text-[10px] text-on-surface-variant">${esc(f.sender)}${f.size ? ` • ${formatBytes(f.size)}` : ''}</p>
            </div>
          </div>
          <span class="material-symbols-outlined text-[16px] text-on-surface-variant group-hover:text-primary">download</span>`;

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
          btn.className = 'p-2 hover:bg-surface-container rounded-lg transition-colors';
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
          schedule('Đề xuất thời gian trao đổi', timeStr => {
            if (timeStr) void handleSend(`Dạ em có thể trao đổi trong khoảng thời gian: ${timeStr}`);
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
