import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, makeAgent } from '../src/core/state.js';
import { step } from '../src/core/simulation.js';
import { NEST, QUESTS } from '../src/core/config.js';
import { clockInfo } from '../src/core/clock.js';
import { updateWeather, reserveTrialWeather, seaLevel } from '../src/core/weather.js';
import { createArrival, feedArrival, migrationTick } from '../src/core/migration.js';
import { seaRoutes } from '../src/core/sea-navigation.js';
import { startTrial, reinforceNest, updateChapter, interruptTrial } from '../src/core/chapter.js';
import { heightAt, walkable } from '../src/core/terrain.js';
import { provisions, moveTo, stopPlayer } from '../src/core/actions.js';
import { startCreatureAction } from '../src/core/creature-interactions.js';
import { serialize, deserialize, migrateLegacy } from '../src/core/persistence.js';
import { createState as legacyState } from '../legacy/src/core/state.js';
import { ecologyTick, consumeEcologyInbox, expireEcology } from '../src/core/ecology.js';
import { validateChoices } from '../src/core/ecology-commands.js';

function fresh(){const s=createState(73429);s.started=true;return s;}
function run(s,seconds){for(let i=0;i<seconds*20;i++)step(s,.05);}
function until(s,predicate,maxSeconds=600){for(let i=0;i<maxSeconds*20;i++){if(predicate())return;step(s,.05);}assert.ok(predicate(),`condition timed out: ${JSON.stringify({time:s.time,player:{x:s.player.x,z:s.player.z,target:s.player.target,path:s.player.path,carry:s.player.carry},arrivals:s.ecology.arrivals,marine:s.agents.filter(a=>a.origin==='marine').map(a=>({id:a.id,x:a.x,z:a.z,phase:a.marinePhase,behavior:a.behavior})),notifications:s.notifications})}`);}
function prepared(){
  const s=fresh();s.time=1800;s.clock.tick=36000;updateWeather(s);
  s.completed=QUESTS.map(q=>q.id);s.quest=6;s.discovered=['meadow','grove','ridge','wetland'];s.parts=['legs','shell','tail','reservoir'];
  // Keep a living ecosystem while isolating the chapter trial from unrelated attacks.
  for(const a of s.agents)if(a.kind!=='companion')a.pacifiedUntil=1e9;
  while(s.agents.filter(a=>a.kind==='companion').length<9)s.agents.push(makeAgent(`companion-${s.nextId++}`,'companion',NEST.x+2,NEST.z+1));
  Object.assign(s.colony,{capacity:10,storage:200,food:160,material:150});
  for(const [i,kind] of ['nest','garden','garden','cache'].entries())s.buildings.push({id:`finished-${i}`,kind,x:10+i*2,z:10,progress:1});
  Object.assign(s.player,NEST);s.ecology.modelEnabled=false;s.ecology.nextIslandSlot=100;s.ecology.nextMarineSlot=100;
  s.ecology.initialized=true;
  return s;
}

test('rising tide lets a non-swimmer physically retreat to dry ground',()=>{
  const s=fresh();s.agents=[];
  let shore=null;
  for(let x=-25;x<-12&&!shore;x+=.2)for(let z=3;z<18;z+=.2)if(heightAt(x,z)>-.3&&heightAt(x,z)<-.2&&walkable(x,z,false,{level:.16})){shore={x,z};break;}
  assert.ok(shore);Object.assign(s.player,shore);s.time=80;s.clock.tick=1600;updateWeather(s);
  const start={...shore};let maximumStep=0;
  for(let i=0;i<400;i++){const before={x:s.player.x,z:s.player.z};step(s,.05);maximumStep=Math.max(maximumStep,Math.hypot(s.player.x-before.x,s.player.z-before.z));if(walkable(s.player.x,s.player.z,false,{level:.36}))break;}
  assert.ok(walkable(s.player.x,s.player.z,false,{level:.36}));assert.ok(Math.hypot(s.player.x-start.x,s.player.z-start.z)>.1);assert.ok(maximumStep<.3);
});
test('a system-interrupted trial refunds exactly once, conserving full-storage overflow',()=>{
  const s=prepared();assert.ok(startTrial(s).ok);assert.ok(reinforceNest(s).ok);s.colony.material=s.colony.storage;
  interruptTrial(s,'route_unavailable');interruptTrial(s,'route_unavailable');
  assert.equal(s.colony.materialRefund,12);assert.equal(s.chapterEvidence.filter(e=>e.type==='NestReinforcementRefunded').length,1);
  s.colony.material-=5;updateChapter(s);assert.equal(s.colony.material,s.colony.storage);assert.equal(s.colony.materialRefund,7);
  assert.ok(deserialize(serialize(s)));assert.equal(s.chapter.trial.completedRoutes.length,0);
});

test('calendar days and completed elapsed days stay distinct',()=>{
  for(const [seconds,day,hour,elapsedDays] of [[0,1,8,0],[240,2,0,0],[360,2,8,1],[1800,6,8,5]]){
    const actual=clockInfo({time:seconds});assert.equal(actual.day,day);assert.equal(actual.hour,hour);assert.equal(actual.elapsedDays,elapsedDays);
  }
});
test('weather forecast is persisted and pauses without consuming random draws',()=>{
  const a=fresh(),b=deserialize(serialize(a));b.started=true;
  run(a,250);run(b,250);assert.deepEqual(a.weatherV3,b.weatherV3);assert.deepEqual(a.randomStreams,b.randomStreams);
  a.paused=true;const previous=serialize(a);run(a,20);const after=serialize(a);
  assert.deepEqual({...JSON.parse(previous),savedAt:0},{...JSON.parse(after),savedAt:0});
});
test('a reserved squall follows the published forecast and matches a tide peak',()=>{
  const s=fresh(),published=structuredClone(s.weatherV3.schedule),w=reserveTrialWeather(s);
  assert.deepEqual(s.weatherV3.schedule.slice(0,published.length),published);assert.ok(w.start>=s.clock.tick+1200);
  assert.ok(seaLevel(s,(w.start+w.end)/40)>.35);
});
test('sea routes have real foot approaches and warning prevents instant landing',()=>{
  const s=fresh(),routes=seaRoutes();assert.ok(routes.length>=2);assert.ok(routes.some(r=>r.trialEligible));
  const arrival=createArrival(s,{routeId:routes[0].id});assert.ok(arrival);
  run(s,50);assert.ok(arrival.roster.every(r=>s.agents.find(a=>a.id===r.id).marinePhase!=='onshore'));
  run(s,30);assert.ok(arrival.roster.some(r=>s.agents.find(a=>a.id===r.id)?.marinePhase==='onshore'));
});
test('marine reservations enforce quotas and defeated visitors never respawn after 150 seconds',()=>{
  const s=fresh(),a=createArrival(s),b=createArrival(s);assert.ok(a&&b);assert.equal(createArrival(s),null);
  for(const row of a.roster){const unit=s.agents.find(x=>x.id===row.id);unit.hp=0;}
  migrationTick(s);assert.equal(a.status,'resolved');run(s,151);
  assert.ok(a.roster.every(row=>!s.agents.some(x=>x.id===row.id)));assert.equal(createArrival(s),null);
});
test('provisions remain in a twelve-slot bag and transfers do not mint quest progress',()=>{
  const s=fresh();Object.assign(s.player,NEST);s.agents=[];s.colony.food=40;
  const metric=s.metrics.deposited;assert.ok(provisions(s).ok);assert.equal(s.colony.food,32);assert.equal(s.player.carry.food,8);
  run(s,1);assert.equal(s.player.carry.food,8);assert.equal(s.metrics.deposited,metric);
  assert.equal(provisions(s).ok,false);const before=s.colony.food+s.player.carry.food;
  assert.ok(provisions(s,true).ok);assert.equal(s.player.carry.food,0);assert.equal(s.colony.food,before);assert.equal(s.metrics.deposited,metric);
});
test('feeding charges exactly once and refuses insufficient cargo',()=>{
  const s=fresh(),arrival=createArrival(s),a=s.agents.find(x=>x.id===arrival.roster[0].id);
  s.player.carry.food=8;s.player.reservedFood=8;assert.ok(feedArrival(s,a).ok);assert.equal(s.player.carry.food,0);assert.equal(s.player.reservedFood,0);
  assert.equal(feedArrival(s,a).ok,false);assert.equal(arrival.feedCount,1);
});
test('six completed tutorial goals never suffice for chapter victory',()=>{
  const s=fresh();s.completed=QUESTS.map(q=>q.id);s.quest=6;run(s,1801);assert.equal(s.chapter.status,'active');
});
test('sheltering completes a real trial, then stable home life wins exactly once',()=>{
  const s=prepared();s.agents[0].job='guard';s.agents[1].job='guard';
  assert.ok(startTrial(s).ok);const t=s.chapter.trial,before=s.colony.material;
  assert.ok(reinforceNest(s).ok);assert.equal(s.colony.material,before-12);assert.equal(reinforceNest(s).ok,false);
  until(s,()=>['resolved','failed'].includes(t.status));assert.equal(t.status,'resolved');assert.ok(t.completedRoutes.includes('shelter'));
  until(s,()=>s.chapter.status==='won',200);const id=s.chapter.victory.id;run(s,5);assert.equal(s.chapter.victory.id,id);
  const saved=deserialize(serialize(s));assert.ok(saved);assert.equal(saved.chapter.status,'won');
});
test('coexistence uses two physical feeding trips and a peaceful departure',()=>{
  const s=prepared();s.parts=['legs','shell','horns'];s.player.carry={food:0,material:0};
  for(const a of s.agents)a.job='forage';
  assert.ok(startTrial(s).ok);const t=s.chapter.trial,arrival=s.ecology.arrivals.find(a=>a.id===t.arrivalId),route=seaRoutes().find(r=>r.id===arrival.routeId);
  assert.ok(provisions(s).ok);assert.ok(moveTo(s,route.land).ok);until(s,()=>s.clock.tick>=t.startTick+100);
  const target=s.agents.find(a=>a.id===arrival.roster[0].id);
  assert.ok(startCreatureAction(s,target.id,'feed').ok);until(s,()=>arrival.feedCount===1,30);
  assert.ok(moveTo(s,NEST).ok);until(s,()=>Math.hypot(s.player.x-NEST.x,s.player.z-NEST.z)<3,30);
  assert.ok(provisions(s).ok);const secondFeed=startCreatureAction(s,target.id,'feed');assert.ok(secondFeed.ok,secondFeed.reason);until(s,()=>arrival.feedCount===2,40);
  stopPlayer(s);until(s,()=>['resolved','failed'].includes(t.status),180);
  assert.equal(t.status,'resolved');assert.ok(t.completedRoutes.includes('coexist'));assert.equal(s.player.carry.food,0);
});
test('player-side damage can repel a trial without killing the whole species',()=>{
  const s=prepared();s.parts=['legs','shell','horns'];assert.ok(startTrial(s).ok);const t=s.chapter.trial,a=s.ecology.arrivals.find(x=>x.id===t.arrivalId),r=seaRoutes().find(x=>x.id===a.routeId);
  assert.ok(moveTo(s,r.land).ok);until(s,()=>s.clock.tick>=t.startTick+120);
  const victim=s.agents.find(x=>x.id===a.roster[0].id);assert.ok(startCreatureAction(s,victim.id,'hunt').ok);
  until(s,()=>a.repulsedByPlayer,30);stopPlayer(s);moveTo(s,NEST);
  until(s,()=>t.status==='resolved',150);assert.ok(t.completedRoutes.includes('repelled'));assert.ok(a.roster.some(r=>r.status==='departed'));
});
test('a one-tick food shortage interrupts the complete stability window',()=>{
  const s=prepared();s.chapter.trial={id:'done',status:'resolved',completedRoutes:['coexist']};
  updateChapter(s);assert.equal(s.chapter.stableSinceTick,s.clock.tick);
  s.clock.tick+=100;s.time=s.clock.tick/20;s.colony.food=29.99;updateChapter(s);assert.equal(s.chapter.stableSinceTick,null);
  s.colony.food=50;updateChapter(s);assert.equal(s.chapter.stableSinceTick,null);s.clock.tick++;s.time=s.clock.tick/20;updateChapter(s);assert.equal(s.chapter.stableSinceTick,s.clock.tick);
});
test('V2 migration preserves original progress and does not award a free V3 win',()=>{
  const old=legacyState(93);old.time=2000;old.weather='rain';old.weatherAt=2050;old.completed=QUESTS.map(q=>q.id);old.quest=6;old.colony.food=31;
  const raw=JSON.stringify(old),migrated=migrateLegacy(raw);assert.ok(migrated);assert.equal(JSON.stringify(old),raw);
  assert.equal(migrated.version,3);assert.equal(migrated.time,2000);assert.equal(migrated.colony.food,31);assert.equal(migrated.weather,'rain');
  assert.equal(migrated.chapter.status,'active');assert.equal(migrated.chapter.trial,null);assert.equal(migrated.ecology.adaptationUntilTick,52000);
});
test('strict proposals reject state mutation, false evidence and both copies of a duplicate',()=>{
  const s=fresh();s.time=120;s.clock.tick=2400;s.ecology.modelEnabled=true;s.ecology.runEpoch='test';ecologyTick(s);
  const batch=s.ecology.outbox[0],o=batch.opportunities[0],c={...o.allowed_choices[0],role:o.role,opportunity_id:o.id,basis_ids:o.basis_ids.slice(0,1),reason:'安静地继续活动。'};
  assert.equal(validateChoices({schema_version:1,choices:[c]},batch).accepted.length,1);
  for(const choice of [{...c,hp:999},{...c,basis_ids:['fake']}])assert.equal(validateChoices({schema_version:1,choices:[choice]},batch).accepted.length,0);
  assert.equal(validateChoices({schema_version:1,choices:[c,c]},batch).accepted.length,0);
  const before=s.recentEvents.filter(e=>e.source==='model').length;
  s.clock.tick=batch.acceptByTick+1;s.time=s.clock.tick/20;s.ecology.inbox.push({batchId:batch.id,output:{schema_version:1,choices:[c]}});expireEcology(s);consumeEcologyInbox(s);
  assert.equal(s.recentEvents.filter(e=>e.source==='model').length,before);
});
test('wetland return follows the first grid connector without cutting a trunk corner',()=>{
  const s=fresh();s.parts=['legs'];s.agents=[];
  Object.assign(s.player,{x:-7.303752900738637,z:17.48431604475886});
  assert.ok(moveTo(s,NEST).ok);
  until(s,()=>Math.hypot(s.player.x-NEST.x,s.player.z-NEST.z)<1,12);
  assert.ok(s.player.hp>0);
});
