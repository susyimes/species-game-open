import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out='artifacts/coastal-evolution',browser=await chromium.launch({channel:'chrome',headless:true});
await fs.mkdir(out,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5196',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__game);
  await page.locator('#start-button').click();
  // A funded, wounded player outside the nest isolates the reported restrictions; UI performs every purchase.
  await page.evaluate(()=>{const s=window.__game.state;s.colony.dna=90;s.player.hp=43;s.player.stamina=35;window.__game.ui.update(true);});
  await page.locator('.action-bar [data-panel="evolve"]').click();
  await page.locator('[data-evo-category="fins"]').click();
  assert.ok(await page.locator('#evolve-confirm').isEnabled());
  const before=await page.evaluate(()=>({hp:window.__game.state.player.hp,stamina:window.__game.state.player.stamina,dna:window.__game.state.colony.dna}));
  for(const colour of ['sand','tide','fern','berry']){
    await page.locator(`[data-appearance="${colour}"]`).click();
    assert.equal(await page.locator(`[data-appearance="${colour}"]`).getAttribute('aria-pressed'),'true');
    await page.waitForFunction(async id=>{
      const {APPEARANCES}=await import('/src/core/config.js'),game=window.__game,expected=APPEARANCES.find(x=>x.id===id).color.slice(1);
      const ids=['player',game.state.agents.find(a=>a.kind==='companion').id];
      return ids.every(id=>{let seen=0,match=true;game.world.actors.get(id).model.traverse(o=>{if(o.isMesh&&o.material.name.startsWith('Skin')){seen++;match&&=o.material.color.getHexString()===expected;}});return seen>0&&match;});
    },colour);
  }
  await page.locator('#evolve-confirm').click();
  assert.deepEqual(await page.evaluate(()=>({parts:window.__game.state.parts,hp:window.__game.state.player.hp,stamina:window.__game.state.player.stamina,dna:window.__game.state.colony.dna})),{parts:['fins'],hp:before.hp,stamina:before.stamina,dna:before.dna-26});
  await page.screenshot({path:`${out}/field-evolution.png`});
  await page.locator('#dialog-close').click();checks.push('outside-home UI purchase, all palette choices recolour player and companion materials; no free healing');

  const map=await page.locator('#minimap').boundingBox();
  await page.locator('#minimap').click({position:{x:map.width*.5,y:map.height*(119+54*2.05)/238}});
  const seaGoal=await page.evaluate(()=>window.__game.state.player.path.at(-1));
  assert.ok(seaGoal&&Math.hypot(seaGoal.x,seaGoal.z-54)<1.5,JSON.stringify(seaGoal));
  await page.mouse.move(700,450);
  await page.waitForFunction(target=>Math.hypot(window.__game.state.player.x-target.x,window.__game.state.player.z-target.z)<.5,seaGoal,{timeout:30000});
  await page.waitForFunction(()=>window.__game.world.actors.get('player').root.userData.movementMode==='swim');
  const sea=await page.evaluate(async()=>{
    const {seaLevel}=await import('/src/core/weather.js'),g=window.__game,target={x:g.state.player.x-3,z:g.state.player.z-4};
    const v=g.world.camera.position.clone().set(target.x,seaLevel(g.state),target.z).project(g.world.camera),r=document.getElementById('view').getBoundingClientRect();
    return {target,x:r.x+(v.x*.5+.5)*r.width,y:r.y+(-v.y*.5+.5)*r.height};
  });
  assert.ok(sea.x>280&&sea.x<1160&&sea.y>100&&sea.y<780,JSON.stringify(sea));
  await page.mouse.click(sea.x,sea.y);
  await page.waitForFunction(target=>{const p=window.__game.state.player.path.at(-1);return p&&Math.hypot(p.x-target.x,p.z-target.z)<.2;},sea.target);
  await page.waitForFunction(target=>Math.hypot(window.__game.state.player.x-target.x,window.__game.state.player.z-target.z)<.6,sea.target);
  await page.locator('#pause-button').click();await page.screenshot({path:`${out}/near-sea-swimming.png`});
  await page.evaluate(()=>window.__game.callbacks.save());
  await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__game);
  assert.equal(await page.evaluate(()=>window.__game.state.appearance),'berry');
  assert.deepEqual(await page.evaluate(()=>window.__game.state.parts),['fins']);
  await page.waitForFunction(()=>window.__game.world.actors.get('player').root.userData.movementMode==='swim');
  await page.locator('#return-button').click();
  await page.waitForFunction(()=>Math.hypot(window.__game.state.player.x-5,window.__game.state.player.z-9)<.6,{},{timeout:30000});
  checks.push('real minimap trip past the coast, visible sea surface click, swimming pose, at-sea reload and physical return');

  await page.evaluate(()=>{const s=window.__game.state;s.colony.food=80;s.colony.material=80;window.__game.world.focusHome();window.__game.ui.update(true);});
  await page.locator('#pause-button').click();await page.screenshot({path:`${out}/home-stage-1.png`});
  assert.equal(await page.evaluate(()=>window.__game.world.scene.getObjectByName('Habitat:b0').userData.stage),1);
  await page.locator('#pause-button').click();
  // Construction still requires real workers and elapsed gameplay, including automatic main-nest growth.
  for(const [i,kind] of ['nest','garden','garden','cache'].entries()){
    await page.locator('.action-bar [data-panel="colony"]').click();
    if(i===0){await page.screenshot({path:`${out}/growth-menu.png`});}
    await page.locator(`[data-build="${kind}"]`).click();
    await page.waitForFunction(count=>window.__game.state.buildings.filter(b=>b.kind!=='home'&&b.progress===1).length>=count,i+1,{timeout:50000});
    if(i===0){
      await page.waitForFunction(()=>window.__game.world.scene.getObjectByName('Habitat:b0').userData.stage===2);
      await page.locator('#pause-button').click();await page.screenshot({path:`${out}/home-stage-2.png`});await page.locator('#pause-button').click();
    }
  }
  await page.waitForFunction(()=>window.__game.world.scene.getObjectByName('Habitat:b0').userData.stage===3);
  await page.locator('#pause-button').click();
  const growth=await page.evaluate(()=>({home:window.__game.world.scene.getObjectByName('Habitat:b0').userData,buildings:window.__game.state.buildings.map(b=>({kind:b.kind,progress:b.progress})),stats:window.__game.stats}));
  await page.screenshot({path:`${out}/home-stage-3.png`});
  await page.locator('.action-bar [data-panel="colony"]').click();assert.equal(await page.locator('#habitat-name').textContent(),'繁盛巢群');
  await page.screenshot({path:`${out}/grown-home-menu.png`});await page.locator('#dialog-close').click();
  checks.push('four UI construction orders finish through actual workers and grow the home through three silhouettes');

  await page.setViewportSize({width:390,height:844});
  await page.locator('.action-bar [data-panel="evolve"]').click();
  await page.locator('[data-appearance="tide"]').click();
  assert.equal(await page.locator('[data-appearance="tide"]').getAttribute('aria-pressed'),'true');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const box=await page.locator('.appearance-picker').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=390);
  await page.screenshot({path:`${out}/mobile-evolution.png`});await page.locator('#dialog-close').click();
  await page.locator('.action-bar [data-panel="colony"]').click();await page.screenshot({path:`${out}/mobile-home.png`});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  checks.push('390px evolution colours and home-growth menu fit and remain interactive');
  assert.deepEqual(errors,[]);
  const report={passed:true,checks,errors,growth,scope:'Controlled funded fixture; purchases, palette buttons, sea movement and all four construction orders executed through UI.'};
  await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await page.screenshot({path:`${out}/failure.png`}).catch(()=>{});const state=await page.evaluate(()=>({player:window.__game?.state.player,paused:window.__game?.state.paused})).catch(()=>null);await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,checks,state},null,2));throw error;}
finally{await browser.close();}
