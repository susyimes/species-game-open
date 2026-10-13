import { createState, makeAgent, population } from './state.js';
import { NEST, SPECIES, speciesStats } from './config.js';
import { terrainFor } from './terrain.js';
import { SAMPLE_POINTS } from './maps.js';
import { dist } from './math.js';
import { emit } from './events.js';
import { CONTRACTS, newJourney, activeExpedition } from './journey-config.js';
import { initFood, initHabitat, isJuvenile } from './survival-config.js';
import { foodOutlook } from './food.js';

const fail=reason=>({ok:false,reason});
const clone=value=>JSON.parse(JSON.stringify(value,(key,v)=>key==='nav'?undefined:v));
export function worldSnapshot(s){
  const copy=clone({...s,lifetimeAwaySeconds:s.journey?.totalAwayTime??s.lifetimeAwaySeconds??0,journey:undefined,selected:null,actionNotice:null,notifications:[],paused:false});
  copy.ecology={...copy.ecology,runEpoch:'',modelEnabled:false,pending:[],outbox:[],inbox:[],receipts:[]};return copy;
}
function resetActor(a,time=0,sourceTime=0){
  const copy=clone(a);Object.assign(copy,{x:NEST.x+1.7,z:NEST.z+1.7,path:[],target:null,decision:0,work:0,moveSpeed:0,behavior:'idle',skill:null,shoreEscape:false});
  for(const key of ['recoverUntil','skillReadyAt'])copy[key]=time+Math.max(0,(a[key]||0)-sourceTime);
  copy.juvenileUntil=a.juvenileUntil>sourceTime?time+a.juvenileUntil-sourceTime:0;delete copy.energyWanted;
  for(const key of ['hitAt','attackAt'])if(a[key]!==undefined)copy[key]=time-Math.max(0,sourceTime-a[key]);
  for(const key of ['poisonUntil','poisonDps','poisonSource','huntTargetId','depositVisit','lastAttackerId','ralliedUntil','reservedFood','eventArrivalAt','migrationTarget'])delete copy[key];
  return copy;
}
export function safeMapPoint(s,p,swim=false){
  const t=terrainFor(s);
  for(let r=0;r<=12;r+=1.5)for(let i=0;i<(r?16:1);i++){
    const a=i*Math.PI/8,q={x:p.x+Math.cos(a)*r,z:p.z+Math.sin(a)*r};
    if(t.walkable(q.x,q.z,swim,{level:.5})&&t.TREES.every(tree=>dist(tree,q)>2)&&dist(q,NEST)>13)return q;
  }
  return {x:26,z:-11};
}
export function renewWildlife(s){
  const residents=s.agents.filter(a=>!['player','companion'].includes(a.kind)&&!a.dominated);
  const replacements={mossback:'resinshell',reedbeak:'spearbeak',emberfang:'riftstalker',glowbug:'stormlantern'};
  s.agents=s.agents.filter(a=>a.kind==='companion'||a.dominated);
  for(let i=0;i<residents.length;i++){
    const old=residents[i],species=old.species==='emberfang'&&i%2===0?'stonehorn':replacements[old.species]||'resinshell',p=safeMapPoint(s,old,!!SPECIES[species].swim);
    s.agents.push(makeAgent(`wild-${s.nextId++}`,SPECIES[species].kind,p.x,p.z,'forage',species));
  }
  for(const [species,x,z] of [['stonehorn',26,-23],['tideblade',-20,22],['tideblade',-27,10]]){
    const p=safeMapPoint(s,{x,z},true);s.agents.push(makeAgent(`wild-${s.nextId++}`,SPECIES[species].kind,p.x,p.z,'forage',species));
  }
  // Share the existing ecological space: a new silhouette never adds another predator to the route.
  if(s.mapId==='expedition')for(const [oldSpecies,newSpecies,count] of [['resinshell','fernback',2],['stormlantern','moonray',2],['tideblade','mireclaw',1],['stonehorn','spinedillo',1]]){
    const candidates=s.agents.filter(a=>a.species===oldSpecies&&!a.dominated).slice(-count);
    for(const old of candidates){
      const p=safeMapPoint(s,old,!!SPECIES[newSpecies].swim);
      s.agents[s.agents.indexOf(old)]=makeAgent(old.id,SPECIES[newSpecies].kind,p.x,p.z,'forage',newSpecies);
    }
  }
  s.ecology={groups:[],arrivals:[],nextIslandSlot:Math.floor(s.clock.tick/2400)+1,nextMarineSlot:Math.floor(s.clock.tick/3600)+1,
    adaptationUntilTick:s.clock.tick+3600,resolvedSlots:{},appliedCommandIds:[],outbox:[],inbox:[],dayQuotas:[]};
  initHabitat(s,true);
}
export function departureChoice(s,id,emergency=false){
  if(!CONTRACTS.some(c=>c.id===id))return fail('这份委托暂不可用。');
  if(activeExpedition(s)||s.journey?.transition)return fail('先完成正在进行的旅程。');
  if(!s.started)return fail('先开始探索。');
  if(emergency&&!foodOutlook(s).pressure&&!s.habitatHealth?.critical)return fail('当前没有口粮危机，按正常方式准备远征。');
  if(!emergency&&(!s.completed.includes('evolve')||!s.completed.includes('build')))return fail('先完成第一次进化并建成一座设施，再准备远征。');
  if(dist(s.player,NEST)>5)return fail('沿路回到巢边，再和同伴一起出发。');
  if(s.player.recoverUntil>s.time)return fail('先让自己恢复，再准备远征。');
  if(!emergency&&s.player.hp<70)return fail('先回到巢边休养好，再出发。');
  if(!emergency&&s.colony.food<12)return fail('远征营地需要携带 12 食物。');
  if(s.agents.filter(a=>a.kind==='companion'&&a.hp>=(emergency?1:60)&&!isJuvenile(s,a)&&!(a.recoverUntil>s.time)).length<(emergency?1:2))return fail('先让成年同伴休养，再一起出发。');
  if(s.chapter.trial&&!['resolved','failed','interrupted'].includes(s.chapter.trial.status))return fail('先处理已经预约的潮汐来客。');
  return {ok:true};
}
/** Candidates never mutate the source. The caller commits the complete next world once. */
export function planDeparture(s,contractId,emergency=false){
  const check=departureChoice(s,contractId,emergency);if(!check.ok)return check;
  const contract=CONTRACTS.find(c=>c.id===contractId),j=clone(s.journey||newJourney()),home=worldSnapshot(s);
  const party=s.agents.filter(a=>a.kind==='companion'&&a.hp>=(emergency?1:60)&&!isJuvenile(s,a)&&!(a.recoverUntil>s.time)).sort((a,b)=>(b.hp+(b.job==='guard'?10:0))-(a.hp+(a.job==='guard'?10:0))).slice(0,2);
  j.serial++;const id=`trip-${s.seed}-${j.serial}`,seed=(s.seed+j.serial*8191+contractId.length*997)>>>0;
  const next=createState(seed,'expedition');
  j.home=home;j.active={id,contractId,seed,samples:[],startedAt:0,deadline:900,event:contract.event,eventAt:180,eventWarned:false,eventStarted:false,party:party.map(a=>a.id),casualties:[],style:s.style||'balanced',returnReason:null};
  const supplies=emergency?Math.min(6,home.colony.food):12;home.colony.food-=supplies;
  Object.assign(j.active,{emergency,cargoVersion:1,provisions:0,seeds:0,specimens:{}});
  next.journey=j;next.style=s.style||'balanced';next.saveId=s.saveId;next.started=true;next.speed=s.speed;
  next.parts=[...s.parts];next.appearance=s.appearance;next.generation=s.generation;next.hints=clone(s.hints||{});
  next.player=resetActor(s.player,0,s.time);next.agents=next.agents.filter(a=>a.kind!=='companion');
  next.player.id='player';home.player.carry={food:0,material:0};home.player.reservedFood=0;
  for(const a of party){const member=resetActor(a,0,s.time);member.job='guard';member.manualFollow=true;next.agents.push(member);home.agents.find(x=>x.id===a.id).carry={food:0,material:0};}
  next.colony={food:supplies,material:0,dna:s.colony.dna,capacity:party.length+1,storage:80,egg:null,starve:0,foodPolicy:s.colony.foodPolicy||'normal'};initFood(next);next.colony.breedingAllowed=false;
  next.completed=[...s.completed];next.quest=s.quest;next.metrics=clone(s.metrics);next.eventSeq=s.eventSeq;
  for(const r of next.resources.filter(r=>r.kind==='relic'))Object.assign(r,safeMapPoint(next,r,true));
  const native=Object.keys(home.habitatHealth?.baseline||{mossback:5,glowbug:4,reedbeak:4});
  native.sort((a,b)=>home.agents.filter(x=>x.species===a&&x.hp>0&&!x.dominated).length-home.agents.filter(x=>x.species===b&&x.hp>0&&!x.dominated).length);
  for(let i=0;i<SAMPLE_POINTS.length;i++){
    const p=SAMPLE_POINTS[i];if(!terrainFor(next).findPath(NEST,p,false,{level:.5}))return fail('这座岛的高地通路暂时无法通行，请稍后再试。');
    const species=native[i%native.length];
    next.resources.push({id:`${id}-sample-${i}`,kind:'relic',...p,amount:1,max:1,regen:0,sampleIndex:i,sampleName:contractId==='tidespore'?`${SPECIES[species].name}卵囊`:contract.sample,...(contractId==='tidespore'?{sampleSpecies:species}:{}),tripId:id});
  }
  renewWildlife(next);
  next.ecology.adaptationUntilTick=Number.MAX_SAFE_INTEGER;
  if(contract.event==='migration')for(let i=0;i<2;i++){
    const p=safeMapPoint(next,{x:7+i*3,z:-39}),a=makeAgent(`${id}-migrant-${i}`,'predator',p.x,p.z,'forage','riftstalker');
    a.origin='event';a.eventArrivalAt=180;a.migrationTarget={x:5,z:-8};next.agents.push(a);
  }
  next.weatherV3.schedule=contract.event==='squall'?[{id:'clear',start:0,end:3600},{id:'squall',start:3600,end:6000},{id:'cloudy',start:6000,end:18020}]:[{id:'clear',start:0,end:3600},{id:'cloudy',start:3600,end:18020}];
  next.weatherV3.publishedUntilTick=18020;next.weatherV3.lastSquallStartTick=contract.event==='squall'?3600:-21600;
  next.weatherAt=180;
  next.lifetimeAwaySeconds=j.totalAwayTime;
  emit(next,'ExpeditionStarted',{tripId:id,contractId,party:j.active.party},`${contract.name}：同伴已到营地，三个样本地点标在地图上。`,true);
  return {ok:true,state:next};
}
export function collectSample(s,r){
  const run=s.journey?.active;
  if(!run||r.tripId!==run.id||!Number.isInteger(r.sampleIndex)||r.sampleIndex<0||r.sampleIndex>2||run.samples.includes(r.sampleIndex))return false;
  run.samples.push(r.sampleIndex);run.samples.sort();r.amount=0;
  if(run.cargoVersion===1){
    if(run.contractId==='glowflower')run.provisions+=8;
    if(run.contractId==='saltseed')run.seeds++;
    if(run.contractId==='tidespore'&&r.sampleSpecies)run.specimens[r.sampleSpecies]=(run.specimens[r.sampleSpecies]||0)+2;
  }
  emit(s,'ExpeditionSample',{tripId:run.id,index:r.sampleIndex},run.samples.length===3?'样本已经齐全。回营地返航，让它们在家园安顿下来。':`取得${r.sampleName} · ${run.samples.length} / 3`,true);return true;
}
export function claimCargo(s){
  if(activeExpedition(s)||!s.journey)return;
  if(s.colony.materialRefund>0){const amount=Math.min(s.colony.materialRefund,Math.max(0,s.colony.storage-s.colony.material));s.colony.material+=amount;s.colony.materialRefund-=amount;}
  for(const kind of ['food','material']){
    const amount=Math.min(s.journey.pending[kind],Math.max(0,s.colony.storage-s.colony[kind]));
    s.colony[kind]+=amount;s.journey.pending[kind]=Math.max(0,s.journey.pending[kind]-amount);
  }
}
export function planReturn(s,reason='normal'){
  if(!activeExpedition(s)||!s.journey.home)return fail('当前没有可以结束的远征。');
  if(!['normal','emergency','injured','timeout'].includes(reason))return fail('未知的返航方式。');
  reason=s.journey.active.returnReason||reason;
  if(reason==='normal'&&dist(s.player,NEST)>5)return fail('先回到营地，再带着收获返航。');
  const j=clone(s.journey),run=j.active,home=clone(j.home),success=reason==='normal'&&run.samples.length===3;
  if(home.agents.length+s.agents.filter(a=>a.dominated).length>64)return fail('家园的位置不够，请先通过长按菜单放归部分新追随者。');
  if(j.history.some(h=>h.id===run.id))return fail('这次远征已经结算。');
  const cargo={food:s.colony.food,material:s.colony.material};
  if(reason==='normal')cargo.food+=run.provisions||0;
  for(const a of [s.player,...s.agents.filter(a=>a.kind==='companion')])for(const k of ['food','material'])cargo[k]+=a.carry[k];
  if(reason!=='normal')for(const k of ['food','material'])cargo[k]=Math.floor(cargo[k]*.65);
  for(const k of ['food','material'])j.pending[k]+=cargo[k];
  home.colony.dna=s.colony.dna;home.parts=[...s.parts];home.style=s.style;home.appearance=s.appearance;home.generation=s.generation;
  initFood(home);
  home.survival.foodSpent+=s.survival?.foodSpent||0;home.survival.energyFoodSpent+=s.survival?.energyFoodSpent||0;
  if(reason==='normal'){
    home.colony.seedStock+=run.seeds||0;
    for(const [species,count] of Object.entries(run.specimens||{}))home.colony.nursery[species]=(home.colony.nursery[species]||0)+count;
  }
  home.completed=[...s.completed];home.quest=s.quest;home.hints=clone(s.hints||{});
  for(const key of ['gathered','deposited','evolved','kills'])home.metrics[key]=Math.max(home.metrics[key],s.metrics[key]);
  j.knowledge=[...new Set([...(j.knowledge||[]),...s.discovered])];
  home.player=resetActor(s.player,home.time,s.time);home.player.carry={food:0,material:0};
  for(const id of run.party){
    if(run.casualties?.includes(id)){home.agents=home.agents.filter(a=>a.id!==id);continue;}
    const original=home.agents.find(a=>a.id===id),traveller=s.agents.find(a=>a.id===id);if(!original||!traveller)return fail('同行成员的记录不完整，原家园快照仍然保留。');
    const restored=resetActor(traveller,home.time,s.time);Object.assign(restored,{job:original.job,manualFollow:original.manualFollow||false,carry:{food:0,material:0}});Object.assign(original,restored);
  }
  for(const a of s.agents.filter(a=>a.dominated))if(home.agents.length<64&&!home.agents.some(old=>old.id===a.id)){
    const follower=resetActor(a,home.time,s.time);follower.id=`adopted-${home.nextId++}`;follower.carry={food:0,material:0};home.agents.push(follower);
  }
  let reward=null,dna=0;
  if(success){
    const first=!j.rewards.includes(run.contractId);dna=first?18:8;home.colony.dna+=dna;
    if(first){j.rewards.push(run.contractId);reward=CONTRACTS.find(c=>c.id===run.contractId).reward;}
    j.successes++;if(j.era){j.eraSuccesses++;if(!j.eraContracts.includes(run.contractId))j.eraContracts.push(run.contractId);}
  }
  j.totalAwayTime+=s.time;
  home.lifetimeAwaySeconds=j.totalAwayTime;
  const receipt={id:run.id,contractId:run.contractId,success,reason,cargo,dna,reward,seconds:s.time,style:run.style,era:j.era,casualties:[...(run.casualties||[])],seeds:reason==='normal'?(run.seeds||0):0,specimens:reason==='normal'?(run.specimens||{}):{}};
  j.history.unshift(receipt);j.history=j.history.slice(0,12);j.active=null;j.home=null;
  home.journey=j;home.saveId=s.saveId;home.eventSeq=s.eventSeq;home.notifications=[];home.paused=false;home.selected=null;
  home.chapter.stableSinceTick=null;
  home.metrics.population=population(home);
  claimCargo(home);
  emit(home,'ExpeditionReturned',{tripId:run.id,success,reason,reward,dna},success?`远征归来：${reward?`${reward}已在巢边安顿，`:''}进化点 +${dna}。`:reason==='normal'?'带着已经取得的收获回到了家园。':'已经返回家园休养，保住了部分收获。',true);
  return {ok:true,state:home,receipt};
}
export function journeyTick(s){
  claimCargo(s);const run=s.journey?.active;if(!run)return;
  if(!run.eventWarned&&s.time>=run.eventAt-60){run.eventWarned=true;emit(s,'ExpeditionWarning',{tripId:run.id},run.event==='squall'?'一分钟后风雨会经过这座岛，留意高地返营路线。':'北岸的猎群已经动身，一分钟后会经过石脊。');}
  if(!run.eventStarted&&s.time>=run.eventAt){run.eventStarted=true;emit(s,'ExpeditionEvent',{tripId:run.id,event:run.event},run.event==='squall'?'风雨到了，泥地和浅滩开始变化。':'猎群正从北岸走向石脊，守卫会保护身边的同伴。');}
  if(s.time>=run.deadline&&!run.returnReason)run.returnReason='timeout';
}
export function planMillennium(s){
  if(activeExpedition(s)||s.journey?.era||s.chapter.id!=='first_island'||s.chapter.status!=='won'||!s.chapter.victory)return fail('先完成初岛安居，再见证后裔的时代。');
  const next=clone(s);next.journey??=newJourney();
  next.journey.transition??={id:`era-${s.chapter.victory.id}`,progress:0};next.paused=false;return {ok:true,state:next};
}
export function planNextEra(s){
  if(s.journey?.era||!s.journey?.transition||s.chapter.status!=='won'||!s.chapter.victory)return fail('这个时代已经启程，或初岛记录不完整。');
  const next=clone(s);next.mapId='rift';next.journey.era=1;next.journey.eraStartedAt=s.time;next.journey.firstVictory=clone(s.chapter.victory);next.journey.transition=null;next.journey.eraSuccesses=0;next.journey.eraContracts=[];
  const newMap=createState(s.seed+1000,'rift');next.resources=newMap.resources;
  next.player=resetActor(s.player,s.time,s.time);next.player.carry=clone(s.player.carry);
  for(const a of next.agents.filter(a=>a.kind==='companion'||a.dominated)){const restored=resetActor(a,s.time,s.time);restored.carry=clone(a.carry);Object.assign(a,restored);}
  renewWildlife(next);
  next.chapter={id:'second_island',version:1,status:'active',trial:null,stableSinceTick:null,lastDisruptionTick:-1,victory:null};
  emit(next,'EraEntered',{era:1000,sourceVictory:s.chapter.victory.id},'一千年后，后裔仍在这片巢地生活。带回新的发现，让家园继续生长。',true);return {ok:true,state:next};
}
export function secondChapterProgress(s){
  const built=k=>s.buildings.filter(b=>b.kind===k&&b.progress===1).length;
  const goals=[{id:'expeditions',label:'本时代成功远征',value:s.journey.eraSuccesses,target:3},{id:'contracts',label:'本时代不同委托',value:s.journey.eraContracts.length,target:2},
    {id:'rewards',label:'家园探索景观',value:s.journey.rewards.length,target:3},{id:'population',label:'族群成员',value:population(s),target:10},
    ...[['nest','育幼巢',1],['garden','浆果圃',2],['cache','储藏堆',1]].map(([id,label,target])=>({id,label,target,value:built(id)}))];
  return {goals,ready:goals.every(g=>g.value>=g.target),stableSeconds:s.chapter.stableSinceTick===null?0:Math.min(120,(s.clock.tick-s.chapter.stableSinceTick)/20),minimumSeconds:0,food:s.colony.food,won:s.chapter.status==='won'};
}
export function updateSecondChapter(s){
  if(s.chapter.status==='won')return;
  if(s.habitatHealth?.critical||foodOutlook(s).average<70){s.chapter.stableSinceTick=null;s.chapter.disruption=s.habitatHealth?.critical?'先解除生态临界。':'先让族群重新吃饱。';return;}
  const c=s.chapter,p=secondChapterProgress(s),threat=s.agents.some(a=>a.kind==='predator'&&!a.dominated&&a.hp>0&&!(a.pacifiedUntil>s.time)&&dist(a,NEST)<12);
  if(!p.ready||s.colony.food<30||threat||c.lastDisruptionTick===s.clock.tick){c.stableSinceTick=null;c.disruption=threat?'巢边还有敌对威胁。':s.colony.food<30?'食物需要保持至少 30。':'完成远征与家园目标后，开始安居观察。';return;}
  c.stableSinceTick??=s.clock.tick;c.disruption='';
  if(s.clock.tick-c.stableSinceTick>=2400){c.status='won';c.victory={id:`second-island-${s.seed}-${s.clock.tick}`,chapterId:'second_island',tick:s.clock.tick,rulesVersion:s.rulesVersion,goals:p.goals};emit(s,'ChapterWon',{victory:c.victory},'风潮立足：家园与远方，都留下了族群的故事。',true);}
}
