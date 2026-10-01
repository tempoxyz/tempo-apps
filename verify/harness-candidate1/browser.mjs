const {chromium}=await import((process.env.PLAYWRIGHT_DIR || '/tmp/factory-browser/node_modules/playwright')+'/index.mjs');
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser=await chromium.launch({channel:'chrome',headless:true});
const results=[];const key='tempo-explorer-time-format';
const url=`http://127.0.0.1:${process.env.HARNESS_PORT || 3012}/`;
async function state(page, expected, count=2){await page.waitForFunction(({expected,count})=>{const els=[...document.querySelectorAll('output')];return els.length===count && els.every(x=>x.textContent===expected)}, {expected,count});assert.deepEqual(await page.locator('output').allTextContents(),Array(count).fill(expected));if(expected==='unix')assert.deepEqual(await page.locator('time').allTextContents(),Array(count).fill('1700000000'));if(expected==='utc'||expected==='local')assert.deepEqual(await page.locator('time').allTextContents(),Array(count).fill('Nov 14, 22:13:20 UTC'));assert.deepEqual(await page.locator('time').evaluateAll(els=>els.map(el=>el.getAttribute('datetime'))),Array(count).fill('2023-11-14T22:13:20.000Z'));}
async function scenario(saved,fault='none'){
 const context=await browser.newContext({timezoneId:'UTC'});const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text());});
 await context.addInitScript(({saved,fault,key})=>{
  const storage=window.localStorage;const get=Storage.prototype.getItem;const set=Storage.prototype.setItem;
  if(saved!==null)set.call(storage,key,saved);set.call(storage,'unrelated-preference','keep');set.call(storage,'tempo-theme','dark');
  window.writes=[];window.readStorage=(key)=>get.call(storage,key);
  Storage.prototype.setItem=function(k,v){window.writes.push([k,v]);if(fault==='write')throw new Error('quota denied');return set.call(this,k,v)};
  if(fault==='read')Storage.prototype.getItem=function(){throw new Error('read denied')};
  if(fault==='getter')Object.defineProperty(window,'localStorage',{get(){throw new Error('storage access denied')}});
 },{saved,fault,key});
 const response=await page.goto(url);const html=await response.text();assert.equal((html.match(/<output>relative<\/output>/g)||[]).length,2);assert.equal(html.includes('Showing UTC'),false);
 await page.waitForFunction(()=>window.controls?.first && window.controls?.second);
 const expected=(fault==='getter'||fault==='read')?'relative':(['relative','local','utc','unix'].includes(saved)?saved:'relative');
 await state(page,expected);assert.deepEqual(await page.evaluate(()=>window.writes),[]);
 assert.equal(await page.evaluate(()=>window.readStorage('unrelated-preference')),'keep');assert.equal(await page.evaluate(()=>window.readStorage('tempo-theme')),'dark');
 const cycle={relative:'local',local:'utc',utc:'unix',unix:'relative'};let current=expected;
 for(let i=0;i<4;i++){await page.locator(`[data-id="${i%2?'second':'first'}"] button`).click();current=cycle[current];await state(page,current);assert.equal(await page.locator('[data-id="first"] button').getAttribute('title'),`Showing ${current==='utc'?'UTC':current} time - click to change`);}
 await page.evaluate(()=>{for(let i=0;i<13;i++)window.controls[i%2?'second':'first'].cycleTimeFormat()});current=cycle[current];await state(page,current);
 await page.evaluate(()=>{window.controls.first.setTimeFormat(current=>current==='local'?'utc':'local');window.controls.second.setTimeFormat(current=>current==='utc'?'unix':'utc')});current=current==='local'?'unix':'utc';await state(page,current);
 await page.locator('#toggle').click();await state(page,current,1);await page.locator('[data-id="second"] button').click();current=cycle[current];await state(page,current,1);await page.locator('#toggle').click();await state(page,current);await page.locator('#navigate').click();await state(page,current);
 assert.equal(await page.evaluate(()=>window.readStorage('unrelated-preference')),'keep');assert.equal(await page.evaluate(()=>window.readStorage('tempo-theme')),'dark');
 if(fault==='none'||fault==='read')assert.equal(await page.evaluate(key=>window.readStorage(key),key),current);
 assert.equal(await page.evaluate(()=>window.writes.length),fault==='getter'?0:20);assert.deepEqual(await page.evaluate(()=>window.recoverableErrors),[]);assert.deepEqual(errors,[]);
 // Same live Node SSR module is reused across requests after a client choice.
 const later=await page.request.get(url);assert.equal(((await later.text()).match(/<output>relative<\/output>/g)||[]).length,2);
 results.push({saved,fault,initial:expected,final:current,status:'PASS',hydrationErrors:0,consoleErrors:0});await context.close();
}
try{
 for(const saved of [null,'relative','local','utc','unix','','UTC',' utc ','{}','["unix"]','future','null','0'])await scenario(saved);
 for(const fault of ['getter','read','write'])await scenario('utc',fault);
 // Full reload without a seeding init script: each saved choice must restore.
 const context=await browser.newContext({timezoneId:'UTC'});const page=await context.newPage();await page.goto(url);await page.waitForFunction(()=>window.controls?.first && window.controls?.second);await state(page,'relative');
 for(const expected of ['local','utc','unix','relative']){await page.locator('[data-id="first"] button').click();await state(page,expected);await page.reload();await state(page,expected);assert.equal(await page.evaluate(key=>localStorage.getItem(key),key),expected)}
 results.push({scenario:'all four choices survive real browser reload',status:'PASS'});await context.close();
 console.log(JSON.stringify({status:'PASS',candidate:process.env.CANDIDATE_SHA || 'unspecified',results},null,2));
}catch(error){console.log(JSON.stringify({status:'FAIL',results,error:error.stack},null,2));process.exitCode=1}finally{await browser.close()}
