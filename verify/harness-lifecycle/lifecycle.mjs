import assert from 'node:assert/strict';
const {chromium}=await import((process.env.PLAYWRIGHT_DIR || '/tmp/factory-browser/node_modules/playwright')+'/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
 const context=await browser.newContext({timezoneId:'UTC'});const page=await context.newPage();const errors=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
 await page.addInitScript(()=>{
  window.activePageShow=new Set();const add=window.addEventListener;const remove=window.removeEventListener;
  window.addEventListener=function(type,fn,...args){if(type==='pageshow')window.activePageShow.add(fn);return add.call(this,type,fn,...args)};
  window.removeEventListener=function(type,fn,...args){if(type==='pageshow')window.activePageShow.delete(fn);return remove.call(this,type,fn,...args)};
 });
 await page.goto(`http://127.0.0.1:${process.env.HARNESS_PORT || 3012}/`);
 await page.waitForFunction(()=>window.controls?.first && window.activePageShow.size===1);
 await page.locator('[data-id="first"] button').click();
 await page.waitForFunction(()=>[...document.querySelectorAll('output')].every(x=>x.textContent==='local'));
 assert.deepEqual(await page.locator('output').allTextContents(),['local','local']);
 await page.evaluate(()=>window.root.unmount());
 assert.equal(await page.evaluate(()=>window.activePageShow.size),0);
 await page.evaluate(()=>{localStorage.setItem('tempo-explorer-time-format','utc');dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));window.remount()});
 await page.waitForFunction(()=>[...document.querySelectorAll('output')].length===2 && [...document.querySelectorAll('output')].every(x=>x.textContent==='utc'));
 assert.equal(await page.evaluate(()=>window.activePageShow.size),1);
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('quota')};window.controls.first.cycleTimeFormat()});
 await page.waitForFunction(()=>window.controls.second.timeFormat==='unix');
 await page.evaluate(()=>{window.root.unmount();window.remount()});
 await page.waitForFunction(()=>[...document.querySelectorAll('output')].length===2 && [...document.querySelectorAll('output')].every(x=>x.textContent==='unix'));
 assert.deepEqual(await page.locator('output').allTextContents(),['unix','unix']);
 assert.equal(await page.evaluate(()=>window.activePageShow.size),1);
 assert.equal(await page.evaluate(()=>localStorage.getItem('tempo-explorer-time-format')),'utc');
 await page.evaluate(()=>window.root.unmount());assert.equal(await page.evaluate(()=>window.activePageShow.size),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: StrictMode two-consumer changes local->utc->unix; one active pageshow listener while mounted, zero after full unmount; persisted update reconciled on root remount; failed write retains unix across full root remount; zero console/page errors');
} catch(error){console.error(error);process.exitCode=1} finally{await browser.close()}
