import type { FeatureModule } from '../../core/module';
import { setupAuthForms, setupAuthPage, setupResetPassword } from './authForms';

/** Accounts: sign-in, sign-up, password reset (process 1 in diagrams/DFD_Level_2_Process_1_Account). */
export const accounts: FeatureModule = {
  pages: ['login', 'register', 'reset-password'],
  forms: page => (page === 'reset-password' ? setupResetPassword() : setupAuthForms(page)),
  controls: page => { if (page !== 'reset-password') setupAuthPage(); },
};
