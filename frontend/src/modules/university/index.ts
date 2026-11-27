import type { FeatureModule } from '../../core/module';
import { setupUniversityPage } from './university';
import { setupUniversityPortal } from './portal';
import { setupVerifyPage } from './verify';

/** University: public page (events, partners, inquiries), officer portal, certificate verification. */
export const university: FeatureModule = {
  pages: ['university', 'university-portal', 'verify'],
  controls: page => {
    if (page === 'university') return setupUniversityPage();
    if (page === 'university-portal') return setupUniversityPortal();
    if (page === 'verify') return setupVerifyPage();
  },
};
