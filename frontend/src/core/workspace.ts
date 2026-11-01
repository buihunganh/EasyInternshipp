import { currentRole } from './session';

export function isRecruiterWorkspace() {
  const page = document.body.dataset.page || '';
  if (['employer', 'candidates', 'post-job', 'company-settings'].includes(page)) return true;
  if (!['messages', 'company', 'job-detail'].includes(page)) return false;
  const workspace = new URLSearchParams(location.search).get('workspace');
  if (workspace) return workspace === 'employer';
  return currentRole() === 'employer';
}

export function workspaceHref(href: string) {
  if (!isRecruiterWorkspace()) return href;
  const url = new URL(href, location.origin);
  if (['/pages/messages/', '/pages/company/', '/pages/job-detail/'].includes(url.pathname)) {
    url.searchParams.set('workspace', 'employer');
  }
  return url.pathname + url.search + url.hash;
}
