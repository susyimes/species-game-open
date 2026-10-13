import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='artifacts/direct-interactions',browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960},hasTouch:true,deviceScaleFactor:1}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function point(id,kind='resource'){
  return page.evaluate(async({id,kind})=>{
    const {heightAt}=await import('/src/core/terrain.js'),g=window.__game,a=(kind==='resource'?g.state.resources:g.state.agents).find(x=>x.id===id);
    const v=g.world.camera.position.clone().set(a.x,heightAt(a.x,a.z)+(kind==='resource'?.45:.8),a.z).project(g.world.camera),r=document.getElementById('view').getBoundingClientRect();
    return {x:r.x+(v.x*.5+.5)*r.width,y:r.y+(-v.y*.5+.5)*r.height};
  },{id,kind});
}
async function clickTarget(id,kind='resource'){const p=await point(id,kind);await page.mouse.click(p.x,p.y);}
async function holdTarget(id,kind='resource'){const p=await point(id,kind);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(650);await page.mouse.up();}
try{
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5196',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__game);
  await page.locator('#start-button').click();await page.locator('#onboarding[data-guide="gather"]').waitFor({state:'visible'});
  assert.equal(await page.locator('#selection-panel').count(),0);await page.screenshot({path:`${out}/first-step.png`});
  await holdTarget('r0');await page.locator('#creature-menu').waitFor({state:'visible'});
  assert.equal(await page.locator('#creature-menu-title').textContent(),'浆果');assert.equal(await page.evaluate(()=>window.__game.state.player.target),null);
  assert.equal(await page.evaluate(()=>window.__game.state.metrics.gathered),0);await page.screenshot({path:`${out}/resource-details.png`});
  await page.locator('#creature-menu-close').click();await clickTarget('r0');
  await page.waitForFunction(()=>window.__game.state.player.behavior==='gather'&&window.__game.state.player.work>.2&&window.__game.state.player.work<.65);
  assert.equal(await page.locator('dialog[open]').count(),0);assert.ok(await page.locator('#action-feedback-progress').isVisible());
  await page.locator('#pause-button').click();const frozen=await page.evaluate(()=>window.__game.state.player.work);
  await clickTarget('r0');assert.equal(await page.evaluate(()=>window.__game.state.player.work),frozen);
  await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.__game.state.player.work),frozen);
  await page.screenshot({path:`${out}/inline-gather-progress.png`});await page.locator('#pause-button').click();
  await page.waitForFunction(()=>window.__game.state.metrics.gathered>=6);
  await page.locator('#return-button.guide-highlight').waitFor({state:'visible'});assert.equal(await page.locator('dialog[open]').count(),0);
  assert.equal(await page.locator('#toasts .toast.resource,#toasts .toast.quest').count(),0);await page.screenshot({path:`${out}/return-guide.png`});
  await page.locator('#return-button').click();await page.waitForFunction(()=>window.__game.state.metrics.deposited>=6);
  await page.locator('.action-bar [data-panel="evolve"].guide-highlight').waitFor({state:'visible'});
  await page.screenshot({path:`${out}/evolution-ready.png`});await page.locator('.action-bar [data-panel="evolve"]').click();
  assert.ok(await page.evaluate(()=>window.__game.state.hints.guideV1.includes('evolve')));
  await page.locator('#evolve-confirm').click();await page.locator('#dialog-close').click();await page.locator('.action-bar [data-panel="colony"].guide-highlight').waitFor({state:'visible'});
  await page.locator('.action-bar [data-panel="colony"]').click();await page.locator('#dialog-close').click();
  await page.evaluate(()=>window.__game.callbacks.save());await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__game);
  assert.ok(await page.evaluate(()=>['return','evolve','build'].every(id=>window.__game.state.hints.guideV1.includes(id))));
  await page.evaluate(()=>{const s=window.__game.state;s.colony.dna=0;s.colony.food=0;window.__game.ui.update(true);s.colony.dna=30;s.colony.food=50;window.__game.ui.update(true);});
  assert.ok(await page.evaluate(()=>window.__game.state.hints.guideV1.includes('evolve')),'acknowledged tips stay acknowledged; the current objective may still highlight its next action');
  checks.push('actual resource long press only opens info; one click gathers inline, repeats and pause preserve work, return/evolution/home guides acknowledge and survive reload');

  await page.evaluate(async()=>{
    const {makeAgent}=await import('/src/core/state.js'),s=window.__game.state;
    Object.assign(s.player,{x:13,z:16,path:[],target:null,carry:{food:0,material:0},work:0});s.actionNotice=null;
    const prey=makeAgent('tap-prey','grazer',14,16,'forage','mossback');Object.assign(prey,{hp:36,trust:35,decision:60});s.agents.push(prey);
    window.__game.world.focusPlayer();window.__game.ui.update(true);
  });
  await page.waitForTimeout(1100);await holdTarget('tap-prey','enemy');await page.locator('#creature-menu').waitFor({state:'visible'});
  assert.equal(await page.locator('#creature-menu-title').textContent(),'苔背团兽');assert.equal(await page.evaluate(()=>window.__game.state.agents.find(a=>a.id==='tap-prey').hp),36);
  assert.equal(await page.evaluate(()=>window.__game.state.player.target),null);await page.locator('#creature-menu-close').click();
  await clickTarget('tap-prey','enemy');await page.waitForFunction(()=>window.__game.state.agents.find(a=>a.id==='tap-prey').hp<36);
  assert.equal(await page.locator('dialog[open]').count(),0);await page.locator('#action-feedback[data-kind="hunt"]').waitFor({state:'visible'});
  await page.screenshot({path:`${out}/single-click-hunt.png`});
  await page.waitForFunction(()=>window.__game.state.player.carry.food>=8,{},{timeout:18000});assert.equal(await page.locator('dialog[open]').count(),0);
  assert.ok(await page.evaluate(()=>window.__game.state.selected?.carcass&&window.__game.state.selected.amount===0&&window.__game.state.agents.find(a=>a.id==='tap-prey').hp===0));await page.screenshot({path:`${out}/automatic-pickup.png`});
  checks.push('one real pointer click starts predation, visible prey life decreases and food is physically collected without an automatic dialog');

  await page.setViewportSize({width:390,height:844});
  await page.evaluate(()=>{
    const s=window.__game.state;s.hints.guideV1=['gather','return'];s.parts=[];s.metrics.evolved=0;s.colony.dna=30;s.player.target=null;s.player.path=[];s.player.work=0;s.actionNotice=null;
    Object.assign(s.resources[0],{x:s.player.x+1.8,z:s.player.z+.5,amount:18});window.__game.ui.update(true);
  });
  await page.locator('#onboarding[data-guide="evolve"]').waitFor({state:'visible'});await page.waitForTimeout(300);
  const boxes=await Promise.all(['#onboarding','.time-controls','.world-tools','.interaction-row','.action-bar','.minimap'].map(s=>page.locator(s).boundingBox()));
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];assert.ok(!(a&&b&&a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),`mobile controls ${i} and ${j} overlap`);}
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/mobile-guide.png`});
  const touch=await page.context().newCDPSession(page),p=await point('r0');
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});await page.waitForTimeout(650);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.locator('#creature-menu').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>window.__game.state.player.target),null);
  await page.screenshot({path:`${out}/mobile-long-press.png`});await page.locator('#creature-menu-close').click();
  const multi=await point('r0');
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:multi.x,y:multi.y,id:1}]});
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:multi.x,y:multi.y,id:1},{x:multi.x+35,y:multi.y+35,id:2}]});
  await page.waitForTimeout(650);await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.evaluate(()=>window.__game.state.player.target),null);
  await page.locator('#guide-dismiss').click();assert.ok(await page.evaluate(()=>window.__game.state.hints.guideV1.includes('evolve')));
  checks.push('390px guide and controls do not overlap; actual touch hold opens details, two-finger cancellation cannot act, and dismiss records the hint');
  const report={passed:true,checks,errors,stats:await page.evaluate(()=>window.__game.stats),scope:'Natural first harvest/deposit; controlled prey and resource positions for direct pointer/touch regression.'};
  assert.deepEqual(errors,[]);await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});const state=await page.evaluate(()=>({player:window.__game?.state.player,hints:window.__game?.state.hints,selected:window.__game?.state.selected})).catch(()=>null);await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,checks,state},null,2));throw error;}
finally{await browser.close();}
