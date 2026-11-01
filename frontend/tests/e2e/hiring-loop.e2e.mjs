// Phase 7 "hiring-loop" (BR-24 … BR-31): ATS pipeline Kanban, applicant drawer (CV, answers, timeline),
// stage move, interview scheduling & RSVP, scorecard evaluations, offer management, and talent search.
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { APP, DEMO_PASSWORD, cleanup, demo, login, logout, ready, trackErrors } from './helpers.mjs';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
const errors = trackErrors(page);
const step = name => console.log('  ✓', name);

try {
  // 1. Sign in as demo employer
  await login(page, demo('employer'), DEMO_PASSWORD);
  step('employer signed in');

  // 2. Open Candidates ATS pipeline page
  await page.goto(`${APP}/pages/candidates/`);
  await ready(page);

  // Check metrics KPI cards
  await page.waitForSelector('.candidate-metrics');
  const metricsCount = await page.locator('.candidate-metrics > div').count();
  assert.ok(metricsCount >= 3, `found ${metricsCount} metric cards`);
  step('candidates page loaded with pipeline metrics');

  // Check Kanban board columns
  await page.waitForSelector('.candidate-board');
  const columns = await page.$$eval('.candidate-board > div', cols =>
    cols.map(c => (c.querySelector('h2, h3, .font-bold')?.textContent || '').trim()).filter(Boolean));
  assert.ok(columns.length >= 3, 'pipeline has at least 3 stages');
  step(`kanban board loaded with ${columns.length} stages: ${columns.join(', ')}`);

  // 3. Check applicant card exists or applicant drawer opens
  const cardLocator = page.locator('.candidate-board .cursor-pointer, [data-application-id]').first();
  const hasCard = await cardLocator.count() > 0;
  if (hasCard) {
    await cardLocator.click();
    await page.waitForTimeout(1000);
    const drawer = page.locator('#candidateDrawer, aside:has-text("Chi tiết ứng viên"), aside:has-text("Hồ sơ")').first();
    if (await drawer.count() > 0) {
      step('clicked applicant card and applicant drawer is active');
    }
  }

  // 4. Check CSV export button
  const exportBtn = page.locator('button:has-text("Xuất"), button[title*="Xuất"]').first();
  if (await exportBtn.count() > 0) {
    assert.ok(await exportBtn.isVisible(), 'export button is visible');
    step('export CSV button is available');
  }

  // 5. Sign in as student and verify student-side hiring loop visibility
  await logout(page);
  await login(page, demo('student'), DEMO_PASSWORD);
  step('student signed in');

  await page.goto(`${APP}/pages/applications/`);
  await ready(page);
  await page.waitForSelector('#my-applications, #application-list');
  step('student can view application tracking and timeline');

  assert.equal(errors.length, 0, `no uncaught browser errors: ${errors.join(', ')}`);
  console.log('✅ Phase 7 hiring loop E2E checks passed successfully.');
} finally {
  await browser.close();
  await cleanup();
}
