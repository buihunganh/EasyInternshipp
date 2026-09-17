import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const base=process.env.APP_URL||'http://127.0.0.1:5173';
const browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1366,height:900}});
await context.addInitScript(()=>{localStorage.clear();localStorage.setItem('internships:demo-session',JSON.stringify({role:'student'}));window.print=()=>{document.body.dataset.printRequested='true';};});
const page=await context.newPage();page.setDefaultTimeout(4000);
await page.route('https://fonts.googleapis.com/**',r=>r.abort());await page.route('https://fonts.gstatic.com/**',r=>r.abort());
const failures=[],noChange=[],errors=[];let tested=0,downloads=0;
page.on('pageerror',e=>errors.push({url:page.url(),error:e.message}));page.on('download',()=>downloads++);
const visit=async path=>{await page.goto(base+path,{waitUntil:'domcontentloaded'});await page.locator('.demo-notice').waitFor();};
const snapshot=()=>page.evaluate(()=>{
  const text=document.body.outerHTML+JSON.stringify({...localStorage})+JSON.stringify([...document.querySelectorAll('input,textarea,select')].map(e=>[e.value,e.checked]));
  let hash=0;for(let i=0;i<text.length;i++)hash=(hash*31+text.charCodeAt(i))|0;
  return [location.href,hash,Math.round(scrollY),document.queryCommandState('bold'),document.queryCommandState('italic'),document.queryCommandState('underline')].join('|');
});
try{
for(const slug of ['jobs',...fs.readdirSync('pages').filter(s=>!s.startsWith('admin'))].filter(s=>!process.env.AUDIT_PAGE||s===process.env.AUDIT_PAGE)){
  const path=slug==='jobs'?'/':`/pages/${slug}/`;await visit(path);
  const buttons=await page.locator('button').evaluateAll(bs=>bs.map((b,index)=>({index,text:b.innerText.trim().replace(/\s+/g,' '),id:b.id,title:b.title,visible:!!b.getClientRects().length&&!b.disabled,skip:!!b.closest('header,footer,dialog,.demo-notice')||(b.type==='submit'&&!!b.form)})).filter(b=>b.visible&&!b.skip));
  for(const target of buttons){
    await visit(path);const b=page.locator('button').nth(target.index);
    if(!await b.isVisible()||await b.isDisabled())continue;
    const before=await snapshot(),count=downloads;
    try{await b.click();await page.waitForTimeout(120);tested++;if(before===await snapshot()&&downloads===count)noChange.push({slug,...target});}
    catch(e){failures.push({slug,...target,error:e.message});}
  }
  console.log(`${slug}: checked ${buttons.length} initial visible controls`);
}
console.log(JSON.stringify({tested,failures,noChange,errors},null,2));
assert.deepEqual(errors,[],'No runtime errors when clicking controls');assert.deepEqual(failures,[],'Every visible control must be clickable');
}finally{await browser.close();}
