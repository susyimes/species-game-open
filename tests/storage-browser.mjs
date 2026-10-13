import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createState } from '../legacy/src/core/state.js';

const browser=await chromium.launch({channel:'chrome',headless:true});
const base=process.env.GAME_URL||'http://127.0.0.1:5196';
const results=[];
try{
  const context=await browser.newContext();const page=await context.newPage();
  await page.addInitScript(()=>{Object.defineProperty(crypto,'subtle',{value:undefined});Object.defineProperty(crypto,'randomUUID',{value:undefined});});
  await page.goto(base);await page.waitForFunction(()=>!!window.__game);await page.locator('#start-button').click();
  const identity=await page.evaluate(async()=>{
    const module=await import('/src/core/persistence-v3.js');return {id:window.__game.state.saveId,hash:await module.digest('abc')};
  });
  assert.match(identity.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(identity.hash,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  const ownership=await page.evaluate(async()=>{
    const {WorldStore}=await import('/src/core/persistence-v3.js'),main=window.__game.store,second=await WorldStore.open();
    await window.__game.callbacks.save();let collision=false,stale=false;
    try{await second.acquire(main.saveId);}catch(error){collision=error.message==='another_tab';}
    const tx=main.db.transaction('leases','readwrite'),table=tx.objectStore('leases'),request=table.get(main.saveId);
    await new Promise((resolve,reject)=>{request.onsuccess=()=>{table.put({...request.result,expires:0});};tx.oncomplete=resolve;tx.onerror=reject;});
    const ownRenewed=await main.renew();
    const expiring=main.db.transaction('leases','readwrite'),expiredTable=expiring.objectStore('leases'),again=expiredTable.get(main.saveId);
    await new Promise((resolve,reject)=>{again.onsuccess=()=>expiredTable.put({...again.result,expires:0});expiring.oncomplete=resolve;expiring.onerror=reject;});
    await second.acquire(main.saveId);
    const staleRenewed=await main.renew();
    try{await main.save(window.__game.state);}catch(error){stale=error.message==='stale_write_lease';}
    await second.release();second.close();return {collision,stale,ownRenewed,staleRenewed};
  });
  assert.deepEqual(ownership,{collision:true,stale:true,ownRenewed:true,staleRenewed:false});results.push('HTTP crypto fallback','atomic ownership and stale-writer fencing','expired owner can renew only before actual takeover');
  await page.reload();await page.waitForFunction(()=>!!window.__game);assert.equal(await page.evaluate(()=>window.__game.state.saveId),identity.id);
  results.push('reload retains save and resumes document ownership');await context.close();

  const legacy=createState(87);legacy.started=true;legacy.time=345;legacy.weatherAt=410;legacy.colony.dna=61;const raw=JSON.stringify(legacy);
  const migrated=await browser.newContext();const mp=await migrated.newPage();
  await mp.addInitScript(raw=>{if(!localStorage.getItem('zhongxi-isle-v2'))localStorage.setItem('zhongxi-isle-v2',raw);},raw);
  await mp.goto(base);await mp.locator('[data-boot="upgrade"]').click();await mp.waitForFunction(()=>!!window.__game);
  const saved=await mp.evaluate(()=>({version:window.__game.state.version,dna:window.__game.state.colony.dna,original:localStorage.getItem('zhongxi-isle-v2'),migration:window.__game.state.migratedFromVersion}));
  assert.equal(saved.version,3);assert.equal(saved.dna,61);assert.equal(saved.migration,2);assert.equal(saved.original,raw);results.push('explicit V2 migration and untouched original');await migrated.close();
  const old=await browser.newContext();const op=await old.newPage();await op.addInitScript(raw=>localStorage.setItem('zhongxi-isle-v2',raw),raw);
  await op.goto(base);await op.locator('[data-boot="legacy"]').click();await op.waitForURL(/\/legacy\/$/,{waitUntil:'domcontentloaded'});await op.waitForFunction(()=>!!window.__game);
  assert.equal(await op.evaluate(()=>window.__game.state.version),2);results.push('playable legacy route');await old.close();
  const slow=await browser.newContext();const sp=await slow.newPage();
  await sp.route('**/models/sprig.glb',async route=>{await new Promise(r=>setTimeout(r,12000));await route.continue();});
  await sp.goto(base);await sp.waitForFunction(()=>!!window.__game,{},{timeout:30000});
  assert.equal(await sp.evaluate(()=>window.__game.callbacks.save()),true);
  assert.equal(await sp.getByText('这份旅程已由另一个页面接管，请重新加载。',{exact:true}).count(),0);
  results.push('slow first-load assets renew unchanged ownership before initial checkpoint');await slow.close();
  await fs.mkdir('artifacts/storage',{recursive:true});await fs.writeFile('artifacts/storage/browser-results.json',JSON.stringify({passed:true,results},null,2));console.log(JSON.stringify({passed:true,results}));
}finally{await browser.close();}
