import assert from 'node:assert/strict';
const {chromium}=await import((process.env.PLAYWRIGHT_DIR || '/tmp/factory-browser/node_modules/playwright')+'/index.mjs');
const browser=await chromium.launch({channel:'chrome',headless:true,ignoreDefaultArgs:['--disable-back-forward-cache']});
const context=await browser.newContext({timezoneId:'UTC'});
const page=await context.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
await page.addInitScript(()=>{window.pageShows=[];addEventListener('pageshow',event=>window.pageShows.push(event.persisted));});
const base=`http://127.0.0.1:${process.env.STATIC_PORT || 3013}/`;
const snap=async step=>console.log(JSON.stringify({step,...await page.evaluate(()=>({mode:[...document.querySelectorAll('output')].map(x=>x.textContent),stored:localStorage.getItem('tempo-explorer-time-format'),pageShows:window.pageShows,reasons:performance.getEntriesByType('navigation')[0]?.notRestoredReasons}))}));
const wait=async expected=>page.waitForFunction(expected=>window.controls?.first?.timeFormat===expected,expected);
async function history(direction,expected){
 await page[direction]({waitUntil:'commit',timeout:5000});
 await page.waitForTimeout(300);
 await snap(`${direction}, expected ${expected}`);
 assert.equal(await page.evaluate(()=>window.pageShows.at(-1)),true,'Must actually restore BFCache');
 assert.deepEqual(await page.locator('output').allTextContents(),[expected,expected]);
}
try {
 await page.goto(base);await wait('relative');
 await page.evaluate(()=>{localStorage.setItem('unrelated-preference','keep');localStorage.setItem('tempo-theme','dark')});
 await page.locator('[data-id="first"] button').click();await wait('local');await snap('first document choose local');
 await page.goto(base+'?second');await wait('local');
 await page.locator('[data-id="first"] button').click();await wait('utc');await snap('second document choose utc');
 await history('goBack','utc');
 await page.locator('[data-id="second"] button').click();await wait('unix');
 await history('goForward','unix');
 await page.locator('[data-id="first"] button').click();await wait('relative');
 await history('goBack','relative');
 await page.locator('[data-id="first"] button').click();await wait('local');
 await history('goForward','local');
 assert.equal(await page.evaluate(()=>localStorage.getItem('unrelated-preference')),'keep');
 assert.equal(await page.evaluate(()=>localStorage.getItem('tempo-theme')),'dark');
 assert.deepEqual(errors,[]);
 console.log('PASS: Back/Forward retained latest same-tab choice in every mode; unrelated preferences intact; no page errors');
} catch(error){console.error(error);process.exitCode=1}finally{await browser.close()}
