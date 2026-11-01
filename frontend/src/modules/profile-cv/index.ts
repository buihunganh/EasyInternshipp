import type { FeatureModule } from '../../core/module';
import { setupProfilePage } from './profilePage';
import { setupCvBuilder } from './cvBuilder';
import { setupPublicCv } from './publicCv';

/** Profile & CV: student profile, CV builder, public CV page (process 2). */
export const profileCv: FeatureModule = {
  pages: ['profile', 'cv-builder', 'cv'],
  controls: async page => {
    if (page === 'profile') await setupProfilePage();
    else if (page === 'cv-builder') await setupCvBuilder();
    else await setupPublicCv();
  },
};
