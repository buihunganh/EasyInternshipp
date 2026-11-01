// Entry point for every user-facing page (admin pages have their own entries in modules/admin).
// Core renders the shared shell; feature modules plug in through the phases in core/module.ts.
import { setupAccess } from './core/auth';
import { setupNavigation } from './core/navigation';
import { setupGenericForms } from './core/forms';
import { runPhase, type FeatureModule } from './core/module';
import { renderSiteHeader } from './core/layout/siteHeader';
import { renderSiteFooter } from './core/layout/siteFooter';
import { renderRecruiterSidebar } from './core/layout/recruiterSidebar';
import { setupWorkflow } from './core/layout/workflow';
import { setupAccount } from './core/layout/accountMenu';
import { markDecorativeIcons, prepareOptionButtons, setupCommonControls } from './core/demo/demoShell';
import { initSession } from './core/session';
import { startActions } from './core/ui/actions';
import { accounts } from './modules/accounts';
import { jobs } from './modules/jobs';
import { profileCv } from './modules/profile-cv';
import { applications } from './modules/applications';
import { recruiting } from './modules/recruiting';
import { messages } from './modules/messages';
import { community } from './modules/community';
import { university } from './modules/university';
import { notifications } from './modules/notifications';
import './styles/demo.css';
import './styles/platform.css';

// One module per line, so adding a module never conflicts with another branch adding one.
const modules: FeatureModule[] = [
  accounts,
  jobs,
  profileCv,
  applications,
  recruiting,
  messages,
  community,
  university,
  notifications,
];

async function main() {
  const page = document.body.dataset.page || 'jobs';
  await initSession();   // the Supabase session is restored asynchronously
  if (!setupAccess(page)) return;
  // Only buttons from the page's design HTML get core's generic fallback; buttons modules create never do
  document.querySelectorAll<HTMLElement>('button').forEach(b => { b.dataset.designButton = ''; });
  renderSiteFooter(); renderRecruiterSidebar(page); renderSiteHeader(page);
  setupNavigation(); setupWorkflow(page);
  await runPhase(modules, 'shortcuts', page);
  await runPhase(modules, 'forms', page);
  setupGenericForms(page);
  setupAccount(page);
  await runPhase(modules, 'setup', page);
  prepareOptionButtons(page);
  markDecorativeIcons();
  await runPhase(modules, 'controls', page);
  setupCommonControls(page);
  startActions();
  document.body.dataset.ready = 'true';   // tests wait for this
}

main().catch(error => console.error(error));
