import { SAVE_KEY, VERSION, EVOLUTIONS, APPEARANCES, SPECIES } from './config.js';
import { createState, notify, upgradeState } from './state.js';
import { WEATHER, initWeather } from './weather.js';
import { deserialize as deserializeLegacy } from '../../legacy/src/core/persistence.js';
import { seaRoute } from './sea-navigation.js';
import { validJourney } from './journey-validation.js';
import { GUIDE_IDS } from './onboarding.js';
import { validSurvival } from './survival-validation.js';

export function serialize(s){
  return JSON.stringify({...s,paused:false,selected:null,actionNotice:null,notifications:[],savedAt:Date.now(),
    ecology:{...s.ecology,outbox:[],inbox:[],pending:[],receipts:[],runEpoch:'',modelEnabled:false}},(key,value)=>['nav','energyWanted'].includes(key)?undefined:value);
}
function validExtension(s){
  if(!s.clock||!Number.isSafeInteger(s.clock.tick)||s.clock.tick<0||Math.abs(s.time-s.clock.tick/20)>1e-7)return false;
  if(s.rulesVersion!=='isle-v3-e1'||!s.weatherV3||!WEATHER[s.weatherV3.current]||!Array.isArray(s.weatherV3.schedule)||!s.weatherV3.schedule.length||s.weatherV3.schedule.length>12)return false;
  if(s.weatherV3.groundWetness!==undefined&&(!Number.isFinite(s.weatherV3.groundWetness)||s.weatherV3.groundWetness<0||s.weatherV3.groundWetness>1))return false;
  if(s.weatherV3.surfaceTick!==undefined&&(!Number.isSafeInteger(s.weatherV3.surfaceTick)||s.weatherV3.surfaceTick<0||s.weatherV3.surfaceTick>s.clock.tick))return false;
  let end=-1;
  for(const w of s.weatherV3.schedule){if(!WEATHER[w.id]||!Number.isSafeInteger(w.start)||!Number.isSafeInteger(w.end)||w.start<0||w.end<=w.start||end>=0&&w.start!==end)return false;end=w.end;}
  if(s.weatherV3.schedule[0].start>s.clock.tick||end<=s.clock.tick)return false;
  if(!s.tide||!['low','mid','high'].includes(s.tide.bucket)||!Number.isFinite(s.tide.phaseOffset)||!Number.isSafeInteger(s.tide.navRevision))return false;
  const e=s.ecology;
  if(!e||!Array.isArray(e.groups)||e.groups.length>16||!Array.isArray(e.arrivals)||e.arrivals.length>16||!Array.isArray(e.dayQuotas)||e.dayQuotas.length>4)return false;
  if(![e.nextIslandSlot,e.nextMarineSlot,e.adaptationUntilTick].every(n=>Number.isSafeInteger(n)&&n>=0))return false;
  if(!Array.isArray(e.appliedCommandIds)||e.appliedCommandIds.length>256||!e.resolvedSlots)return false;
  const agentIds=new Set(s.agents.map(a=>a.id));
  for(const g of e.groups)if(!SPECIES[g.species]||!Array.isArray(g.memberIds)||g.memberIds.some(id=>!agentIds.has(id))||!Number.isSafeInteger(g.groupRevision)||!Array.isArray(g.events)||g.events.length>16)return false;
  const arrivalIds=new Set();
  for(const a of e.arrivals){
    if(arrivalIds.has(a.id)||!seaRoute(a.routeId,s)||!SPECIES[a.species]?.marine||!Array.isArray(a.roster)||a.roster.length>4||!['announced','landing','onshore','departing','resolved','cancelled'].includes(a.status))return false;
    arrivalIds.add(a.id);
    if(![a.startTick,a.warningTick,a.endTick].every(Number.isSafeInteger)||a.startTick<a.warningTick+1200||a.endTick<a.startTick)return false;
    if(!['resolved','cancelled'].includes(a.status)&&a.roster.some(r=>!agentIds.has(r.id)))return false;
  }
  if(!s.chapter||!['first_island','second_island'].includes(s.chapter.id)||!['active','won'].includes(s.chapter.status))return false;
  if(s.chapter.stableSinceTick!==null&&(!Number.isSafeInteger(s.chapter.stableSinceTick)||s.chapter.stableSinceTick>s.clock.tick))return false;
  if(!Number.isSafeInteger(s.eventSeq)||!Array.isArray(s.recentEvents)||s.recentEvents.length>256||!Array.isArray(s.chapterEvidence))return false;
  if(s.chapter.trial){const t=s.chapter.trial;if(!['scheduled','active','departing','resolved','failed','interrupted'].includes(t.status)||!Number.isSafeInteger(t.startTick)||!Number.isSafeInteger(t.endTick)||t.endTick!==t.startTick+2400||!Array.isArray(t.completedRoutes)||t.completedRoutes.some(r=>!['coexist','repelled','shelter'].includes(r)))return false;}
  if(s.chapter.trial?.completedRoutes.length){
    const t=s.chapter.trial,evidence=s.chapterEvidence.find(e=>e.type==='TrialCompleted'&&e.seq===t.resultEventId&&e.trialId===t.id&&e.arrivalId===t.arrivalId);
    if(t.status!=='resolved'||!evidence||JSON.stringify(evidence.routes)!==JSON.stringify(t.completedRoutes))return false;
  }
  if(s.chapter.status==='won'&&s.chapter.id==='second_island'){
    if(!s.chapter.victory||s.chapter.victory.chapterId!=='second_island'||!Number.isSafeInteger(s.chapter.victory.tick)||s.chapter.victory.tick<0||s.chapter.victory.tick>s.clock.tick||!s.chapterEvidence.some(e=>e.type==='ChapterWon'&&e.victory?.id===s.chapter.victory.id))return false;
  }
  if(s.chapter.status==='won'&&s.chapter.id==='first_island'){
    const v=s.chapter.victory;
    const elapsed=v?.elapsedTicks??v?.tick,maxElapsed=s.clock.tick+Math.round((s.lifetimeAwaySeconds??s.journey?.totalAwayTime??0)*20);
    if(!v||!Number.isSafeInteger(elapsed)||elapsed<36000||elapsed>maxElapsed||!Number.isSafeInteger(v.tick)||v.tick<0||v.tick>s.clock.tick||elapsed<v.tick||!s.chapterEvidence.some(e=>e.type==='ChapterWon'&&e.victory?.id===v.id)||!s.chapterEvidence.some(e=>e.type==='TrialCompleted'&&e.seq===v.evidenceId&&e.routes?.length))return false;
  }
  return true;
}
export function deserialize(raw,{nested=false}={}){
  try{
    if(typeof raw!=='string'||raw.length>2_000_000)return null;
    const s=JSON.parse(raw);
    if(s?.version!==VERSION||!s.player||!Array.isArray(s.agents)||!Array.isArray(s.resources)||!Array.isArray(s.buildings)||!Array.isArray(s.parts)||!Array.isArray(s.discovered)||!s.colony||!s.metrics||!Array.isArray(s.completed)||!Array.isArray(s.journal))return null;
    if(s.agents.length>64||s.resources.length>500||s.parts.some(p=>!EVOLUTIONS.some(e=>e.id===p))||new Set(s.parts).size!==s.parts.length)return null;
    for(const root of EVOLUTIONS.filter(e=>!e.parent))if(EVOLUTIONS.filter(e=>e.parent===root.id&&s.parts.includes(e.id)).length>1)return null;
    if(s.parts.some(id=>{const e=EVOLUTIONS.find(e=>e.id===id);return e.parent&&!s.parts.includes(e.parent);}))return null;
    if(s.appearance&&!APPEARANCES.some(a=>a.id===s.appearance))return null;
    if(s.hints?.guideV1!==undefined&&(!Array.isArray(s.hints.guideV1)||s.hints.guideV1.length>GUIDE_IDS.length||new Set(s.hints.guideV1).size!==s.hints.guideV1.length||s.hints.guideV1.some(id=>!GUIDE_IDS.includes(id))))return null;
    if(typeof s.started!=='boolean'||![1,2].includes(s.speed)||!Number.isInteger(s.quest)||s.quest>6||!Number.isInteger(s.generation)||s.generation<1)return null;
    if(new Set(s.discovered).size!==s.discovered.length||s.discovered.some(id=>!['meadow','wetland','grove','ridge'].includes(id)))return null;
    if(s.colony.materialRefund!==undefined&&(!Number.isFinite(s.colony.materialRefund)||s.colony.materialRefund<0||s.colony.materialRefund>1000000))return null;
    const numeric=[s.time,s.rng,s.seed,s.quest,s.generation,s.nextId,s.colony.food,s.colony.material,s.colony.dna,s.colony.storage,s.colony.capacity];
    if(numeric.some(n=>!Number.isFinite(n)||n<0)||s.colony.storage<1||s.colony.capacity<1||s.colony.food>s.colony.storage||s.colony.material>s.colony.storage)return null;
    if(!Object.values(s.metrics).every(v=>Number.isFinite(v)&&v>=0))return null;
    if(!['gathered','deposited','evolved','built','discovered','population','kills'].every(k=>Number.isFinite(s.metrics[k])))return null;
    if(!Number.isFinite(s.weatherAt)||!WEATHER[s.weather]||!Number.isFinite(s.rallyUntil)||!Number.isFinite(s.rallyCooldown))return null;
    if(s.colony.egg&&(!Number.isFinite(s.colony.egg.remaining)||!Number.isFinite(s.colony.egg.total)||s.colony.egg.total<=0||s.colony.egg.remaining<0||s.colony.egg.remaining>s.colony.egg.total))return null;
    const ids=new Set();
    for(const a of [s.player,...s.agents]){
      if(typeof a.id!=='string'||ids.has(a.id)||!['player','companion','grazer','predator'].includes(a.kind))return null;
      ids.add(a.id);
      if(!a.carry||![a.x,a.z,a.hp,a.stamina,a.heading,a.cooldown,a.age,a.carry.food,a.carry.material].every(Number.isFinite)||Math.abs(a.x)>60||Math.abs(a.z)>60||a.hp<0||a.carry.food<0||a.carry.material<0)return null;
      if(a.kind==='companion'&&!['forage','build','guard'].includes(a.job))return null;
      if(a.species&&!SPECIES[a.species])return null;
      if(a.reservedFood!==undefined&&(!Number.isFinite(a.reservedFood)||a.reservedFood<0||a.reservedFood>a.carry.food))return null;
      if(a.kind!=='player'&&a.kind!=='companion'&&a.hp===0&&a.origin!=='marine'&&(![a.homeX,a.homeZ].every(Number.isFinite)||a.respawnAt!==null&&!Number.isFinite(a.respawnAt)))return null;
      a.path=[];a.target=null;a.moveSpeed=0;a.decision=0;a.work=0;a.shoreEscape=false;
    }
    if(s.player.kind!=='player'||s.agents.some(a=>a.kind==='player'))return null;
    for(const r of s.resources)if(!['food','material','relic'].includes(r.kind)||![r.x,r.z,r.amount,r.max].every(Number.isFinite)||r.amount<0||r.max<r.amount)return null;
    for(const b of s.buildings)if(!['home','nest','garden','cache'].includes(b.kind)||![b.x,b.z,b.progress].every(Number.isFinite)||b.progress<0||b.progress>1)return null;
    if(!validExtension(s)||!validJourney(s,{nested})||!validSurvival(s))return null;
    if(s.journey?.home){const restored=deserialize(JSON.stringify(s.journey.home),{nested:true});if(!restored)return null;delete restored.journey;s.journey.home=restored;}
    s.ecology.outbox=[];s.ecology.inbox=[];s.ecology.pending=[];s.ecology.receipts=[];s.ecology.runEpoch='';s.ecology.modelEnabled=false;
    s.paused=false;s.selected=null;s.notifications=[];delete s.actionNotice;return upgradeState(s);
  }catch{return null;}
}
export function migrateLegacy(raw){
  const old=deserializeLegacy(raw);if(!old||old.agents.length>64)return null;
  const next=createState(old.seed);
  for(const key of ['seed','rng','time','started','speed','generation','player','agents','resources','colony','buildings','parts','appearance','worldRevision','discovered','quest','completed','metrics','journal','rallyUntil','rallyCooldown','nextId','weather','weatherAt','hints'])if(old[key]!==undefined)next[key]=old[key];
  next.clock={tick:Math.round(old.time*20)};next.time=next.clock.tick/20;
  delete next.weatherV3;delete next.tide;
  next.ecology.adaptationUntilTick=next.clock.tick+12000;
  next.ecology.nextIslandSlot=Math.floor(next.time/120)+1;next.ecology.nextMarineSlot=Math.floor(next.time/180)+1;
  initWeather(next,Math.max(1,Math.min(180,old.weatherAt-old.time)));
  next.tide.phaseOffset=-Math.PI*2*next.time/180;next.tide.introducedAt=next.time;
  next.player.reservedFood=0;next.migratedFromVersion=2;
  return deserialize(serialize(next));
}
export function load(storage=globalThis.localStorage){
  try{
    const raw=storage.getItem(SAVE_KEY);
    const saved=raw&&deserialize(raw);
    if(saved)return {state:saved,isNew:false};
    const state=createState();
    if(raw)notify(state,'旧存档无法读取，已保留原记录并创建新的旅程。','danger');
    return {state,isNew:true,invalidRaw:raw||null};
  }catch{return {state:createState(),isNew:true};}
}
export function save(s,storage=globalThis.localStorage){
  try{storage.setItem(SAVE_KEY,serialize(s));return true;}catch{return false;}
}
