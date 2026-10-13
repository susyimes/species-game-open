import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, makeAgent } from '../src/core/state.js';
import { planDeparture, planReturn, collectSample, planMillennium, planNextEra, secondChapterProgress } from '../src/core/journey.js';
import { setStyle, useSkill } from '../src/core/journey-config.js';
import { serialize, deserialize } from '../src/core/persistence.js';
import { step } from '../src/core/simulation.js';
import { moveTo } from '../src/core/actions.js';
import { terrainFor, heightAt } from '../src/core/terrain.js';
import { SAMPLE_POINTS } from '../src/core/maps.js';
import { NEST, speciesStats } from '../src/core/config.js';
import { updateWeather } from '../src/core/weather.js';
import { emit } from '../src/core/events.js';
import { updateChapter } from '../src/core/chapter.js';

function home(){const s=createState();s.started=true;Object.assign(s.player,NEST);s.parts=['legs','shell','horns'];s.completed=['gather','home','evolve','build'];s.quest=4;s.metrics.evolved=3;s.colony.food=70;s.colony.material=40;s.buildings.push({id:'built-nest',kind:'nest',x:5,z:2,progress:1});s.colony.capacity=10;return s;}
function ticks(s,seconds){for(let i=0;i<Math.round(seconds*20);i++)step(s);}
function finishSamples(s){for(const r of s.resources.filter(r=>r.sampleIndex!==undefined))assert.ok(collectSample(s,r));Object.assign(s.player,NEST);}

test('departure is a nonmutating candidate with exactly two real members and a frozen complete home',()=>{
  const s=home(),raw=JSON.stringify(s),result=planDeparture(s,'glowflower');assert.ok(result.ok);assert.equal(JSON.stringify(s),raw);
  const a=result.state;assert.equal(a.agents.filter(x=>x.kind==='companion').length,2);assert.equal(a.journey.home.agents.filter(x=>x.kind==='companion').length,5);
  const frozen=JSON.stringify(a.journey.home);ticks(a,8);assert.equal(JSON.stringify(a.journey.home),frozen);assert.equal(a.time,8);
  assert.ok(deserialize(serialize(a)));assert.equal(a.journey.home.colony.food,58);assert.equal(planDeparture(a,'glowflower').ok,false);
});
test('all sample sites have actual non-swimming paths in both tide extremes, independently of old terrain caches',()=>{
  const legacy=heightAt(-16,-25);let differences=0;
  for(const id of ['expedition','home','rift','expedition']){const terrain=terrainFor({mapId:id});
    if(id!=='home')for(const p of SAMPLE_POINTS)for(const level of [.06,.50])assert.ok(terrain.findPath(NEST,p,false,{level}),`${id} ${JSON.stringify(p)} ${level}`);
    if(terrain.heightAt(-16,-25)!==legacy)differences++;
  }
  assert.equal(differences,3);assert.equal(heightAt(-16,-25),legacy);
});
test('samples require actual approaching and work; reloading and repeated collection cannot duplicate them',()=>{
  const a=planDeparture(home(),'glowflower').state;a.agents=a.agents.filter(x=>x.kind==='companion');
  const r=a.resources.find(x=>x.sampleIndex===0);assert.ok(moveTo(a,r,{type:'resource',id:r.id}).ok);
  ticks(a,1);assert.equal(a.journey.active.samples.length,0);
  for(let i=0;i<1200&&!a.journey.active.samples.length;i++)step(a);
  assert.deepEqual(a.journey.active.samples,[0]);assert.equal(r.amount,0);assert.equal(collectSample(a,r),false);
  const read=deserialize(serialize(a));assert.ok(read);assert.deepEqual(read.journey.active.samples,[0]);
});
test('normal return conserves supplies and old construction, carries field evolution, and retains full-storage overflow',()=>{
  const h=home();h.colony.food=80;h.colony.material=80;h.buildings.push({id:'worksite',kind:'garden',x:-1,z:3,progress:.35});
  const a=planDeparture(h,'glowflower').state;a.colony.food+=24;a.colony.material=35;a.player.carry.food=7;a.player.carry.material=5;a.parts.push('tail');a.colony.dna-=5;
  finishSamples(a);const result=planReturn(a);assert.ok(result.ok);const s=result.state;
  // Three physically collected flower samples now add 24 food to the return cargo.
  assert.equal(s.colony.food+s.journey.pending.food,135);assert.equal(s.colony.material+s.journey.pending.material,120);
  assert.equal(s.buildings.find(b=>b.id==='worksite').progress,.35);assert.ok(s.parts.includes('tail'));assert.equal(s.colony.dna,h.colony.dna-5+18);
  assert.deepEqual(s.journey.rewards,['glowflower']);assert.equal(s.journey.successes,1);assert.equal(s.agents.filter(x=>x.kind==='companion').length,5);
  assert.ok(deserialize(serialize(s)));assert.equal(planReturn(s).ok,false);
});
test('duplicate same-contract runs reward once per run and do not duplicate scenery',()=>{
  let s=home();for(let i=0;i<2;i++){const a=planDeparture(s,'glowflower').state;finishSamples(a);s=planReturn(a).state;}
  assert.deepEqual(s.journey.rewards,['glowflower']);assert.equal(s.journey.successes,2);assert.equal(s.colony.dna,12+18+8);assert.equal(new Set(s.journey.history.map(r=>r.id)).size,2);
});
test('forced evacuation overrides a normal-return request and charges a single 35 percent loss',()=>{
  const a=planDeparture(home(),'saltseed').state;a.colony.food=20;a.colony.material=10;a.player.carry={food:10,material:10};finishSamples(a);a.journey.active.returnReason='injured';
  const result=planReturn(a,'normal');assert.ok(result.ok);assert.equal(result.receipt.success,false);assert.deepEqual(result.receipt.cargo,{food:19,material:13});assert.equal(result.receipt.dna,0);assert.deepEqual(result.state.journey.rewards,[]);
});
test('pause freezes expedition events and expiry; normal time eventually requests evacuation',()=>{
  const a=planDeparture(home(),'tidespore').state;a.time=899;a.clock.tick=17980;a.paused=true;ticks(a,5);assert.equal(a.time,899);assert.equal(a.journey.active.returnReason,null);
  a.paused=false;ticks(a,2);assert.equal(a.journey.active.returnReason,'timeout');assert.equal(a.time,900);const frozen=JSON.stringify(a);ticks(a,2);assert.equal(JSON.stringify(a),frozen);
});
test('corrupt nested homes, contract identities, samples, map bindings and ability states are rejected',()=>{
  const a=planDeparture(home(),'glowflower').state;
  for(const corrupt of [s=>s.journey.home.journey={},s=>s.journey.active.contractId='invented',s=>s.journey.active.samples=[0,0],s=>s.journey.home.mapId='expedition',s=>s.journey.rewards=['fake'],s=>s.player.skill={kind:'guardian',until:Infinity,used:false}]){
    const copy=JSON.parse(serialize(a));corrupt(copy);assert.equal(deserialize(JSON.stringify(copy)),null);
  }
  const legacy=home();delete legacy.journey;delete legacy.mapId;delete legacy.style;assert.ok(deserialize(serialize(legacy)).journey);
});
test('old styles and skill timers are retired on load without losing purchased parts',()=>{
  const s=home();s.style='guardian';s.player.skill={kind:'guardian',until:100,used:false};s.player.skillReadyAt=200;
  const saved=deserialize(serialize(s));assert.ok(saved);assert.equal(saved.style,'balanced');assert.deepEqual(saved.parts,s.parts);
  assert.equal(saved.player.skill,undefined);assert.equal(saved.player.skillReadyAt,undefined);
  assert.equal(useSkill(saved).ok,false);assert.equal(setStyle(saved,'hunter').ok,false);assert.equal(setStyle(saved,'tidal').ok,false);
});

test('retired styles cannot change real combat damage or body statistics',()=>{
  function scenario(style){const s=home();s.style=style;Object.assign(s.player,{x:20,z:12,skill:{kind:style,until:100,used:false}});s.agents=[makeAgent('threat','predator',20,13,'forage','emberfang')];return s;}
  const base=scenario('balanced'),guard=scenario('guardian');step(base);step(guard);assert.equal(guard.player.hp,base.player.hp);
  for(const style of ['hunter','guardian','tidal'])assert.deepEqual(speciesStats(['legs','fins','horns'],style),speciesStats(['legs','fins','horns']));
});

test('millennium retains the home and purchases, changes actual map and species, and cannot apply twice',()=>{
  const s=home();s.time=1800;s.clock.tick=36000;updateWeather(s);
  const trial={id:'t',arrivalId:'a',status:'resolved',startTick:33000,endTick:35400,completedRoutes:['repelled']};s.chapter.trial=trial;
  trial.resultEventId=emit(s,'TrialCompleted',{trialId:'t',arrivalId:'a',routes:['repelled']},'',true).seq;
  s.chapter.status='won';s.chapter.victory={id:'first-island-fixture',tick:36000,evidenceId:trial.resultEventId};emit(s,'ChapterWon',{victory:s.chapter.victory},'',true);
  const prepared=planMillennium(s);assert.ok(prepared.ok);assert.ok(deserialize(serialize(prepared.state)));
  const next=planNextEra(prepared.state);assert.ok(next.ok);assert.equal(next.state.mapId,'rift');assert.deepEqual(next.state.parts,s.parts);assert.deepEqual(next.state.colony,s.colony);assert.deepEqual(next.state.buildings,s.buildings);assert.ok(next.state.agents.some(a=>a.species==='stonehorn'));assert.ok(deserialize(serialize(next.state)));
  assert.equal(planNextEra(next.state).ok,false);assert.equal(secondChapterProgress(next.state).ready,false);
  const trip=planDeparture(next.state,'saltseed');assert.ok(trip.ok);assert.ok(deserialize(serialize(trip.state)));finishSamples(trip.state);const back=planReturn(trip.state).state;assert.equal(back.journey.eraSuccesses,1);assert.equal(back.mapId,'rift');assert.ok(deserialize(serialize(back)));
});

test('expedition warnings precede real storm effects and a physically moving migration, once per trip',()=>{
  for(const contract of ['glowflower','tidespore']){
    const a=planDeparture(home(),contract).state;a.time=119.95;a.clock.tick=2399;updateWeather(a);step(a);
    assert.equal(a.journey.active.eventWarned,true);assert.equal(a.journey.active.eventStarted,false);
    const migrants=a.agents.filter(x=>x.eventArrivalAt).map(x=>({id:x.id,x:x.x,z:x.z}));
    a.time=179.95;a.clock.tick=3599;updateWeather(a);ticks(a,11);
    assert.equal(a.journey.active.eventStarted,true);assert.equal(a.recentEvents.filter(e=>e.type==='ExpeditionEvent').length,1);
    if(contract==='glowflower'){assert.equal(a.weather,'squall');assert.ok(a.weatherV3.groundWetness>.3);}
    else{assert.equal(migrants.length,2);assert.ok(migrants.some(old=>{const current=a.agents.find(x=>x.id===old.id);return Math.hypot(old.x-current.x,old.z-current.z)>2;}));}
    assert.ok(deserialize(serialize(a)));assert.deepEqual(a.completed,home().completed,'home tutorial must remain frozen');
  }
});

test('second chapter requires three genuine trip receipts and a fresh uninterrupted home stability window',()=>{
  let s=home();s.time=1800;s.clock.tick=36000;updateWeather(s);
  const t={id:'t2',arrivalId:'a2',status:'resolved',startTick:33000,endTick:35400,completedRoutes:['repelled']};s.chapter.trial=t;t.resultEventId=emit(s,'TrialCompleted',{trialId:t.id,arrivalId:t.arrivalId,routes:['repelled']},'',true).seq;
  s.chapter.status='won';s.chapter.victory={id:'first-for-second',tick:36000,evidenceId:t.resultEventId};emit(s,'ChapterWon',{victory:s.chapter.victory},'',true);
  s=planNextEra(planMillennium(s).state).state;
  for(const contract of ['glowflower','tidespore','saltseed']){const trip=planDeparture(s,contract);assert.ok(trip.ok);finishSamples(trip.state);s=planReturn(trip.state).state;}
  for(const a of s.agents)if(a.kind!=='companion')a.pacifiedUntil=1e9;
  while(s.agents.filter(a=>a.kind==='companion').length<9)s.agents.push(makeAgent(`g-${s.nextId++}`,'companion',7,11));
  for(const [i,kind] of ['garden','garden','cache'].entries())s.buildings.push({id:`goal-building-${i}`,kind,x:10+i*3,z:12,progress:1});
  Object.assign(s.colony,{capacity:10,storage:200,food:180});assert.ok(secondChapterProgress(s).ready);
  updateChapter(s);ticks(s,110);assert.equal(s.chapter.status,'active');s.colony.food=29;updateChapter(s);assert.equal(s.chapter.stableSinceTick,null);
  s.colony.food=180;ticks(s,120);assert.equal(s.chapter.status,'active');ticks(s,.1);assert.equal(s.chapter.status,'won');
  assert.equal(s.chapterEvidence.filter(e=>e.type==='ChapterWon'&&e.victory.chapterId==='second_island').length,1);assert.ok(deserialize(serialize(s)));
  const once=s.chapter.victory.id;ticks(s,2);assert.equal(s.chapter.victory.id,once);
});
