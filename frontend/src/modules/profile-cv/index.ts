import type { FeatureModule } from '../../core/module';
import { restoreForm } from '../../core/forms';
import { setupCvPreview } from './cvPreview';
import { setupCV } from './cv';

/** Profile & CV: student profile and CV builder (process 2). */
export const profileCv: FeatureModule = {
  pages: ['profile', 'cv-builder'],
  forms: page => { if (page === 'cv-builder') { setupCvPreview(); restoreForm(page); } },
  controls: setupCV,
};
