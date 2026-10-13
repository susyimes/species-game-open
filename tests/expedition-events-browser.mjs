import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const out='artifacts/home-expeditions';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
async function ready(map){await page.waitForFunction(m=>window.__game?.state.mapId===m,map,{timeout:35000});}
try{
  await page.goto('http://127.0.0.1:5196');await ready('home');await page.locator('#start-button').click();
  await page.evaluate(()=>{const s=window.__game.state;Object.assign(s.player,{x:5,z:9});s.parts=['legs','fins'];s.completed=['gather','home','evolve','build','explore','colony'];s.quest=6;s.discovered=['meadow','grove'];s.colony.food=70;window.__game.ui.update(true);});
  for(const contract of ['glowflower','tidespore']){
    await page.locator('#expedition-button').click();await page.locator(`[data-depart="${contract}"]`).click();await ready('expedition');await page.locator('#dialog-close').click();
    const old=await page.evaluate(()=>{const g=window.__game;while(g.state.time<178)g.step(g.state);return g.state.agents.filter(a=>a.eventArrivalAt).map(a=>({id:a.id,x:a.x,z:a.z}));});
    await page.waitForFunction(()=>window.__game.state.time>189,null,{timeout:30000});
    const snapshot=await page.evaluate(()=>{const s=window.__game.state;return {contract:s.journey.active.contractId,event:s.journey.active.eventStarted,weather:s.weather,wetness:s.weatherV3.groundWetness,stats:window.__game.stats,migrants:s.agents.filter(a=>a.eventArrivalAt).map(a=>({id:a.id,x:a.x,z:a.z,behavior:a.behavior})),hp:s.player.hp};});
    assert.ok(snapshot.event);assert.equal(snapshot.hp,100);
    if(contract==='glowflower'){assert.equal(snapshot.weather,'squall');assert.ok(snapshot.wetness>.3);}
    else assert.ok(snapshot.migrants.some(a=>{const b=old.find(x=>x.id===a.id);return Math.hypot(a.x-b.x,a.z-b.z)>2;}));
    await page.screenshot({path:`${out}/event-${contract}.png`});results.push(snapshot);
    if(contract==='tidespore'){
      await page.locator('#explore-button').click();
      const target=await page.evaluate(async()=>{const s=window.__game.state,{terrainFor}=await import('/src/core/terrain.js'),t=terrainFor(s);for(let x=-23;x<-12;x+=1)for(let z=1;z<20;z+=1)if(t.heightAt(x,z)<-.7&&t.findPath(s.player,{x,z},true,{level:.5}))return {x,z};throw new Error('no water target');});
      const box=await page.locator('#minimap').boundingBox();await page.mouse.click(box.x+(180+target.x*2.05)/360*box.width,box.y+(119+target.z*2.05)/238*box.height);
      await page.waitForFunction(()=>window.__game.world.actors.get('player').root.userData.movementMode==='swim',null,{timeout:35000});
      assert.ok(await page.evaluate(()=>window.__game.state.parts.includes('fins')));await page.screenshot({path:`${out}/event-fin-swimming.png`});
    }
    await page.locator('#expedition-status').click();await page.locator('#expedition-emergency').click();await ready('home');await page.locator('#dialog-close').click();
  }
  assert.deepEqual(errors,[]);await fs.writeFile(`${out}/events-report.json`,JSON.stringify({ok:true,results,errors,fixture:'advance normal simulation to event warning boundary, then observe live frames; actual map click for swimming'},null,2));console.log(JSON.stringify({ok:true,results}));
}catch(error){await page.screenshot({path:`${out}/event-failure.png`}).catch(()=>{});console.error(error,errors);process.exitCode=1;}
finally{await browser.close();}
