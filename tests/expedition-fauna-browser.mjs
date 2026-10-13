import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='artifacts/expedition-fauna';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],requested=[],portraits=[];
const ids=['fernback','moonray','mireclaw','spinedillo'];
page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('.glb'))requested.push(r.url().split('/').pop());});
try{
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5196');await page.waitForFunction(()=>!!window.__game);await page.locator('#start-button').click();
  assert.ok(ids.every(id=>!requested.includes(id+'.glb')),'home should not download expedition extras');
  // Prerequisite fixture only; asset and menu operations use the actual game world.
  await page.evaluate(()=>{const s=window.__game.state;Object.assign(s.player,{x:5,z:9,path:[],target:null});s.parts=['legs','shell','horns'];s.completed=['gather','home','evolve','build','explore','colony'];s.metrics.evolved=3;s.quest=6;s.discovered=['meadow','grove'];s.colony.food=70;s.colony.capacity=10;s.buildings.push({id:'fauna-nest',kind:'nest',x:5,z:2,progress:1});window.__game.ui.update(true);});
  await page.locator('#expedition-button').click();await page.locator('[data-depart="glowflower"]').click();await page.waitForFunction(()=>window.__game?.state.mapId==='expedition');
  assert.ok(ids.every(id=>requested.includes(id+'.glb')));await page.keyboard.press('Space');
  for(const id of ids){
    const info=await page.evaluate(id=>{
      const g=window.__game,a=g.state.agents.find(a=>a.species===id),actor=g.world.actors.get(a.id);let box=null;
      actor.root.updateMatrixWorld(true);actor.root.traverse(o=>{if(!o.isMesh)return;o.geometry.computeBoundingBox();const b=o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);if(box)box.union(b);else box=b;});
      const size=box.getSize(actor.root.position.clone());g.world.focusPoint(a);g.world.zoom(.62);
      return {id,entityId:a.id,position:{x:a.x,z:a.z},kind:a.kind,hp:a.hp,bounds:[size.x,size.y,size.z],nodes:actor.model.children.length,mode:actor.root.userData.movementMode};
    },id);
    assert.ok(info.bounds.every(n=>Number.isFinite(n)&&n>.1&&n<8),JSON.stringify(info));
    await page.waitForTimeout(550);await page.screenshot({path:`${out}/${id}.png`});portraits.push(info);
  }
  const animation=await page.evaluate(()=>{
      const g=window.__game,read=(id,name)=>{const a=g.state.agents.find(a=>a.species===id),actor=g.world.actors.get(a.id);let node;actor.model.traverse(n=>{if(n.name===name||n.name.endsWith('_'+name))node=n;});return {a,actor,node};};
    const wing=read('moonray','Wing_L'),claw=read('mireclaw','Claw_L');
    wing.actor.update({...wing.a,behavior:'roam'},1,.016,[],'fern',g.state);const w1=wing.node.rotation.z;wing.actor.update({...wing.a,behavior:'roam'},1.4,.016,[],'fern',g.state);
    claw.actor.update({...claw.a,behavior:'idle'},1,.016,[],'fern',g.state);const c1=claw.node.rotation.y;claw.actor.update({...claw.a,behavior:'attack'},1.4,.016,[],'fern',g.state);
    return {wing:[w1,wing.node.rotation.z],claw:[c1,claw.node.rotation.y]};
  });
  assert.ok(Math.abs(animation.wing[0]-animation.wing[1])>.03);assert.ok(Math.abs(animation.claw[0]-animation.claw[1])>.03);
  await page.evaluate(()=>{window.__game.state.discovered=['meadow','grove','wetland','ridge'];window.__game.ui.open('journal');});
  const journal=await page.locator('#game-dialog').innerText();for(const name of ['苇冠食草兽','雾帆浮鳐','潮钳滩蟹','砂脊卷甲兽'])assert.ok(journal.includes(name));
  await page.locator('#dialog-close').click();await page.evaluate(()=>window.__game.callbacks.save());await page.reload();await page.waitForFunction(()=>window.__game?.state.mapId==='expedition');
  assert.ok(await page.evaluate(ids=>ids.every(id=>window.__game.state.agents.some(a=>a.species===id)),ids));
  assert.deepEqual(errors,[]);await fs.writeFile(`${out}/report.json`,JSON.stringify({ok:true,fixture:'Prerequisite home and journal biome discovery; real departure, rendered actors, animation and persisted expedition reload.',portraits,animation,requested,errors},null,2));
  console.log('EXPEDITION_FAUNA_BROWSER_PASS');
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});console.error(error,errors);process.exitCode=1;}
finally{await browser.close();}
