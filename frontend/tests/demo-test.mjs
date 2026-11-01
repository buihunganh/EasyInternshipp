// Flows on pages still on local demo data (candidate board, messages, community, university contact),
// plus the CV builder editor (saved to Supabase since Phase 6, as a throwaway student). Registration, search,
// applying, following and posting are covered by the real-data suites in tests/e2e/.
import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import { cleanup, ready, setSession, throwawayEmployer, throwawayStudent } from './session.mjs';
const base=process.env.APP_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1366,height:900}});page.setDefaultTimeout(8000);
page.setDefaultNavigationTimeout(30000);
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const goto=async slug=>{await page.goto(base+(slug?`/pages/${slug}/`:'/'),{waitUntil:'domcontentloaded'});await ready(page);};
const submit=()=>page.locator('dialog[open] button[type=submit]').click();
try{
  await page.goto(base+'/');await setSession(page,null);
  await page.goto(base+'/pages/messages/');await expect(page).toHaveURL(/login/);
  const student=await throwawayStudent(),employer=await throwawayEmployer();
  await setSession(page,student);

  await goto('cv-builder');await page.locator('#input-fullname').fill('Demo Tester');await page.locator('#input-school').fill('Demo University');await page.locator('#input-github').fill('github.com/demo');await expect(page.locator('#a4-cv-sheet')).toContainText('Demo University');await expect(page.locator('#preview-links')).toContainText('github.com/demo');
  await page.getByRole('button',{name:'Thêm dự án mới',exact:true}).click();await page.locator('dialog input[name=title]').fill('Demo Project');await page.locator('dialog textarea').fill('Project description');await submit();await expect(page.locator('#a4-cv-sheet')).toContainText('Demo Project');await page.getByRole('button',{name:/Lưu & Cập nhật/}).click();await expect(page.locator('#app-feedback')).toContainText(/Đã tạo CV|Đã lưu CV/);await expect(page).toHaveURL(/[?&]id=/);await page.reload();await ready(page);await expect(page.locator('#preview-name')).toHaveText('DEMO TESTER');await expect(page.locator('#a4-cv-sheet')).toContainText('Demo Project');
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));await page.emulateMedia({media:'print'});await expect(page.locator('input:visible')).toHaveCount(0);await expect(page.locator('#demo-print-region')).toBeVisible();await page.emulateMedia({media:'screen'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  console.log('CV live fields, project CRUD, persistence and print isolation passed.');

  await setSession(page,employer);
  await goto('candidates');const candidate=page.locator('[data-demo-card]').first();const id=await candidate.getAttribute('data-demo-card');await candidate.getByRole('button',{name:'Chuyển vòng',exact:true}).click();await page.locator('dialog select').selectOption('2');await submit();await expect(page.locator('.candidate-board>div').nth(2).locator(`[data-demo-card="${id}"]`)).toBeVisible();await page.reload();await expect(page.locator('.candidate-board>div').nth(2).locator(`[data-demo-card="${id}"]`)).toBeVisible();const download=page.waitForEvent('download');await page.getByRole('button',{name:'Xuất Excel'}).click();assert.match((await download).suggestedFilename(),/csv$/);
  console.log('Candidate board stage move and CSV passed.');

  await setSession(page,student);
  await goto('messages');const chat=page.locator('input[placeholder^="Nhập tin nhắn"]');await chat.fill('Demo first thread');await chat.press('Enter');await expect(page.locator('.app-chat-message')).toHaveText('Demo first thread');await page.locator('aside h3').nth(1).click();await expect(page.locator('section h2').first()).toHaveText('Lê Hoàng Nam');await expect(page.locator('.app-chat-message')).toHaveCount(0);await chat.fill('Demo second thread');await chat.press('Enter');await page.locator('aside h3').first().click();await expect(page.locator('.app-chat-message')).toHaveText('Demo first thread');
  await page.getByRole('button',{name:'Đính kèm CV / File'}).click();await page.locator('dialog input[type=file]').setInputFiles({name:'demo-cv.txt',mimeType:'text/plain',buffer:Buffer.from('demo cv')});await submit();await expect(page.locator('.app-chat-message').last()).toContainText('demo-cv.txt');
  await page.getByRole('button',{name:'Tùy chọn cuộc trò chuyện'}).click();await page.getByRole('menuitem',{name:'Tắt thông báo cuộc trò chuyện'}).click();await expect(page.locator('#conversation-status')).toContainText('Đã tắt thông báo');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Đổi hội thoại',exact:true}).click();await page.locator('dialog select').selectOption('2');const selectedName=await page.locator('dialog option:checked').textContent();await submit();await expect(page.locator('section h2').first()).toHaveText(selectedName);await chat.fill('Mobile demo message');await page.getByRole('button',{name:'Gửi tin nhắn',exact:true}).click();await expect(page.locator('.app-chat-message').last()).toHaveText('Mobile demo message');await page.setViewportSize({width:1366,height:900});
  console.log('Independent conversations, messaging, upload and per-thread settings passed.');

  await goto('community');await page.getByRole('button',{name:/Chia sẻ kinh nghiệm phỏng vấn/}).click();await page.locator('dialog textarea').fill('Demo community post');await submit();await expect(page.locator('#demo-posts')).toContainText('Demo community post');await page.locator('#demo-posts').getByRole('button',{name:'Bình luận',exact:true}).click();await page.locator('dialog textarea').fill('Demo comment');await submit();await page.locator('#demo-posts').getByRole('button',{name:'Bình luận',exact:true}).click();await expect(page.locator('dialog')).toContainText('Demo comment');await page.keyboard.press('Escape');await page.reload();await expect(page.locator('#demo-posts')).toContainText('Demo community post');
  await goto('university');await page.locator('#btn-contact-career').click();const contact=page.locator('#partner-inquiry-form');await contact.locator('input').nth(0).fill('Demo Tester');await contact.locator('input').nth(1).fill('Demo Company');await contact.locator('input').nth(2).fill('demo@example.com');await contact.locator('button[type=submit]').click();await expect(page.locator('#contact-modal')).not.toBeVisible();
  console.log('Community posting, comments, persistence and university contact passed.');
  assert.deepEqual(errors,[]);console.log('All demo integration checks passed.');
}finally{await browser.close();await cleanup();}
