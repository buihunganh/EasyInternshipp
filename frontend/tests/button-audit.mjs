// Clicks every visible non-header/footer button on every page and fails on runtime errors or
// unclickable controls. Signed-in pages use throwaway accounts (a student, and an employer with its
// own verified company), so clicks never change the seeded demo data. AUDIT_PAGE=<slug> audits one page.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { STORAGE_KEY, cleanup, ready, roleFor, throwawayEmployer, throwawayStudent } from './session.mjs';
import { service } from './e2e/helpers.mjs';

const base = process.env.APP_URL || 'http://127.0.0.1:5173';
const browser = await chromium.launch();
const sessions = { student: await throwawayStudent(), employer: await throwawayEmployer() };
// Detail pages need a real id (a seeded active job and its company)
const { data: sampleJob } = await service.from('jobs').select('id, company_id').eq('status', 'active').limit(1).single();
const query = { 'job-detail': `?id=${sampleJob.id}`, company: `?id=${sampleJob.company_id}` };
const pages = {};
async function pageFor(role) {
  if (pages[role ?? 'guest']) return pages[role ?? 'guest'];
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  await context.addInitScript(([key, value]) => {
    if (!sessionStorage.getItem('audit-init')) {   // only once per tab, so in-page sign-outs stick
      sessionStorage.setItem('audit-init', '1');
      Object.keys(localStorage).forEach(k => localStorage.removeItem(k));
      if (value) localStorage.setItem(key, value);
    }
    window.print = () => { document.body.dataset.printRequested = 'true'; };
  }, [STORAGE_KEY, role ? sessions[role] : null]);
  const page = await context.newPage(); page.setDefaultTimeout(4000);
  await page.route('https://fonts.googleapis.com/**', r => r.abort()); await page.route('https://fonts.gstatic.com/**', r => r.abort());
  page.on('pageerror', e => errors.push({ url: page.url(), error: e.message })); page.on('download', () => downloads++);
  return (pages[role ?? 'guest'] = page);
}
const failures = [], noChange = [], errors = []; let tested = 0, downloads = 0;
const snapshot = page => page.evaluate(() => {
  const text = document.body.outerHTML + JSON.stringify({ ...localStorage }) + JSON.stringify([...document.querySelectorAll('input,textarea,select')].map(e => [e.value, e.checked]));
  let hash = 0; for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return [location.href, hash, Math.round(scrollY), document.queryCommandState('bold'), document.queryCommandState('italic'), document.queryCommandState('underline')].join('|');
});
try {
  for (const slug of ['jobs', ...fs.readdirSync(new URL('../pages', import.meta.url)).filter(s => !s.startsWith('admin'))].filter(s => !process.env.AUDIT_PAGE || s === process.env.AUDIT_PAGE)) {
    const path = slug === 'jobs' ? '/' : `/pages/${slug}/${query[slug] ?? ''}`;
    const page = await pageFor(roleFor(slug));
    const visit = async () => { await page.goto(base + path, { waitUntil: 'domcontentloaded' }); await ready(page); };
    await visit();
    const buttons = await page.locator('button').evaluateAll(bs => bs.map((b, index) => ({ index, text: b.innerText.trim().replace(/\s+/g, ' '), id: b.id, title: b.title, visible: !!b.getClientRects().length && !b.disabled, skip: !!b.closest('header,footer,dialog') || (b.type === 'submit' && !!b.form) || /Đăng xuất/.test(b.innerText) })).filter(b => b.visible && !b.skip));
    for (const target of buttons) {
      await visit(); const b = page.locator('button').nth(target.index);
      if (!await b.isVisible() || await b.isDisabled()) continue;
      const before = await snapshot(page), count = downloads;
      try { await b.click(); await page.waitForTimeout(150); tested++; if (before === await snapshot(page) && downloads === count) noChange.push({ slug, ...target }); }
      catch (e) { failures.push({ slug, ...target, error: e.message }); }
    }
    console.log(`${slug}: checked ${buttons.length} initial visible controls`);
  }
  console.log(JSON.stringify({ tested, failures, noChange, errors }, null, 2));
  assert.deepEqual(errors, [], 'No runtime errors when clicking controls'); assert.deepEqual(failures, [], 'Every visible control must be clickable');
} finally { await browser.close(); await cleanup(); }
