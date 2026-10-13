import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='artifacts/home-expeditions';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960},reducedMotion:'reduce'}),errors=[],checks=[];
const started=Date.now();page.on('pageerror',e=>errors.push(e.message));
async function ready(map){await page.waitForFunction(m=>window.__game?.state.mapId===m,map,{timeout:35000});}
async function shot(name){await page.screenshot({path:`${out}/${name}.png`});}
try{
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5196');await ready('home');await page.locator('#start-button').click();
  // Explicit prerequisite fixture; the trip itself uses real-time simulation and visible UI actions.
  await page.evaluate(()=>{const s=window.__game.state;Object.assign(s.player,{x:5,z:9,path:[],target:null});s.parts=['legs','horns','shell'];s.metrics.evolved=3;s.completed=['gather','home','evolve','build','explore','colony'];s.quest=6;s.discovered=['meadow','grove'];s.colony.food=78;s.colony.material=40;s.buildings.push({id:'browser-nest',kind:'nest',x:5,z:2,progress:1});s.colony.capacity=10;window.__game.ui.update(true);});
  assert.equal(await page.locator('[data-style],#skill-button').count(),0);
  await page.locator('#expedition-button').click();await shot('02-departure');await page.locator('[data-depart="glowflower"]').click();await ready('expedition');
  assert.equal(await page.evaluate(()=>window.__game.state.agents.filter(a=>a.kind==='companion').length),2);await shot('03-expedition');
  for(const i of [0,1,2]){
    if(!await page.locator('[data-sample="0"]').isVisible())await page.locator('#expedition-status').click();
    await page.locator(`[data-sample="${i}"]`).click();
    for(let pass=0;pass<150;pass++){
      await page.waitForTimeout(700);
      const p=await page.evaluate(index=>{const s=window.__game.state;return {map:s.mapId,done:s.journey.active?.samples.includes(index),hp:s.player.hp,target:s.player.target,near:s.agents.some(a=>a.kind==='predator'&&!a.dominated&&!(a.pacifiedUntil>s.time)&&a.hp>0&&Math.hypot(a.x-s.player.x,a.z-s.player.z)<3),ready:(s.player.skillReadyAt||0)<=s.time&&s.player.stamina>=20};},i);
      assert.equal(p.map,'expedition','trip unexpectedly evacuated');if(p.done)break;
      if(p.near){if(p.target?.type!=='enemy')await page.keyboard.press('e');}
      else if(p.target?.type!=='enemy'&&!p.target?.id?.endsWith(`sample-${i}`)){await page.locator('#expedition-status').click();await page.locator(`[data-sample="${i}"]`).click();}
      if(pass===149)throw new Error('sample route did not complete');
    }
    console.log('sample',i+1,await page.evaluate(()=>({time:window.__game.state.time,hp:window.__game.state.player.hp,food:window.__game.state.colony.food})));
    assert.equal(await page.locator('dialog[open]').count(),0);await shot(`04-sample-${i+1}`);
    if(i<2&&await page.evaluate(()=>window.__game.state.player.hp<70)){
      await page.locator('#expedition-status').click();await page.locator('#expedition-camp').click();
      await page.waitForFunction(()=>Math.hypot(window.__game.state.player.x-5,window.__game.state.player.z-9)<3.8,null,{timeout:60000});
      await page.waitForFunction(()=>window.__game.state.player.hp>=98,null,{timeout:22000});
    }
    if(i===0){await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await ready('expedition');assert.deepEqual(await page.evaluate(()=>window.__game.state.journey.active.samples),[0]);}
  }
  await page.setViewportSize({width:390,height:844});await shot('05-mobile');
  const rects=await page.locator('.action-bar,#expedition-status').evaluateAll(elements=>elements.map(e=>{const r=e.getBoundingClientRect();return {id:e.id||e.className,x:r.x,y:r.y,w:r.width,h:r.height};}));
  assert.ok(rects.every(r=>r.x>=0&&r.x+r.w<=391&&r.y>=0&&r.y+r.h<=845),JSON.stringify(rects));
  await page.locator('#expedition-status').click();await page.locator('#expedition-camp').click();
  await page.waitForFunction(()=>Math.hypot(window.__game.state.player.x-5,window.__game.state.player.z-9)<4.8,null,{timeout:60000});
  await page.locator('#expedition-status').click();await page.locator('#expedition-return').click();await ready('home');
  assert.ok(await page.evaluate(()=>window.__game.state.journey.rewards.includes('glowflower')));assert.equal(await page.evaluate(()=>window.__game.state.agents.filter(a=>a.kind==='companion').length),5-(await page.evaluate(()=>window.__game.state.journey.history[0].casualties?.length||0)));
  assert.ok(await page.evaluate(()=>!!window.__game.world.scene.getObjectByName('Reward_glowflower')));await shot('06-return');await page.locator('#dialog-close').click();await page.evaluate(()=>window.__game.world.focusReward('glowflower'));await page.waitForTimeout(500);await shot('07-permanent-garden');
  await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await ready('home');assert.equal(await page.evaluate(()=>window.__game.state.journey.successes),1);
  checks.push('actual UI departure, three physical sample journeys, combat and healing, mid-trip reload, normal return, preserved home and visible persistent reward');
  await page.setViewportSize({width:1440,height:960});
  await page.keyboard.press('KeyH');await page.waitForFunction(()=>window.__game.state.player.hp>=95,null,{timeout:30000});
  await page.locator('#expedition-button').click();await page.locator('[data-depart="tidespore"]').click();await ready('expedition');await page.locator('#expedition-emergency').click();await ready('home');
  assert.equal(await page.evaluate(()=>window.__game.state.journey.successes),1);assert.equal(await page.evaluate(()=>window.__game.state.journey.history[0].reason),'emergency');await page.locator('#dialog-close').click();
  checks.push('different contract with migration forecast and explicit emergency return does not mint a success');
  // Valid chapter evidence fixture to isolate transition UI from the existing 30-minute chapter tests.
  await page.evaluate(async()=>{const s=window.__game.state,{emit}=await import('/src/core/events.js'),{updateWeather}=await import('/src/core/weather.js');s.time=1800;s.clock.tick=36000;updateWeather(s);const t={id:'browser-trial',arrivalId:'browser-arrival',status:'resolved',startTick:33000,endTick:35400,completedRoutes:['repelled']};s.chapter.trial=t;t.resultEventId=emit(s,'TrialCompleted',{trialId:t.id,arrivalId:t.arrivalId,routes:['repelled']},'',true).seq;s.chapter.status='won';s.chapter.victory={id:'browser-first-victory',tick:36000,evidenceId:t.resultEventId};emit(s,'ChapterWon',{victory:s.chapter.victory},'',true);window.__game.ui.open('chapter');});
  await page.locator('#millennium-start').click();await page.locator('#era-skip').waitFor({timeout:35000});await page.waitForTimeout(2300);await shot('08-millennium');await page.locator('#era-skip').click();await ready('rift');
  assert.equal(await page.evaluate(()=>window.__game.state.journey.era),1);assert.equal(await page.evaluate(()=>window.__game.state.journey.successes),1);assert.ok(await page.evaluate(()=>!!window.__game.world.scene.getObjectByName('Reward_glowflower')));assert.ok(await page.evaluate(()=>window.__game.state.agents.some(a=>a.species==='stonehorn')));
  await shot('09-second-chapter');await page.locator('#dialog-close').click();await page.waitForTimeout(500);await shot('10-rift-home');await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await ready('rift');assert.equal(await page.locator('#era-skip').count(),0);
  checks.push('saved skippable millennium transition changes terrain and species while preserving the home, reward, progress and chapter identity on reload');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({ok:true,checks,seconds:(Date.now()-started)/1000,stats:await page.evaluate(()=>window.__game.stats)}));
  await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:true,checks,errors,seconds:(Date.now()-started)/1000,fixture:'prerequisite home and chapter victory evidence; real-time trip uses visible UI'},null,2));
}catch(error){await shot('failure').catch(()=>{});const state=await page.evaluate(()=>window.__game&&{map:window.__game.state.mapId,player:window.__game.state.player,run:window.__game.state.journey.active,notices:window.__game.state.notifications,stats:window.__game.stats}).catch(()=>null);await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error.stack),errors,state},null,2));console.error(error,errors,state);process.exitCode=1;}
finally{await browser.close();}
