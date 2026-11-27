import { label, routes } from '../../core/navigation';

/**
 * Employer dashboard click shortcut: design links about applicants open the candidates board.
 * (Candidate cards bind their own "Xem CV" / "Chat 1-1" in pipeline.ts.)
 */
export function setupRecruitingShortcuts(page: string) {
  if (page !== 'employer') return;
  document.addEventListener('click', event => {
    const control = (event.target as Element).closest<HTMLElement>('button,a');
    if (!control || control.closest('[data-app-control],dialog')) return;
    const text = label(control);
    if (/ứng viên|hồ sơ/i.test(text) && !/công ty|doanh nghiệp/i.test(text)) {
      event.preventDefault(); event.stopImmediatePropagation();
      location.assign(routes.candidates);
    }
  }, true);
}
