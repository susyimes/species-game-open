import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/beginner-browser';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960},hasTouch:true}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));
try{
  await page.goto('http://127.0.0.1:5196',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__game);
  await page.locator('#start-button').click();await page.locator('#onboarding').waitFor({state:'visible'});
  assert.equal(await page.locator('#explore-button').getAttribute('aria-expanded'),'false');
  assert.equal(await page.locator('.journey-panel').isVisible(),false);assert.equal(await page.locator('#compact-vitals').isVisible(),true);
  assert.equal(await page.locator('#survival-strip').isVisible(),false);assert.equal(await page.locator('[data-style],#skill-button,#food-rate').count(),0);
  assert.equal(await page.locator('.action-bar button:visible').count(),1);
  await page.screenshot({path:out+'/01-clear-start.png'});
  await page.locator('#explore-button').click();await page.waitForTimeout(17000);
  assert.equal(await page.locator('.journey-panel').isVisible(),true);assert.equal(await page.locator('#explore-button').getAttribute('aria-expanded'),'true');
  for(const selector of ['.colony-panel','.creature-panel','.minimap','#weather-toggle'])assert.equal(await page.locator(selector).isVisible(),false);
  for(const key of ['Digit2','Digit3','Digit4','Digit5','Digit6']){await page.keyboard.press(key);assert.equal(await page.locator('dialog[open]').count(),0,`${key} exposed a locked system`);}
  await page.locator('#explore-button').click();
  checks.push('manual panels stay open beyond 15 seconds but neither expanded panels nor shortcuts reveal future systems');
  await page.locator('#selection-action').click();await page.waitForFunction(()=>window.__game.state.metrics.gathered>=6);
  await page.locator('#return-button').click();await page.waitForFunction(()=>window.__game.state.metrics.deposited>=6);
  await page.locator('.action-bar [data-panel="evolve"]').click();assert.equal(await page.locator('[data-style]').count(),0);
  assert.equal(await page.locator('[data-evolution]').count(),1);await page.locator('#evolve-confirm').click();
  assert.equal(await page.locator('#evolution-preview canvas').count(),1);assert.equal(await page.locator('[data-evolution]').count(),3);
  await page.screenshot({path:out+'/03-evolution-without-styles.png'});await page.locator('#dialog-close').click();
  await page.locator('.action-bar [data-panel="colony"]').click();
  assert.equal(await page.locator('.food-management,[data-food-policy],[data-panel="journey"]:visible,.population-settings:visible,.hatch-panel:visible').count(),0);
  assert.equal(await page.locator('.building-grid [data-build]:visible').count(),1);assert.equal(await page.locator('.building-grid [data-build]:visible').getAttribute('data-build'),'garden');
  await page.screenshot({path:out+'/02-home-building-first.png'});await page.locator('[data-build="garden"]').click();
  await page.waitForFunction(()=>window.__game.state.buildings.some(b=>b.kind==='garden'&&b.progress===1));
  assert.equal(await page.locator('#expedition-button').isVisible(),false);await page.keyboard.press('Digit6');assert.equal(await page.locator('dialog[open]').count(),0);
  checks.push('fresh harvest, return, first evolution and garden construction work through real controls with one next objective');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const boxes=await Promise.all(['#onboarding','.time-controls','.world-tools','.interaction-row','.action-bar'].map(sel=>page.locator(sel).boundingBox()));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(!(a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),`mobile controls ${i} and ${j} overlap`);}
  await page.screenshot({path:out+'/04-mobile-simple.png'});await page.locator('#explore-button').click();await page.screenshot({path:out+'/05-mobile-panels-open.png'});
  await page.locator('#explore-button').click();await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__game);
  assert.equal(await page.locator('.journey-panel').isVisible(),false);assert.ok(await page.evaluate(()=>window.__game.state.parts.includes('legs')));
  // Isolate later unlock thresholds after the naturally played first four objectives.
  await page.evaluate(()=>{const s=window.__game.state;s.completed=['gather','home','evolve','build','explore'];s.quest=5;s.discovered=['meadow','grove','ridge'];window.__game.ui.update(true);});
  assert.equal(await page.locator('#expedition-button').isVisible(),false);assert.equal(await page.locator('#rally-button').isVisible(),true);
  await page.keyboard.press('Digit2');await page.locator('.population-settings summary').click();assert.equal(await page.locator('#population-limit').textContent(),'10');
  await page.locator('#breeding-toggle').click();assert.equal(await page.locator('.population-settings').getAttribute('open'),'');
  await page.locator('[data-population-delta="-1"]').click();assert.equal(await page.locator('.population-settings').getAttribute('open'),'');
  assert.equal(await page.locator('#population-limit').textContent(),'9');await page.locator('#dialog-close').click();
  await page.evaluate(()=>{window.__game.state.completed.push('colony');window.__game.state.quest=6;window.__game.ui.update(true);});
  assert.equal(await page.locator('#expedition-button').isVisible(),true);assert.equal(await page.locator('#chapter-button').isVisible(),true);
  await page.keyboard.press('Digit6');assert.equal(await page.locator('dialog[open]').count(),1);await page.locator('#dialog-close').click();
  assert.equal(await page.locator('.journey-panel').isVisible(),false);await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await page.waitForFunction(()=>!!window.__game);
  await page.keyboard.press('Digit2');await page.locator('.population-settings summary').click();assert.equal(await page.locator('#population-limit').textContent(),'9');
  checks.push('later threshold fixture: fifth objective adds family controls, sixth adds expedition and chapter; shortcuts match buttons');
  checks.push('390px controls do not overlap and saved body evolution and population preferences resume with panels hidden');
  assert.deepEqual(errors,[]);await fs.writeFile(out+'/report.json',JSON.stringify({ok:true,checks,errors},null,2));console.log(JSON.stringify({ok:true,checks}));
}catch(e){await page.screenshot({path:out+'/failure.png'});await fs.writeFile(out+'/failure.json',JSON.stringify({error:String(e),checks,errors},null,2));throw e;}
finally{await browser.close();}
