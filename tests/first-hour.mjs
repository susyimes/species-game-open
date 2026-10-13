import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
const out=process.env.PLAYTEST_OUTPUT||'artifacts/first-hour';
const duration=Number(process.env.PLAYTEST_SECONDS||3600);
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
const errors=[],samples=[],commands=[],events=[];
let activeSeconds=0,lastSim=null,lastWorld=null,lastWall=Date.now(),lastMinute=-1,lastCommand='',lastIssued=0,lastEvent=0;
let startedAt,mode='guided',blocked={},lastDiagnostic=0,pausedSince=null,stopped=false;
page.on('pageerror',e=>{const error={at:new Date().toISOString(),error:String(e)};errors.push(error);console.log('PAGE_ERROR '+JSON.stringify(error));});
async function snap(){return page.evaluate(()=>{const g=window.__game,s=g.state;return {time:s.time,paused:s.paused,hidden:document.hidden,started:s.started,world:s.journey.active?.id||s.mapId,stats:g.stats,player:s.player,colony:s.colony,parts:s.parts,style:s.style,metrics:s.metrics,quest:s.quest,completed:s.completed,discovered:s.discovered,buildings:s.buildings,agents:s.agents,resources:s.resources,chapter:s.chapter,journey:s.journey,habitat:s.habitatHealth,survival:s.survival,events:s.recentEvents,panel:g.ui.panel,guide:document.getElementById('onboarding')?.dataset.guide,notifications:s.notifications.slice(-4)};});}
async function menu(which){await page.keyboard.press(which==='colony'?'Digit2':which==='evolve'?'Digit3':which==='journey'?'Digit6':'Digit5');}
async function close(){if(await page.locator('#game-dialog[open]').count())await page.locator('#dialog-close').click();if(await page.locator('#creature-menu[open]').count())await page.locator('#creature-menu-close').click();}
async function ordinary(name,args=[]){return page.evaluate(({name,args})=>window.__game.callbacks[name](...args),{name,args});}
async function execute(c,s){
  if(!c)return;
  const tag=JSON.stringify(c);if(tag===lastCommand&&Date.now()-lastIssued<4500)return;
  lastCommand=tag;lastIssued=Date.now();let result=null;
  if(c.type==='resource')result=await ordinary('targetAction',[{type:'resource',id:c.id},'harvest']);
  else if(c.type==='move')result=await ordinary('mapMove',[c.point]);
  else if(c.type==='home')await page.keyboard.press('KeyH');
  else if(c.type==='build'){
    await menu('colony');await page.screenshot({path:`${out}/menu-build-${Math.floor(activeSeconds)}.png`});
    const button=page.locator(`[data-build="${c.id}"]`);if(await button.isEnabled())await button.click();else blocked[c.id]=activeSeconds+15;await close();
  }else if(c.type==='evolve'){
    await menu('evolve');const parent={reservoir:'tail',gills:'fins',sprinter:'legs'}[c.id]||c.id;
    await page.locator(`[data-evo-category="${parent}"]`).click();await page.locator(`[data-evolution="${c.id}"]`).click();
    await page.screenshot({path:`${out}/menu-evolve-${c.id}.png`});
    if(await page.locator('#evolve-confirm').isEnabled())await page.locator('#evolve-confirm').click();else blocked[c.id]=activeSeconds+30;
    await close();
  }else if(c.type==='hatch'){
    await menu('colony');if(await page.locator('#hatch-button').isEnabled())await page.locator('#hatch-button').click();await close();
  }else if(c.type==='depart'){
    await menu('journey');await page.screenshot({path:`${out}/depart-${s.journey.serial+1}.png`});
    const b=page.locator(`[data-depart="${c.id}"]`).first();if(await b.isEnabled())await b.click();else blocked.depart=activeSeconds+30;
  }else if(c.type==='sample'){
    await menu('journey');await page.locator(`[data-sample="${c.index}"]`).click();
  }else if(c.type==='return'){
    await menu('journey');const b=page.locator('#expedition-return');if(await b.isEnabled())await b.click();else await close();
  }else if(c.type==='trial'){
    await menu('chapter');const b=page.locator('#trial-start');if(await b.count()&&await b.isEnabled())await b.click();else blocked.trial=activeSeconds+30;await close();
  }else if(c.type==='reinforce'){
    await menu('chapter');if(await page.locator('#reinforce-nest').isEnabled())await page.locator('#reinforce-nest').click();await close();
  }else if(c.type==='guard')result=await page.evaluate(()=>window.__game.actions.assignJob(window.__game.state,'guard',1));
  else if(c.type==='millennium'){await menu('chapter');if(await page.locator('#millennium-start').count())await page.locator('#millennium-start').click();}
  commands.push({at:activeSeconds,world:s.world,sim:s.time,...c,result});
}
function choose(s){
  const p=s.player,near=Math.hypot(p.x-5,p.z-9)<4.5,bag=p.carry.food+p.carry.material;
  const members=s.agents.filter(a=>a.kind==='companion'&&a.hp>0),built=id=>s.buildings.filter(b=>b.kind===id&&b.progress===1).length;
  const resources=kind=>s.resources.filter(r=>r.kind===kind&&r.amount>=2&&!r.coast&&r.sampleIndex===undefined&&(!r.carcass||r.amount>=2));
  const gather=kind=>{
    if(bag>=12)return {type:'home'};
    if(p.target?.type==='resource'&&p.path.length||p.behavior==='gather')return null;
    const r=resources(kind).filter(r=>s.parts.includes('fins')||Math.hypot(r.x-5,r.z-9)<24).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
    return r?{type:'resource',id:r.id}:null;
  };
  const build=id=>{
    if(blocked[id]>activeSeconds||s.buildings.some(b=>b.progress<1))return null;
    const [food,material]=({nest:[12,14],garden:[8,12],cache:[4,16]})[id];
    if(s.colony.food<food+8)return gather('food');if(s.colony.material<material)return gather('material');return near?{type:'build',id}:{type:'home'};
  };
  const research=()=>{if(p.target?.type==='resource'||p.path.length)return null;const r=s.resources.filter(r=>r.kind==='relic'&&r.amount>0).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];return r?{type:'resource',id:r.id}:gather('food');};
  if(mode==='hold')return null;
  if(p.hp<65&&!near)return {type:'home'};
  if(near&&p.hp<96&&(!s.journey.active||s.colony.food>0||p.satiety>=50))return null;
  if(s.journey.active){
    if(s.journey.active.samples.length===3||p.hp<65||s.time>650)return near?{type:'return'}:{type:'home'};
    if(s.colony.food<3&&bag<8)return gather('food');if(bag>=8&&s.colony.food<4)return {type:'home'};
    if(!p.target&&!p.path.length){const r=s.resources.find(r=>r.sampleIndex!==undefined&&r.amount>0);return r?{type:'sample',index:r.sampleIndex}:null;}
    return null;
  }
  if(s.metrics.gathered<6)return gather('food');if(s.metrics.deposited<6)return {type:'home'};
  if(!s.parts.includes('legs'))return {type:'evolve',id:'legs'};
  if(built('garden')<2)return build('garden');
  if(!built('nest'))return build('nest');
  if(s.colony.food<22)return gather('food');
  if(!built('cache'))return build('cache');
  if(bag)return {type:'home'};
  for(const [id,cost] of [['fins',26],['shell',24],['tail',22],['reservoir',26]])if(!s.parts.includes(id)&&!(blocked[id]>activeSeconds))return s.colony.dna>=cost?{type:'evolve',id}:research();
  if(members.length<7&&!s.colony.egg&&s.colony.food>=52)return near?{type:'hatch'}:{type:'home'};
  if(members.length<9&&s.time>650&&s.colony.food>=60&&!s.colony.egg)return near?{type:'hatch'}:{type:'home'};
  if(s.discovered.length<4){const points=[{id:'grove',x:-7,z:-17},{id:'ridge',x:22,z:-20},{id:'wetland',x:-20,z:12}];const pnt=points.find(b=>!s.discovered.includes(b.id));if(pnt&&!p.path.length)return {type:'move',point:pnt};return null;}
  if(s.chapter.status==='won'&&!s.journey.era)return {type:'millennium'};
  const trial=s.chapter.trial;
  if(trial&&['scheduled','active','departing'].includes(trial.status)){
    if(!near)return {type:'home'};
    if(members.filter(a=>a.job==='guard').length<2)return {type:'guard'};
    if(!trial.reinforced&&trial.status==='scheduled')return {type:'reinforce'};
    return s.colony.food<35?gather('food'):null;
  }
  if(activeSeconds>650&&s.journey.successes<3&&!(blocked.depart>activeSeconds))return near?{type:'depart',id:['glowflower','tidespore','saltseed'][s.journey.successes%3]}:{type:'home'};
  if(s.time>=900&&!trial&&!(blocked.trial>activeSeconds)){if(s.colony.food<65)return gather('food');if(s.colony.material<20)return gather('material');return near?{type:'trial'}:{type:'home'};}
  if(s.colony.food<60)return gather('food');if(s.colony.material<45)return gather('material');
  return p.path.length?null:research();
}
try{
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5196',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__game);await page.screenshot({path:out+'/welcome-before.png'});await page.locator('#start-button').click();
  startedAt=new Date().toISOString();lastWall=Date.now();
  while(activeSeconds<duration){
    try{
      await page.waitForFunction(()=>!!window.__game,{},{timeout:30000});let s=await snap();const now=Date.now();
      if(lastWorld===s.world&&lastSim!==null&&s.time>=lastSim)activeSeconds+=Math.max(0,Math.min((now-lastWall)/1000,s.time-lastSim));
      lastWall=now;lastWorld=s.world;lastSim=s.time;
      if(now-lastDiagnostic>5000){lastDiagnostic=now;await fs.writeFile(out+'/live.json',JSON.stringify({activeSeconds,wallSeconds:(now-Date.parse(startedAt))/1000,lastCommand,...s}));}
      try{const steering=JSON.parse(await fs.readFile(out+'/steering.json','utf8'));if(steering.stop){stopped=true;break;}mode=steering.mode||'guided';}catch{}
      for(const event of s.events)if(event.seq>lastEvent){events.push({...event,activeSeconds,world:s.world});lastEvent=event.seq;}
      const minute=Math.floor(activeSeconds/60);
      if(minute!==lastMinute){
        lastMinute=minute;await page.screenshot({path:`${out}/minute-${String(minute).padStart(2,'0')}.png`});
        const summary={minute,activeSeconds,time:s.time,world:s.world,quest:s.quest,food:s.colony.food,population:1+s.agents.filter(a=>a.kind==='companion').length,satiety:s.player.satiety,hp:s.player.hp,parts:s.parts,buildings:s.buildings.map(b=>[b.kind,b.progress]),stats:s.stats,critical:s.habitat.critical,successes:s.journey.successes,chapter:s.chapter.status,trial:s.chapter.trial?.status};
        samples.push(summary);console.log(JSON.stringify(summary));
        await fs.writeFile(out+'/progress.json',JSON.stringify({startedAt,activeSeconds,wallSeconds:(Date.now()-Date.parse(startedAt))/1000,mode,errors,samples,commands},null,2));
        await fs.writeFile(out+'/current-state.json',JSON.stringify(s));await fs.writeFile(out+'/events.json',JSON.stringify(events));
      }
      if(s.panel&&s.panel!=='welcome'){await close();s=await snap();}
      if(s.paused&&!s.panel&&!s.journey.transition){
        pausedSince??=Date.now();
        if(Date.now()-pausedSince>10000){console.log('PAUSE_DIAGNOSTIC '+JSON.stringify({time:s.time,hidden:s.hidden,notifications:s.notifications}));await page.screenshot({path:out+'/unexpected-pause.png'});await page.reload({waitUntil:'domcontentloaded'});pausedSince=null;}
      }else pausedSince=null;
      if(!s.paused)await execute(choose(s),s);
    }catch(error){
      errors.push({at:new Date().toISOString(),error:String(error),recoverable:true});console.log('CONTROL_RETRY '+String(error));
      await page.screenshot({path:out+'/control-issue.png'}).catch(()=>{});await close().catch(()=>{});
    }
    await new Promise(r=>setTimeout(r,1000));
  }
  await page.keyboard.press('Space');const final=await snap();await fs.writeFile(out+'/final-state.json',JSON.stringify(final,null,2));
  const report={completed:!stopped&&activeSeconds>=duration,startedAt,endedAt:new Date().toISOString(),activeSeconds,wallSeconds:(Date.now()-Date.parse(startedAt))/1000,requestedSeconds:duration,speed:1,commands:commands.length,errors,samples,scope:'Fresh save, real Chrome rendering at 1x. Menus use actual controls; world resource and navigation use the same ordinary callbacks as pointer actions. No time, inventory, health, population or map injection. Pauses and reload gaps excluded.'};
  await fs.writeFile(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
