import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch();const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
const paths=['/',...fs.readdirSync('pages').map(s=>`/pages/${s}/`)];
for(const path of paths){
await page.setViewportSize({width:1313,height:927});await page.goto('http://127.0.0.1:5173'+path);
await expect(page.locator('body')).toHaveCSS('background-color','rgb(246, 248, 251)');
await expect(page.locator('body')).toHaveCSS('color','rgb(36, 49, 87)');
const button=page.locator('button.bg-primary:not(.rounded-full),.admin-primary').first();if(await button.count()){
await expect(button).toHaveCSS('background-color','rgb(63, 91, 170)');await expect(button).toHaveCSS('border-radius','8px');
}
await page.setViewportSize({width:390,height:844});
assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,path+' overflow');
console.log(path,'passed');
}
assert.deepEqual(errors,[]);await browser.close();
