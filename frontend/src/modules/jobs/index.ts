import type { FeatureModule } from '../../core/module';
import { setupJobs } from './jobSearch';
import { setupJobDetail } from './jobDetail';
import { setupCompanyPage } from './companyPage';

/** Jobs & companies: search, job detail, company page (process 3). */
export const jobs: FeatureModule = {
  pages: ['jobs', 'job-detail', 'company'],
  setup: page => { if (page === 'jobs') setupJobs(); },
  controls: page => { if (page === 'job-detail') setupJobDetail(); if (page === 'company') setupCompanyPage(); },
};
