import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4186','--strictPort'],{windowsHide:true,stdio:'pipe'});
let browser;
try{
  for(let i=0;i<50;i++){try{const r=await fetch('http://127.0.0.1:4186');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
  const errors=[],failures=[];page.on('pageerror',e=>errors.push(String(e)));page.on('response',r=>{if(r.status()>=400&&r.url().startsWith('http://127.0.0.1:4186'))failures.push([r.status(),r.url()]);});
  const modelUrl='http://127.0.0.1:4186/models/sprig.glb';let modelRequests=0;
  await page.route(modelUrl,route=>++modelRequests===1?route.fulfill({status:502,body:'Temporary model gateway failure'}):route.continue());
  await page.goto('http://127.0.0.1:4186',{waitUntil:'domcontentloaded'});
  await page.locator('#start-button').click();
  assert.equal(modelRequests,2,'a transient GLB failure is recovered by a bounded retry');
  await page.locator('#selection-action').click();
  await page.waitForFunction(()=>document.getElementById('quest-index').textContent.startsWith('02'));
  await page.keyboard.press('KeyH');
  await page.waitForFunction(()=>document.getElementById('quest-index').textContent.startsWith('03'));
  await page.locator('.action-bar [data-panel="evolve"]').click();
  await page.locator('[data-evolution="legs"]').click();await page.locator('#evolve-confirm').click();
  assert.equal(await page.locator('[data-style],#skill-button').count(),0,'styles are retired');
  assert.equal(await page.locator('#evolution-preview canvas').count(),1,'evolution keeps its live body preview');
  await page.locator('#dialog-close').click();
  assert.equal(await page.locator('#explore-button').getAttribute('aria-expanded'),'false');
  await page.locator('#explore-button').click();assert.equal(await page.locator('.journey-panel').isVisible(),true);
  await page.locator('#explore-button').click();assert.equal(await page.locator('.journey-panel').isVisible(),false);
  await page.keyboard.press('Space');
  await page.screenshot({path:'artifacts/production-gameplay.png'});
  assert.equal(await page.evaluate(()=>window.__game),undefined,'development diagnostics are absent from the production build');
  assert.deepEqual(errors,[]);assert.deepEqual(failures,[[502,modelUrl]],'only the deliberately injected network failure occurred');
  await fs.writeFile('artifacts/production-results.json',JSON.stringify({ok:true,errors,expectedNetworkFailures:failures,modelRequests,journey:await page.locator('#quest-title').textContent(),interface:'body evolution, no styles, persistent manual panel switch'},null,2));
  console.log(JSON.stringify({ok:true,errors,modelRequests,productionGameplay:'harvest, deposit, first evolution and manual panel controls completed'},null,2));
}finally{await browser?.close();server.kill();}
