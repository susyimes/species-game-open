import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='artifacts/challenge',browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5196');await page.waitForFunction(()=>!!window.__game);
  await page.locator('#start-button').click();await page.mouse.move(700,450);
  await page.screenshot({path:`${out}/guide-open.png`});
  await page.waitForFunction(()=>document.body.classList.contains('hud-collapsed'),{},{timeout:22000});
  for(const selector of ['.journey-panel','.creature-panel','.minimap','#selection-panel'])assert.equal(await page.locator(selector).isVisible(),false,selector);
  assert.ok(await page.locator('#compact-vitals').isVisible());assert.ok(await page.locator('.action-bar').isVisible());
  await page.screenshot({path:`${out}/guide-collapsed.png`});checks.push('panels start collapsed while controls and vitals remain');
  await page.evaluate(()=>{window.__game.state.metrics.deposited=6;window.__game.ui.update(true);});
  await page.locator('#explore-button').click();assert.ok(await page.locator('.journey-panel').isVisible());assert.ok(await page.locator('.minimap').isVisible());
  await page.keyboard.press('Digit3');await page.waitForTimeout(16000);assert.ok(await page.locator('#game-dialog').isVisible());assert.ok(await page.locator('.journey-panel').isVisible());
  await page.locator('#dialog-close').click();checks.push('the explicit switch opens panels and menus leave its setting unchanged');

  await page.evaluate(async()=>{
    const {createState,makeAgent}=await import('/src/core/state.js'),{initGroups}=await import('/src/core/ecology.js');
    const s=window.__game.state,fixture=createState();fixture.started=true;fixture.time=120;fixture.clock.tick=2400;
    const a=makeAgent('regression-hunter','predator',22,-23,'forage','emberfang');fixture.agents=[a];Object.assign(fixture.player,{x:23.5,z:-23});
    Object.assign(s,fixture);initGroups(s);s.ecology.groups[0].intent={actionId:'rest_at_shelter',target:{x:29,z:-23},untilTick:6000,source:'model'};
    a.path=[{x:29,z:-23}];a.decision=5;window.__game.world.focusPlayer();window.__game.ui.update(true);
  });
  await page.waitForFunction(()=>window.__game.state.player.hp<100,{},{timeout:5000});
  await page.waitForTimeout(1000);await page.screenshot({path:`${out}/automatic-attack.png`});
  assert.equal(await page.evaluate(()=>window.__game.state.player.lastAttackerId),'regression-hunter');
  await page.evaluate(()=>window.__game.callbacks.creatureAction('regression-hunter','hunt'));
  await page.waitForFunction(()=>window.__game.state.agents[0].hp<64,{},{timeout:5000});
  await page.keyboard.press('KeyH');await page.waitForFunction(()=>Math.hypot(window.__game.state.player.x-5,window.__game.state.player.z-9)<5,{},{timeout:20000});
  checks.push('controlled combat fixture: a model rest intent still permits real damage, retaliation and physical retreat');

  await page.evaluate(async()=>{
    const {createState}=await import('/src/core/state.js'),s=window.__game.state,fixture=createState();fixture.started=true;
    fixture.weather='squall';fixture.weatherV3.current='squall';fixture.weatherV3.lastSquallStartTick=0;fixture.weatherV3.schedule=[{id:'squall',start:0,end:2400}];
    Object.assign(s,fixture);window.__game.world.focusHome();window.__game.ui.update(true);
  });
  await page.mouse.move(700,450);
  await page.waitForFunction(()=>window.__game.state.weatherV3.groundWetness>.98,{},{timeout:35000});
  const environment=await page.evaluate(()=>({wetness:window.__game.state.weatherV3.groundWetness,puddles:window.__game.world.scene.getObjectByName('Rain puddles').visible,patchCount:window.__game.world.scene.getObjectByName('Rain puddles').userData.patchCount,impacts:window.__game.world.scene.getObjectByName('Rain impacts').visible,stats:window.__game.stats}));
  assert.ok(environment.puddles&&environment.impacts&&environment.patchCount>15);await page.screenshot({path:`${out}/storm-environment.png`});
  await page.locator('#pause-button').click();const frozen=await page.evaluate(()=>({tick:window.__game.state.clock.tick,wet:window.__game.state.weatherV3.groundWetness}));
  await page.waitForTimeout(1500);assert.deepEqual(await page.evaluate(()=>({tick:window.__game.state.clock.tick,wet:window.__game.state.weatherV3.groundWetness})),frozen);
  await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await page.waitForFunction(()=>!!window.__game);
  assert.ok(await page.evaluate(()=>window.__game.state.weatherV3.groundWetness>.98));checks.push('controlled weather fixture: real-time soaking reveals puddles and impacts; pause freezes and reload preserves wet ground');
  await page.setViewportSize({width:390,height:844});await page.mouse.move(210,430);
  await page.waitForFunction(()=>document.body.classList.contains('hud-collapsed'),{},{timeout:22000});
  const layout=await page.locator('#compact-vitals').boundingBox();assert.ok(layout&&layout.x>=0&&layout.x+layout.width<=390);
  const boxes=await Promise.all(['#compact-vitals','#interact-button','.action-bar','.time-controls','.world-tools'].map(selector=>page.locator(selector).boundingBox()));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(!(a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),`mobile controls ${i} and ${j} overlap`);}
  assert.ok(await page.locator('.action-bar').isVisible());await page.screenshot({path:`${out}/mobile-storm.png`});
  await page.locator('#explore-button').click();assert.ok(await page.locator('.journey-panel').isVisible());checks.push('390px viewport retains vitals and restores guides through the menu');
  assert.deepEqual(errors,[]);const report={passed:true,checks,environment,errors,scope:'Browser regression fixtures, not a natural-resource full playthrough'};
  await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,checks},null,2));throw error;}
finally{await browser.close();}
