import type { FeatureModule } from '../../core/module';
import { setupRecruitingShortcuts } from './shortcuts';
import { setupCandidates } from './pipeline';
import { setupPosting } from './posting';
import { setupDashboard } from './dashboard';
import { setupCompanySettings } from './companySettings';

/** Recruiting: employer dashboard, company settings, job posting, candidate pipeline (processes 3 and 5). */
export const recruiting: FeatureModule = {
  pages: ['employer', 'candidates', 'post-job', 'company-settings'],
  shortcuts: setupRecruitingShortcuts,
  controls: async page => {
    if (page === 'employer') await setupDashboard();
    else if (page === 'post-job') await setupPosting();
    else if (page === 'company-settings') await setupCompanySettings();
    else setupCandidates();
  },
};
