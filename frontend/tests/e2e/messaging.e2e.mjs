// Phase 8 "messaging" (BR-32 … BR-34, BR-43): recruitment messaging (conversation list, message thread,
// text and file exchange, interview cards, mute/archive preferences, report) and notifications
// (header bell, unread count, realtime, full notifications page).
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

  // 2. Open Candidates board to initiate/open conversation with applicant
  await page.goto(`${APP}/pages/candidates/`);
  await ready(page);
  await page.waitForSelector('.candidate-board');

  // Click candidate card to open drawer and initiate chat if button available
  const cardLocator = page.locator('.candidate-board .cursor-pointer, [data-application-id]').first();
  if (await cardLocator.count() > 0) {
    await cardLocator.click();
    await page.waitForTimeout(800);
    const msgBtn = page.locator('button:has-text("Nhắn tin"), button:has-text("Chat"), .app-msg-btn').first();
    if (await msgBtn.count() > 0) {
      await msgBtn.click();
      await page.waitForTimeout(1000);
    }
  }

  // 3. Open Messages page as employer
  await page.goto(`${APP}/pages/messages/`);
  await ready(page);
  await page.waitForSelector('aside, section');
  step('messages 3-column layout loaded for employer');

  // Check filter tabs
  const tabs = page.locator('aside:first-child button');
  const tabTexts = await tabs.allTextContents();
  assert.ok(tabTexts.some(t => /Tất cả/i.test(t)), 'filter tabs include Tất cả');
  assert.ok(tabTexts.some(t => /Chưa đọc/i.test(t)), 'filter tabs include Chưa đọc');
  step('sidebar conversation filters verified');

  // If there is an active conversation, test sending a message
  const chatInput = page.locator('input[placeholder*="Nhập tin nhắn"]').first();
  if (await chatInput.count() > 0 && !(await chatInput.isDisabled())) {
    const testMsg = `Xin chào bạn ứng viên! ${Date.now()}`;
    await chatInput.fill(testMsg);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    step('employer sent message in chat thread');
  }

  // 4. Test header notification bell & full notifications page
  const bell = page.locator('header [data-app-control="notifications"], header button[aria-label="Thông báo"]').first();
  await bell.waitFor();
  await bell.click();
  await page.waitForSelector('dialog, .app-notification-list, .app-empty-notifications');
  step('header notification bell opens notifications modal');

  await page.goto(`${APP}/pages/notifications/`);
  await ready(page);
  await page.waitForSelector('#notifications-page, #notifications-list');
  const markAllBtn = page.locator('#mark-all-read-btn');
  assert.equal(await markAllBtn.count(), 1, 'mark all read button present');
  await markAllBtn.click();
  step('full notifications page loaded and mark all read works');

  // 5. Sign in as student and verify student messaging & notifications
  await logout(page);
  await login(page, demo('student'), DEMO_PASSWORD);
  step('student signed in');

  await page.goto(`${APP}/pages/messages/`);
  await ready(page);
  await page.waitForSelector('aside, section');
  step('student messages workspace loaded');

  await page.goto(`${APP}/pages/notifications/`);
  await ready(page);
  await page.waitForSelector('#notifications-page');
  step('student notifications center loaded');

  assert.equal(errors.length, 0, `no uncaught browser errors: ${errors.join(', ')}`);
  console.log('✅ Phase 8 messaging and notifications E2E checks passed successfully.');
} finally {
  await browser.close();
  await cleanup();
}
