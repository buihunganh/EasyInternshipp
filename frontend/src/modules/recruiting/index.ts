import type { FeatureModule } from '../../core/module';
import { restoreForm } from '../../core/forms';
import { setupRecruitingShortcuts } from './shortcuts';
import { setupRecruiting } from './pipeline';
import { setupPosting } from './posting';

/** Recruiting: employer dashboard, candidate pipeline (ATS), job posting (processes 3 and 5). */
export const recruiting: FeatureModule = {
  pages: ['employer', 'candidates', 'post-job'],
  shortcuts: setupRecruitingShortcuts,
  forms: page => { if (page === 'post-job') restoreForm(page); },
  controls: page => { if (page === 'post-job') setupPosting(); else setupRecruiting(page); },
};
