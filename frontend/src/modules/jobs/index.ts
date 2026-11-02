import type { FeatureModule } from '../../core/module';
import { setupJobs } from './jobSearch';
import { setupFeaturedCompanies, setupMiniFooter, setupProfileCard, setupUpcomingEvents } from './homeSidebar';
import { setupJobDetail } from './jobDetail';
import { setupCompanyPage } from './companyPage';

/** Jobs & companies: search, job detail, company page (process 3). */
export const jobs: FeatureModule = {
  pages: ['jobs', 'job-detail', 'company'],
  setup: async page => { if (page === 'jobs') { setupMiniFooter(); await Promise.all([setupJobs(), setupProfileCard(), setupFeaturedCompanies(), setupUpcomingEvents()]); } },
  controls: async page => {
    if (page === 'job-detail') await setupJobDetail();
    if (page === 'company') await setupCompanyPage();
  },
};
