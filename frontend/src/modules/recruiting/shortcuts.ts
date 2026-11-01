import { label, routes } from '../../core/navigation';
import { dialog } from '../../core/ui/feedback';

/** Employer / candidates click shortcuts: "Xem CV" preview, "Chat 1-1", applicant links. */
export function setupRecruitingShortcuts(page: string) {
  document.addEventListener('click', event => {
    const control = (event.target as Element).closest<HTMLElement>('button,a');
    if (!control || control.closest('[data-app-control],dialog')) return;
    const text = label(control);
    let href: string | undefined;
    if (page === 'candidates' && /Xem CV/.test(text)) {
      event.preventDefault(); event.stopImmediatePropagation();
      const card = control.closest('.candidate-board>div>div');
      const name = card?.querySelector('.font-headline-md')?.textContent?.trim() || 'Ứng viên';
      const modal = dialog('Hồ sơ ứng viên', '<div class="candidate-profile-preview"></div><p class="app-muted">CV đính kèm chưa có tệp thật trong bản demo.</p>', 'Đóng');
      const preview = modal.querySelector('.candidate-profile-preview')!;
      const heading = document.createElement('h3'); heading.textContent = name;
      const info = document.createElement('p'); info.textContent = card?.querySelector('.font-headline-md')?.parentElement?.textContent?.trim() || '';
      preview.append(heading, info);
      return;
    }
    if (page === 'candidates' && /Chat 1-1/.test(text)) href = '/pages/messages/?workspace=employer&candidate=minh-thu';
    if (page === 'employer' && /ứng viên|hồ sơ/i.test(text) && !/công ty|doanh nghiệp/i.test(text)) href = routes.candidates;
    if (href) { event.preventDefault(); event.stopImmediatePropagation(); location.assign(href); }
  }, true);
}
