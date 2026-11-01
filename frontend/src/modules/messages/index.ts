import type { FeatureModule } from '../../core/module';
import { setupMessages } from './messages';

/** Messages: student ↔ recruiter conversations (process 6). */
export const messages: FeatureModule = {
  pages: ['messages'],
  setup: setupMessages,
};
