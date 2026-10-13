import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';

const requestedSeconds=Number(process.env.PLAYTEST_SECONDS||1800),out=process.env.PLAYTEST_OUTPUT||'artifacts/longplay/run';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
const errors=[],samples=[],commands=[],events=[];let lastSeq=0,lastScreenshot=-1,startedAt;
page.on('pageerror',error=>errors.push({at:new Date().toISOString(),error:error.message}));
page.on('console',m=>{if(m.type()==='error')errors.push({at:new Date().toISOString(),error:m.text()});});
try{
  await page.goto(process.env.GAME_URL||'http://127.0.0.1:5198',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__game,{},{timeout:30000});await page.locator('#start-button').click();
  if(process.env.PLAYTEST_SAVE){
    const raw=await fs.readFile(process.env.PLAYTEST_SAVE,'utf8');
    await Promise.all([page.waitForEvent('load'),page.evaluate(raw=>window.__game.callbacks.importSave(new File([raw],'continued-journey.json',{type:'application/json'})),raw)]);
    await page.waitForFunction(()=>!!window.__game,{},{timeout:30000});
  }
  const initialSim=await page.evaluate(()=>window.__game.state.time);
  startedAt=Date.now();
  await page.evaluate(()=>{window.__playtestControl={lastCommand:'',lastAt:-100,visited:0};});
  while(true){
    const result=await page.evaluate(()=>{
      const game=window.__game,s=game.state,p=s.player,b=window.__playtestControl;
      const near=Math.hypot(p.x-5,p.z-9)<4.5,bag=p.carry.food+p.carry.material;
      let command=null,outcome=null;
      const issue=(name,fn)=>{if(b.lastCommand===name&&s.time-b.lastAt<3)return;outcome=fn();command=name;b.lastCommand=name;b.lastAt=s.time;};
      const home=()=>issue('return',()=>game.callbacks.home());
      const gather=kind=>{
        if(p.target?.type==='resource'&&bag<12)return;
        if(bag>=12){home();return;}
        const r=s.resources.filter(r=>r.kind===kind&&r.amount>=2&&Math.hypot(r.x-5,r.z-9)<22).sort((a,c)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(c.x-p.x,c.z-p.z))[0];
        if(r)issue(`gather:${r.id}`,()=>game.actions.interact(s,{type:'resource',entity:r}));
      };
      const built=kind=>s.buildings.filter(x=>x.kind===kind&&x.progress===1).length;
      const build=kind=>{
        const costs={nest:[12,14],garden:[8,12],cache:[4,16]},[food,material]=costs[kind];
        if(s.colony.food<food+5){gather('food');return;}
        if(s.colony.material<material){gather('material');return;}
        if(!near){home();return;}if(!s.buildings.some(x=>x.progress<1))issue(`build:${kind}`,()=>game.actions.build(s,kind));
      };
      const population=1+s.agents.filter(a=>a.kind==='companion').length;
      const evolve=id=>{if(!near){home();return;}issue(`evolve:${id}`,()=>game.actions.evolve(s,id));};
      const explore=()=>{
        const points=[{id:'grove',x:-7,z:-17},{id:'ridge',x:22,z:-20},{id:'wetland',x:-10,z:20}];
        const point=points.find(q=>!s.discovered.includes(q.id));
        if(point){if(p.path.length&&p.target===null)return;issue(`explore:${point.id}`,()=>game.actions.moveTo(s,point));}
      };
      const research=()=>{
        if(p.target?.type==='resource')return;
        const r=s.resources.filter(r=>r.kind==='relic'&&r.amount>=1).sort((a,c)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(c.x-p.x,c.z-p.z))[0];
        if(r)issue(`research:${r.id}`,()=>game.actions.interact(s,{type:'resource',entity:r}));else home();
      };
      if(s.chapter.status==='won'){
        if(s.paused)game.ui.close();
        if(s.colony.food<50)gather('food');
      }else if(s.paused){game.ui.close();}
      else if(p.hp<60&&!near)home();
      else if(s.metrics.gathered<6)gather('food');
      else if(s.metrics.deposited<6)home();
      else if(!s.parts.includes('legs'))evolve('legs');
      else if(!built('nest'))build('nest');
      else if(s.discovered.length<3)explore();
      else if(population<10){
        if(s.colony.food<24)gather('food');else if(!s.colony.egg){if(!near)home();else issue('hatch',()=>game.actions.hatch(s));}
      }else if(built('garden')<2)build('garden');
      else if(!built('cache'))build('cache');
      else if(s.discovered.length<4)explore();
      else if(['shell','tail','reservoir'].some(id=>!s.parts.includes(id))){
        const id=['shell','tail','reservoir'].find(id=>!s.parts.includes(id)),cost={shell:24,tail:22,reservoir:26}[id];
        if(s.colony.dna>=cost)evolve(id);else research();
      }else if(s.chapter.trial&&['scheduled','active','departing'].includes(s.chapter.trial.status)){
        if(!near)home();
        else if(s.agents.filter(a=>a.kind==='companion'&&a.job==='guard').length<2)issue('assign:guard',()=>game.actions.assignJob(s,'guard',1));
        else if(!s.chapter.trial.reinforced&&s.chapter.trial.status==='scheduled')issue('reinforce',()=>game.callbacks.reinforceNest());
      }else if(!s.chapter.trial||['failed','interrupted'].includes(s.chapter.trial.status)){
        if(s.colony.food<90)gather('food');else if(s.colony.material<24)gather('material');else if(!near)home();else if(s.time>=900)issue('trial',()=>game.callbacks.startTrial());
      }else if(s.colony.food<60)gather('food');else if(!near)home();
      return {time:s.time,paused:s.paused,command,outcome,quest:s.quest,food:s.colony.food,material:s.colony.material,dna:s.colony.dna,population,parts:[...s.parts],discovered:[...s.discovered],buildings:s.buildings.map(b=>({kind:b.kind,progress:b.progress})),chapter:s.chapter,agent:game.agent,stats:game.stats,player:{x:p.x,z:p.z,hp:p.hp,target:p.target,bag},arrivals:s.ecology.arrivals.map(a=>({id:a.id,species:a.species,status:a.status})),events:s.recentEvents};
    });
    const wallSeconds=(Date.now()-startedAt)/1000;
    if(result.command)commands.push({wallSeconds,simSeconds:result.time,command:result.command,result:result.outcome});
    for(const event of result.events)if(event.seq>lastSeq){events.push(event);lastSeq=Math.max(lastSeq,event.seq);}
    const minute=Math.floor(wallSeconds/60);
    if(minute>lastScreenshot){
      lastScreenshot=minute;await page.screenshot({path:`${out}/minute-${String(minute).padStart(2,'0')}.png`});
      const {events:ignored,...summary}=result;samples.push({wallSeconds,...summary});
      await fs.writeFile(`${out}/progress.json`,JSON.stringify({startedAt:new Date(startedAt).toISOString(),wallSeconds,simSeconds:result.time,errors,samples,commands},null,2));
      console.log(JSON.stringify({minute,wallSeconds,simSeconds:result.time,quest:result.quest,population:result.population,food:Math.floor(result.food),parts:result.parts,chapter:result.chapter.status,trial:result.chapter.trial?.status,agentReady:result.agent.ready,modelFailures:result.agent.failed,fps:result.stats.fps}));
    }
    if(wallSeconds>=requestedSeconds&&result.time-initialSim>=requestedSeconds&&(!process.env.PLAYTEST_REQUIRE_WIN||result.chapter.status==='won'))break;
    if(wallSeconds>requestedSeconds+600)throw new Error('simulated_time_lag_or_pause');
    if(errors.length)throw new Error(errors.at(-1).error);
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  const final=await page.evaluate(()=>({state:window.__game.state,agent:window.__game.agent,stats:window.__game.stats}));
  const raw=JSON.stringify(final.state);await fs.writeFile(`${out}/final-state.json`,raw);await fs.writeFile(`${out}/events.jsonl`,events.map(e=>JSON.stringify(e)).join('\n')+'\n');
  const report={ok:!errors.length,requestedSeconds,wallSeconds:(Date.now()-startedAt)/1000,initialSim,simSeconds:final.state.time,won:final.state.chapter.status==='won',agent:final.agent,errors,commands:commands.length,eventCount:events.length,sha256:createHash('sha256').update(raw).digest('hex'),control:'Chrome real-time rendering; ordinary gameplay commands only; no time/resource/HP/population injection'};
  await fs.writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){await fs.writeFile(`${out}/failure.json`,JSON.stringify({error:String(error),errors,samples,commands},null,2));throw error;}
finally{await browser.close();}
