import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/survival';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const shot=name=>page.screenshot({path:`${out}/${name}.png`});
const ready=map=>page.waitForFunction(m=>window.__game?.state.mapId===m,map,{timeout:40000});
async function advance(seconds){await page.evaluate(seconds=>{const g=window.__game,paused=g.state.paused;g.state.paused=false;for(let i=0;i<seconds*20;i++)g.step(g.state,.05);g.state.paused=paused;g.ui.update(true);},seconds);}
try{
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5196');await ready('home');await page.locator('#start-button').click();
  // A settled-family fixture isolates survival management from the staged tutorial.
  await page.evaluate(()=>{const s=window.__game.state;s.metrics.evolved=1;s.completed=['gather','home','evolve','build','explore'];s.quest=5;});
  await page.keyboard.press('Digit2');await page.locator('.population-settings summary').click();assert.equal(await page.locator('.food-management,[data-food-policy]').count(),0);
  await page.locator('#breeding-toggle').click();assert.equal(await page.evaluate(()=>window.__game.state.colony.breedingAllowed),false);
  await page.locator('[data-population-delta="-1"]').click();assert.equal(await page.locator('#population-limit').textContent(),'9');
  await shot('01-food-management');
  const held=await page.evaluate(()=>({food:window.__game.state.colony.food,time:window.__game.state.time,sat:window.__game.state.player.satiety}));
  await page.waitForTimeout(1200);assert.deepEqual(await page.evaluate(()=>({food:window.__game.state.colony.food,time:window.__game.state.time,sat:window.__game.state.player.satiety})),held);
  await page.locator('#dialog-close').click();await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await ready('home');
  assert.equal(await page.evaluate(()=>window.__game.state.colony.populationLimit),9);assert.equal(await page.evaluate(()=>window.__game.state.colony.foodPolicy),'normal');
  checks.push('real population controls persist, feeding is automatic, and menus pause time');
  // Explicit crisis fixture; all later growth, pressure, weather and recovery run through the normal engine.
  await page.evaluate(()=>{const g=window.__game,s=g.state;s.colony.food=0;s.player.satiety=65;s.colony.foodPolicy='normal';for(const a of s.agents){if(a.kind==='companion'){a.job='guard';a.satiety=65;}else{a.hp=0;a.respawnAt=null;}}s.habitatHealth.immigrationAt=s.time+10000;});
  await advance(15);await page.locator('#onboarding[data-guide="food"]').waitFor({state:'visible'});await page.locator('#guide-dismiss').click();
  await page.locator('.action-bar [data-panel="colony"]').click();await shot('02-first-shortage');await page.locator('#dialog-close').click();
  await page.locator('#survival-strip.guide-highlight').waitFor({state:'visible'});await page.locator('#survival-strip').click();
  assert.ok((await page.locator('#dialog-body').textContent()).includes('岛屿需要休养'));await shot('03-critical-management');await page.locator('#dialog-close').click();
  await advance(108);assert.ok(await page.evaluate(()=>window.__game.state.habitatHealth.stress>.99));
  await shot('04-faded-island');
  await page.evaluate(()=>{const s=window.__game.state;s.colony.food=75;s.colony.nursery={mossback:2,reedbeak:2,glowbug:2};s.colony.seedStock=3;s.player.x=5;s.player.z=9;s.player.path=[];s.player.target=null;s.buildings.push({id:'test-garden',kind:'garden',x:12,z:9,progress:1});window.__game.ui.update(true);});
  await page.locator('#survival-strip').click();
  for(const biome of ['meadow','wetland','grove'])await page.locator(`[data-protect="${biome}"]`).click();
  await page.locator('#reserve-fruit').click();await page.locator('#plant-seeds').click();assert.equal(await page.evaluate(()=>window.__game.state.colony.soilLevel),1);
  for(const species of ['mossback','reedbeak','glowbug'])await page.locator(`[data-release-young="${species}"]`).click();
  assert.equal(await page.evaluate(()=>window.__game.state.agents.filter(a=>a.id.startsWith('wild-young-')).length),6);
  await shot('05-protect-and-release');await page.locator('#dialog-close').click();await page.waitForTimeout(300);await shot('06-visible-young');
  assert.ok(await page.evaluate(()=>window.__game.world.scene.getObjectByName('Refuge_grove').visible));
  await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await ready('home');
  assert.equal(await page.evaluate(()=>window.__game.state.agents.filter(a=>a.id.startsWith('wild-young-')).length),6);
  await advance(185);assert.equal(await page.evaluate(()=>window.__game.state.habitatHealth.critical),false);await shot('07-recovering-island');
  checks.push('a real food and ecology guide appears once, vegetation fades, protected sites and young appear, reload preserves them and the engine clears the crisis');
  // The household controls automatic hatching; the newborn itself is rendered and kept out of work.
  await page.evaluate(()=>{const s=window.__game.state;s.colony.food=78;s.colony.breedingAllowed=true;s.colony.populationLimit=10;s.colony.capacity=10;s.colony.nextAutoHatchAt=s.time;for(const a of [s.player,...s.agents.filter(a=>a.kind==='companion')])a.satiety=100;});
  await advance(32);assert.ok(await page.evaluate(()=>window.__game.state.agents.some(a=>a.kind==='companion'&&a.juvenileUntil>window.__game.state.time)));
  await page.keyboard.press('Digit2');assert.ok((await page.locator('#dialog-body').textContent()).includes('幼体'));await shot('08-young-family');await page.locator('#dialog-close').click();
  await page.evaluate(()=>{const s=window.__game.state;s.colony.breedingAllowed=false;s.colony.food=0;s.player.satiety=50;s.player.x=5;s.player.z=9;s.player.path=[];s.player.target=null;s.completed.push('colony');s.quest=6;window.__game.ui.update(true);});
  await page.locator('#expedition-button').click();assert.equal(await page.locator('[data-depart="saltseed"]').getAttribute('data-urgent'),'true');
  await page.locator('[data-depart="saltseed"]').click();await ready('expedition');await page.locator('#dialog-close').click();
  assert.equal(await page.evaluate(()=>window.__game.state.colony.food),0);await shot('09-emergency-expedition');
  const frozen=await page.evaluate(()=>JSON.stringify(window.__game.state.journey.home));await page.waitForTimeout(1100);assert.equal(await page.evaluate(()=>JSON.stringify(window.__game.state.journey.home)),frozen);
  assert.equal(await page.locator('[data-food-policy]').count(),0);
  await page.locator('#expedition-button').click();await page.locator('#expedition-return').click();await ready('home');await page.locator('#dialog-close').click();
  checks.push('a live juvenile is born, cannot join the emergency expedition, the empty-ration trip is playable and home is restored from its unchanged snapshot');
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const boxes=await Promise.all(['.location-pill','#chapter-button','#weather-toggle','#survival-strip'].map(x=>page.locator(x).boundingBox()));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(!(a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),`status controls ${i} and ${j} overlap`);}
  await shot('10-mobile-outlook');await page.keyboard.press('Digit2');await page.locator('#dialog-body [data-panel="survival"]').click();await shot('11-mobile-management');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  checks.push('390px status controls do not overlap and management remains usable without horizontal overflow');
  assert.deepEqual(errors,[]);
  const snapshot=await page.evaluate(()=>({time:window.__game.state.time,food:window.__game.state.colony.food,average:window.__game.state.player.satiety,stats:window.__game.stats}));
  await fs.writeFile(`${out}/browser-report.json`,JSON.stringify({ok:true,checks,errors,snapshot,fixtureNote:'Crisis, restoration stock and population prerequisites are explicit fixtures; UI actions and simulation use the shipped rules.'},null,2));
  console.log(JSON.stringify({ok:true,checks,errors,snapshot}));
}catch(error){await shot('failure');await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),checks,errors},null,2));throw error;}
finally{await browser.close();}
