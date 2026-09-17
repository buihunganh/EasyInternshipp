import { setupAccess } from './lib/auth';
import { renderSiteHeader } from './components/siteHeader';
import { setupWorkflow } from './features/workflow';
import { renderRecruiterSidebar } from './components/recruiterSidebar';
import { setupNavigation } from './lib/navigation';
import { setupForms } from './features/forms';
import { setupJobs } from './features/jobs';
import { setupMessages } from './features/messages';
import { setupAccount } from './features/account';
import { setupOptions } from './features/options';
import { renderSiteFooter } from './components/siteFooter';
import { setupDemo } from './features/demo';
import { startActions } from './features/demo/ui';
import './styles/demo.css';

const page=document.body.dataset.page || 'jobs';
if (setupAccess(page)) {
  renderSiteFooter();renderRecruiterSidebar(page);renderSiteHeader(page);
  setupNavigation();setupWorkflow(page);setupForms(page);setupAccount(page);
  if(page==='jobs')setupJobs();
  if(page==='messages')setupMessages();
  setupOptions(page);
  setupDemo(page);
  startActions();
}
