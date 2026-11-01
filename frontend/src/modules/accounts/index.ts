import type { FeatureModule } from '../../core/module';
import { setupAuthForms, setupAuthPage } from './authForms';

/** Accounts: sign-in and sign-up (process 1 in diagrams/DFD_Level_2_Process_1_Account). */
export const accounts: FeatureModule = {
  pages: ['login', 'register'],
  forms: setupAuthForms,
  controls: setupAuthPage,
};
