import type { FeatureModule } from '../../core/module';
import { setupNotifications } from './notifications';

export const notifications: FeatureModule = {
  pages: ['notifications'],
  setup: setupNotifications,
};
