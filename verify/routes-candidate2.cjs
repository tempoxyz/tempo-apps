const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const out='/Users/daniel/tempo/tempo-apps-factory/.factory/time-format';
(async()=>{
const browser=await chromium.launch({channel:'chrome',headless:true});
for(const [label,port,persist] of [['after',3000,true]]){
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'});
 const page=await context.newPage(); const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://localhost:${port}/blocks?from=100000&live=false`,{waitUntil:'domcontentloaded',timeout:60000});
 const button=page.locator('button[title^="Showing "]');await button.first().waitFor({timeout:30000});
 await page.waitForTimeout(1500);
 assert.match(await button.first().getAttribute('title'),/Showing relative/);
 await button.first().click(); await page.waitForFunction(()=>document.querySelector('button[title^="Showing local"]'));
 await button.first().click(); await page.waitForFunction(()=>document.querySelector('button[title^="Showing UTC"]'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(expected=>document.querySelector(`button[title^="Showing ${expected}"]`),persist?'UTC':'relative',{timeout:30000});
 // Dedicated comparison script captures loaded token timestamps.
 console.log(label,'reload:',await page.locator('button[title^="Showing "]').first().getAttribute('title'));
 if(persist){
  assert.equal(await page.evaluate(()=>localStorage.getItem('tempo-explorer-time-format')),'utc');
  await page.locator('a[href="/"]').first().click();
  await page.locator('a[href="/tokens"]').first().click();
  await page.waitForURL('**/tokens');
  await page.waitForFunction(()=>document.querySelector('button[title^="Showing UTC"]'),null,{timeout:30000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('button[title^="Showing UTC"]'),null,{timeout:30000});
  await page.waitForFunction(()=>[...document.querySelectorAll('time')].some(t=>t.textContent.endsWith(' UTC'))); assert((await page.locator('time').allTextContents()).every(t=>t.endsWith(' UTC'))); console.log('tokens rendered UTC timestamps:',await page.locator('time').allTextContents()); await page.screenshot({path:`${out}/tokens-after-reload.png`,fullPage:true});
  await page.locator('button[title^="Showing UTC"]').first().click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('tempo-explorer-time-format')),'unix'); await page.waitForFunction(()=>[...document.querySelectorAll('time')].some(t=>/^\d+$/.test(t.textContent))); assert((await page.locator('time').allTextContents()).every(t=>/^\d+$/.test(t))); console.log('tokens rendered unix timestamps:',await page.locator('time').allTextContents());
  await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL(`http://localhost:${port}/`); await page.locator('a[href="/tokens"]').first().waitFor(); await page.waitForTimeout(500); await page.goBack({waitUntil:'domcontentloaded'}); await page.waitForURL('**/blocks?**'); console.log('back URL',page.url()); await page.waitForTimeout(2000); console.log('back state',await page.evaluate(()=>({title:document.querySelector('button[title^="Showing "]')?.title,stored:localStorage.getItem('tempo-explorer-time-format')}))); await page.screenshot({path:`${out}/back-debug.png`,fullPage:true});
  await page.waitForFunction(()=>document.querySelector('button[title^="Showing unix"]'),null,{timeout:30000});
  console.log('after: SPA blocks->home->tokens, hard reload, choose unix, back->blocks all passed');
 }
 fs.writeFileSync(`${out}/${label}-browser-errors.json`,JSON.stringify(errors,null,2));console.log(label,'pageerrors',errors.length);
 await context.close();
}
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
