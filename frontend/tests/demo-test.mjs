// Flows on pages still on local demo data (community, university contact), plus the CV builder editor
// (saved to Supabase since Phase 6, as a throwaway student). Registration, search, applying, posting, the
// candidate board and messages (real data since Phases 7–8) are covered by the suites in tests/e2e/.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import { cleanup, ready, setSession, throwawayStudent } from './session.mjs';
const base=process.env.APP_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(8000);
page.setDefaultNavigationTimeout(30000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const goto=async slug=>{await page.goto(base+(slug?`/pages/${slug}/`:'/'),{waitUntil:'domcontentloaded'});await ready(page);};
const submit=()=>page.locator('dialog[open] button[type=submit]').click();
try{
  await page.goto(base+'/');await setSession(page,null);
  await page.goto(base+'/pages/messages/');await expect(page).toHaveURL(/login/);
  const student=await throwawayStudent();
  await setSession(page,student);

  await goto('cv-builder');await page.locator('#input-fullname').fill('Demo Tester');await page.locator('#input-school').fill('Demo University');await page.locator('#input-github').fill('github.com/demo');await expect(page.locator('#a4-cv-sheet')).toContainText('Demo University');await expect(page.locator('#preview-links')).toContainText('github.com/demo');
  await page.getByRole('button',{name:'Thêm dự án mới',exact:true}).click();await page.locator('dialog input[name=title]').fill('Demo Project');await page.locator('dialog textarea').fill('Project description');await submit();await expect(page.locator('#a4-cv-sheet')).toContainText('Demo Project');await page.getByRole('button',{name:/Lưu & Cập nhật/}).click();await expect(page.locator('#app-feedback')).toContainText(/Đã tạo CV|Đã lưu CV/);await expect(page).toHaveURL(/[?&]id=/);await page.reload();await ready(page);await expect(page.locator('#preview-name')).toHaveText('DEMO TESTER');await expect(page.locator('#a4-cv-sheet')).toContainText('Demo Project');
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});await expect(page.locator('input:visible')).toHaveCount(0);await expect(page.locator('#demo-print-region')).toBeVisible();await page.emulateMedia({media:'screen'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  console.log('CV live fields, project CRUD, persistence and print isolation passed.');

  await setSession(page,student);
  await goto('community');await page.getByRole('button',{name:/Chia sẻ kinh nghiệm phỏng vấn/}).click();await page.locator('dialog textarea').fill('Demo community post');await submit();await expect(page.locator('#demo-posts')).toContainText('Demo community post');await page.locator('#demo-posts').getByRole('button',{name:'Bình luận',exact:true}).click();await page.locator('dialog textarea').fill('Demo comment');await submit();await page.locator('#demo-posts').getByRole('button',{name:'Bình luận',exact:true}).click();await expect(page.locator('dialog')).toContainText('Demo comment');await page.keyboard.press('Escape');await page.reload();await expect(page.locator('#demo-posts')).toContainText('Demo community post');
  await goto('university');await page.locator('#btn-contact-career').click();const contact=page.locator('#partner-inquiry-form');await contact.locator('input').nth(0).fill('Demo Tester');await contact.locator('input').nth(1).fill('Demo Company');await contact.locator('input').nth(2).fill('demo@example.com');await contact.locator('button[type=submit]').click();await expect(page.locator('#contact-modal')).not.toBeVisible();
  console.log('Community posting, comments, persistence and university contact passed.');
  assert.deepEqual(errors,[]);console.log('All demo integration checks passed.');
}finally{await browser.close();await cleanup();}
