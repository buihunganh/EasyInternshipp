import type { FeatureModule } from '../../core/module';
import { setupPostMenus } from './postMenus';
import { setupCommunity } from './community';

/** Community: posts, comments, reviews, reporting (process 7). */
export const community: FeatureModule = {
  pages: ['community'],
  setup: setupPostMenus,
  controls: setupCommunity,
};
