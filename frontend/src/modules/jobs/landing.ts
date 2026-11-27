// Guest landing on the home page: shown to signed-out visitors who are not searching yet. The markup lives in
// index.html (#guest-landing); this fills the live numbers and the field pills, and toggles the page layout.
import { isSignedIn } from '../../core/auth';
import { el } from '../../core/render';
import { industriesWithJobs, landingStats } from './api';

export async function setupGuestLanding() {
  const landing = document.getElementById('guest-landing');
  if (!landing) return;
  const params = new URLSearchParams(location.search);
  const searching = ['q', 'city', 'industry'].some(k => params.get(k));
  if (isSignedIn() || searching) { landing.remove(); return; }
  landing.hidden = false;
  document.body.classList.add('has-landing');

  const fill = async () => {
    const [stats, industries] = await Promise.all([landingStats().catch(() => null), industriesWithJobs().catch(() => [])]);
    if (stats) for (const [key, value] of Object.entries(stats)) {
      const slot = landing.querySelector(`[data-stat="${key}"]`);
      if (slot) slot.textContent = value.toLocaleString('vi-VN');
    } else landing.querySelector('#landing-stats')?.remove();
    const host = landing.querySelector('#landing-industries');
    if (host) {
      const top = industries.slice(0, 10);
      host.replaceChildren(...top.map(i => el('a', { className: 'landing-pill landing-pill--filled', href: `/?industry=${i.id}` },
        i.name, i.open ? el('span', { className: 'landing-pill__count' }, String(i.open)) : null)),
        el('a', { className: 'landing-pill landing-pill--more', href: '#jobs-list-start' }, 'Xem tất cả'));
    }
  };
  await fill();
}
