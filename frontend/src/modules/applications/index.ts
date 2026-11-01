import type { FeatureModule } from '../../core/module';
import { setupApplicationsPage } from './applicationsPage';

/** Applications: the student's My Applications page, saved jobs and job alerts (process 4). */
export const applications: FeatureModule = {
  pages: ['applications'],
  controls: () => setupApplicationsPage(),
};
