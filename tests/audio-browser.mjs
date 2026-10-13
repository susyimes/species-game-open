import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const out=process.env.AUDIO_TEST_OUTPUT||'artifacts/audio/browser';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],requests=[],checks=[];
page.on('pageerror',e=>errors.push(String(e)));page.on('request',r=>{if(/\/audio\/[^/]+\.(ogg|mp3)$/.test(r.url()))requests.push(r.url());});
await page.addInitScript(()=>{
  const Native=window.AudioContext;
  window.AudioContext=class extends Native{
    constructor(...args){super(...args);window.__testAudioContext=this;}
    createDynamicsCompressor(){const node=super.createDynamicsCompressor(),analyser=super.createAnalyser();analyser.fftSize=256;node.connect(analyser);window.__testAudioMeter=analyser;return node;}
  };
});
try{
  await page.route('**/audio/deposit.ogg',route=>route.fulfill({status:503,body:'Expected codec/source fallback test'}));
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5196');await page.locator('#start-button').waitFor({timeout:60000});
  assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>!!window.__testAudioContext),false);
  await page.locator('#start-button').click();
  await page.waitForFunction(()=>{const meter=window.__testAudioMeter;if(!meter)return false;const samples=new Float32Array(meter.fftSize);meter.getFloatTimeDomainData(samples);return samples.some(n=>Math.abs(n)>.0002);},null,{timeout:30000});
  assert.ok(requests.some(url=>url.endsWith('/deposit.mp3')));assert.equal(await page.evaluate(()=>window.__testAudioContext.state),'running');
  checks.push('No request/context before a real gesture; generated music produces a measurable native Web Audio signal; MP3 fallback decodes.');
  await page.locator('#selection-action').click();await page.waitForFunction(()=>document.getElementById('quest-index').textContent.startsWith('02'));
  const diagnostic=await page.evaluate(()=>window.__game?.audio.inspect());if(diagnostic)assert.ok(diagnostic.played>0,'real gathering should sound');
  await page.locator('#return-button').click();await page.waitForFunction(()=>document.getElementById('quest-index').textContent.startsWith('03'));
  await page.locator('.action-bar [data-panel="evolve"]').click();await page.locator('#evolve-confirm').click();await page.locator('#dialog-close').click();
  await page.keyboard.press('Space');await page.waitForFunction(()=>window.__testAudioContext.state==='suspended');await page.keyboard.press('Space');await page.waitForFunction(()=>window.__testAudioContext.state==='running');
  await page.locator('#audio-toggle').click();await page.waitForFunction(()=>window.__testAudioContext.state==='suspended');assert.equal(await page.locator('#audio-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('[data-panel="help"]').click();await page.locator('[data-audio-volume="music"]').fill('25');await page.locator('[data-audio-volume="effects"]').fill('50');
  assert.equal(await page.locator('#volume-music').textContent(),'25%');await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:out+'/mobile-audio.png'});await page.locator('#dialog-close').click();
  await page.reload();await page.locator('#loading').waitFor({state:'hidden',timeout:60000});assert.equal(await page.evaluate(()=>!!window.__testAudioContext),false);assert.equal(await page.locator('#audio-toggle').getAttribute('aria-pressed'),'false');
  await page.locator('#audio-toggle').click();await page.waitForFunction(()=>window.__testAudioContext?.state==='running');
  const prefs=await page.evaluate(()=>JSON.parse(localStorage.getItem('zhongxi-audio-v1')));assert.equal(prefs.music,.25);assert.equal(prefs.effects,.5);
  checks.push('Actual gathering, return and evolution work; pause/mute suspend audio; volumes and mute survive reload; 390px controls fit.');
  if(diagnostic){
    await page.evaluate(async()=>{const s=window.__game.state,{updateWeather}=await import('/src/core/weather.js');s.time=180;s.clock.tick=3600;updateWeather(s);window.__game.audio.update();});
    await page.waitForFunction(()=>window.__game.audio.inspect().loops.some(l=>l.id==='island-night'));
    // Prerequisite fixture; departure and music initialization then use real controls and a full map reload.
    await page.evaluate(()=>{const s=window.__game.state;s.completed=['gather','home','evolve','build','explore','colony'];s.quest=6;s.colony.food=70;s.player.x=5;s.player.z=9;s.player.target=null;s.player.path=[];window.__game.ui.update(true);});
    await page.locator('#expedition-button').click();await page.locator('[data-depart="glowflower"]').click();await page.waitForFunction(()=>window.__game?.state.mapId==='expedition',null,{timeout:45000});await page.locator('#dialog-close').click();
    await page.waitForFunction(()=>window.__game.audio.inspect().loops.some(l=>l.id==='island-expedition'));
    await page.evaluate(()=>{const s=window.__game.state;s.weather=s.weatherV3.current='rain';s.weatherV3.schedule=[{id:'rain',start:s.clock.tick,end:s.clock.tick+7200}];s.weatherV3.publishedUntilTick=s.clock.tick+7200;window.__game.audio.update();});
    await page.waitForFunction(()=>window.__game.audio.inspect().loops.some(l=>l.id==='rain'));
    // Exercise the same visibility handler used when leaving the tab, without stealing user focus.
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
    await page.waitForFunction(()=>window.__testAudioContext.state==='suspended');
    checks.push('Clock fixture selects night; actual departure selects expedition music; rain adds its loop; background handler suspends the context.');
  }
  await page.screenshot({path:out+'/playing.png'});assert.deepEqual(errors,[]);
  const report={ok:true,checks,errors,requested:[...new Set(requests)],diagnostic:await page.evaluate(()=>window.__game?.audio.inspect()||null)};
  await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,checks}));
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});const diagnostic=await page.evaluate(()=>window.__game?.audio.inspect()).catch(()=>null);await fs.writeFile(out+'/failure.json',JSON.stringify({error:String(error.stack),errors,checks,diagnostic,requests},null,2));throw error;}
finally{await browser.close();}
