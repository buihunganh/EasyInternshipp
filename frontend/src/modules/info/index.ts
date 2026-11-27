import type { FeatureModule } from '../../core/module';

/** Static information pages: about, help, terms, privacy (content lives in the page HTML). */
export const info: FeatureModule = {
  pages: ['about', 'help', 'terms', 'privacy'],
  controls: () => {
    // Open the FAQ item a deep link points into (help → #lien-he …)
    const target = location.hash && document.getElementById(location.hash.slice(1));
    const faq = target instanceof HTMLElement ? target.closest('details') : null;
    if (faq) faq.open = true;
  },
};
