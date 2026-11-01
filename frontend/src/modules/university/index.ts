import type { FeatureModule } from '../../core/module';
import { setupUniversityPage } from './university';

/** University: partner university page, events, partnership inquiries. */
export const university: FeatureModule = {
  pages: ['university'],
  controls: setupUniversityPage,
};
