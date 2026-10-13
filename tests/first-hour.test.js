import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,makeAgent,population} from '../src/core/state.js';
import {step} from '../src/core/simulation.js';
import {serialize,deserialize} from '../src/core/persistence.js';
import {planDeparture,planReturn,departureChoice} from '../src/core/journey.js';
import {removeDeadCompanions} from '../src/core/mortality.js';
import {habitatInfo,habitatTick} from '../src/core/ecosystem.js';
import {initGroups} from '../src/core/ecology.js';
import {rivalCapacity,rivalTick,feedRivals} from '../src/core/rivals.js';
import {nextGuide,nextObjective} from '../src/core/onboarding.js';
import {visibleSystems} from '../src/ui/progression.js';
import {updateWeather} from '../src/core/weather.js';
import {QUESTS} from '../src/core/config.js';
import {chapterProgress,startTrial,updateChapter} from '../src/core/chapter.js';
import {emit} from '../src/core/events.js';
import {planMillennium,planNextEra} from '../src/core/journey.js';

const fresh=()=>{const s=createState();s.started=true;s.colony.breedingAllowed=false;return s;};
const run=(s,t)=>{for(let i=0;i<t*20;i++)step(s,.05);};
test('a fatal predator attack removes a companion, their cargo, target and population permanently',()=>{
  const s=fresh(),victim=s.agents.find(a=>a.kind==='companion');
  for(const a of s.agents)a.job='guard';
  Object.assign(victim,{x:20,z:0,hp:.1,carry:{food:4,material:3}});
  const predator=makeAgent('fatal-predator','predator',20,1,'forage','emberfang');s.agents.push(predator);s.selected=victim;
  step(s);assert.equal(s.agents.some(a=>a.id===victim.id),false);assert.equal(population(s),5);assert.equal(s.selected,null);
  assert.equal(victim.hp,0);assert.equal(victim.recoverUntil,undefined);assert.equal(victim.carry.food,4);
  assert.equal(s.recentEvents.filter(e=>e.type==='CompanionDied').length,1);assert.equal(s.recentEvents.filter(e=>e.type==='CombatRecovery'&&!e.player).length,0);
  run(s,25);const loaded=deserialize(serialize(s));assert.ok(loaded);assert.equal(loaded.agents.some(a=>a.id===victim.id),false);assert.equal(population(loaded),5);
});
test('only the protagonist recovers at home after fatal combat',()=>{
  const s=fresh();Object.assign(s.player,{x:20,z:0,hp:.1});s.agents=[makeAgent('fatal','predator',20,1,'forage','emberfang')];
  step(s);assert.equal(s.player.hp,50);assert.ok(s.player.recoverUntil>s.time);assert.ok(Math.hypot(s.player.x-5,s.player.z-9)<4);
  assert.equal(s.recentEvents.some(e=>e.type==='CompanionDied'),false);
});
test('a living wounded guard physically retreats and rests; retreating is not a resurrection',()=>{
  const s=fresh(),a=s.agents.find(a=>a.kind==='companion'&&a.job==='guard');s.agents=[a];Object.assign(a,{x:20,z:0,hp:20});
  step(s);assert.equal(a.retreating,true);assert.ok(Math.hypot(a.x-20,a.z)<.4);assert.ok(Math.hypot(a.x-5,a.z-9)>10);
  run(s,30);assert.equal(a.retreating,false);assert.ok(a.hp>=75);assert.equal(population(s),2);assert.equal(s.recentEvents.some(e=>e.type==='CompanionDied'),false);
});
test('starvation can kill companions while retaining the protagonist recovery floor',()=>{
  const s=fresh(),a=s.agents.find(a=>a.kind==='companion');s.agents=[a];a.job='guard';a.hp=.001;a.satiety=0;s.player.hp=10;s.player.satiety=0;s.colony.food=0;
  step(s);assert.equal(population(s),1);assert.equal(s.player.hp,10);assert.equal(s.recentEvents.find(e=>e.type==='CompanionDied').cause,'hunger');
});
test('expedition casualties survive reload and every return mode without reviving the frozen copy',()=>{
  for(const reason of ['normal','emergency','injured','timeout']){
    const s=fresh();Object.assign(s.player,{x:5,z:9});s.completed=['evolve','build'];s.parts=['legs'];s.colony.food=60;
    const trip=planDeparture(s,'glowflower').state,party=[...trip.journey.active.party];
    for(const a of trip.agents.filter(a=>party.includes(a.id)))a.hp=0;
    removeDeadCompanions(trip);assert.equal(population(trip),1);assert.deepEqual(trip.journey.active.casualties,party);
    const loaded=deserialize(serialize(trip));assert.ok(loaded);const returned=planReturn(loaded,reason);assert.ok(returned.ok);
    assert.equal(population(returned.state),4);assert.equal(returned.state.metrics.population,4);assert.deepEqual(returned.receipt.casualties,party);
    assert.ok(party.every(id=>!returned.state.agents.some(a=>a.id===id)));assert.ok(deserialize(serialize(returned.state)));
  }
});
test('a missing traveller without a casualty record remains an invalid save',()=>{
  const s=fresh();Object.assign(s.player,{x:5,z:9});s.completed=['evolve','build'];s.colony.food=60;const trip=planDeparture(s,'glowflower').state;
  trip.agents=trip.agents.filter(a=>a.id!==trip.journey.active.party[0]);assert.equal(deserialize(serialize(trip)),null);
  trip.journey.active.casualties=['invented'];assert.equal(deserialize(serialize(trip)),null);
});
test('ordinary expeditions require recovery and choose healthy adults, while emergency escape stays available',()=>{
  const s=fresh();Object.assign(s.player,{x:5,z:9,hp:45});s.completed=['evolve','build'];s.colony.food=60;
  assert.equal(departureChoice(s,'glowflower').ok,false);s.colony.food=0;assert.equal(departureChoice(s,'glowflower',true).ok,true);
  s.colony.food=60;s.player.hp=100;const wounded=s.agents.find(a=>a.kind==='companion'&&a.job==='guard');wounded.hp=20;
  const trip=planDeparture(s,'glowflower');assert.ok(trip.ok);assert.ok(!trip.state.journey.active.party.includes(wounded.id));
  for(const a of s.agents.filter(a=>a.kind==='companion'))a.hp=20;assert.equal(departureChoice(s,'glowflower').ok,false);
});
test('old zero-health companion records are cleaned on load exactly once',()=>{
  const s=fresh();s.agents[0].hp=0;const loaded=deserialize(serialize(s));assert.ok(loaded);assert.equal(population(loaded),5);
  const again=deserialize(serialize(loaded));assert.equal(population(again),5);assert.equal(again.recentEvents.filter(e=>e.type==='CompanionDied').length,1);
});
test('the first objective remains visible between tutorial tips and recommends food before population',()=>{
  const s=fresh();s.metrics.gathered=2;assert.equal(nextGuide(s),null);assert.equal(nextObjective(s).target,'gather');
  s.metrics.gathered=6;s.metrics.deposited=6;s.quest=2;assert.equal(nextObjective(s).target,'evolve');
  s.parts=['legs'];s.metrics.evolved=1;s.quest=3;s.hints={guideV1:['gather','return','evolve']};assert.match(nextGuide(s).text,/浆果圃/);
});
test('newcomers only see menus once their next step can use them',()=>{
  const s=fresh();assert.deepEqual(visibleSystems(s),{evolve:false,colony:false,journal:false,journey:false,chapter:false,rally:false,weather:false});
  s.metrics.deposited=6;assert.equal(visibleSystems(s).evolve,true);assert.equal(visibleSystems(s).colony,false);
  s.metrics.evolved=1;assert.equal(visibleSystems(s).colony,true);assert.equal(visibleSystems(s).journey,false);
  Object.assign(s.player,{x:5,z:9});s.completed=['evolve','build'];s.discovered.push('grove');assert.equal(visibleSystems(s).journey,false);
  s.completed=QUESTS.map(q=>q.id);assert.equal(visibleSystems(s).journey,true);
  s.completed=['evolve','build'];s.survival.guideFood=true;assert.equal(visibleSystems(s).journey,false);
});
test('real away time advances chapter readiness while home clocks and stability remain local',()=>{
  const s=fresh();Object.assign(s.player,{x:5,z:9});s.time=600;s.clock.tick=12000;s.journey.totalAwayTime=300;s.lifetimeAwaySeconds=300;
  s.completed=QUESTS.map(q=>q.id);s.quest=6;updateWeather(s);assert.equal(chapterProgress(s).minimumSeconds,900);assert.equal(startTrial(s).ok,true);assert.equal(s.time,600);
  s.time=1200;s.clock.tick=24000;s.journey.totalAwayTime=600;s.lifetimeAwaySeconds=600;updateWeather(s);
  s.parts=['legs','shell','tail','reservoir'];s.discovered=['meadow','grove','ridge','wetland'];Object.assign(s.colony,{food:150,material:100,capacity:10,storage:200});
  while(population(s)<10)s.agents.push(makeAgent('settled-'+s.nextId++,'companion',6,10));
  for(const [i,kind] of ['nest','garden','garden','cache'].entries())s.buildings.push({id:'stable-'+i,kind,x:5+i,z:3,progress:1});
  const t={id:'lived-trial',arrivalId:'lived-arrival',status:'resolved',startTick:21000,endTick:23400,completedRoutes:['coexist']};
  t.resultEventId=emit(s,'TrialCompleted',{trialId:t.id,arrivalId:t.arrivalId,routes:t.completedRoutes},'',true).seq;s.chapter.trial=t;
  s.chapter.stableSinceTick=24000-3599;updateChapter(s);assert.equal(s.chapter.status,'active','away time cannot replace the final local care window');
  s.chapter.stableSinceTick=20400;updateChapter(s);assert.equal(s.chapter.status,'won');assert.equal(s.chapter.victory.tick,24000);assert.equal(s.chapter.victory.elapsedTicks,36000);
  assert.ok(deserialize(serialize(s)));const tampered=JSON.parse(serialize(s));tampered.chapter.victory.elapsedTicks++;assert.equal(deserialize(JSON.stringify(tampered)),null);
  const next=planNextEra(planMillennium(s).state);assert.ok(next.ok);assert.ok(deserialize(serialize(next.state)));
});
test('rivals gain bounded population space gradually and need a real breeding pair and food',()=>{
  const s=fresh();assert.equal(rivalCapacity(s),3);s.time=360;s.clock.tick=7200;updateWeather(s);assert.equal(rivalCapacity(s),4);
  const adults=s.agents.filter(a=>a.species==='emberfang');const prey=s.agents.find(a=>a.kind==='grazer');Object.assign(prey,{x:23,z:-20});
  for(const [i,a] of adults.entries())Object.assign(a,{x:21+i,z:-22,homeX:21+i,homeZ:-22});
  initGroups(s);assert.equal(habitatInfo(s).species.find(a=>a.id==='emberfang').breeding,false);
  feedRivals(s,prey);assert.equal(habitatInfo(s).species.find(a=>a.id==='emberfang').breeding,true);habitatTick(s,120);
  const young=s.agents.filter(a=>a.species==='emberfang'&&a.juvenileUntil>s.time);assert.equal(young.length,1);assert.equal(s.agents.filter(a=>a.species==='emberfang').length,4);
  assert.ok(young[0].groupId);assert.ok(s.ecology.groups.find(g=>g.id===young[0].groupId).memberIds.includes(young[0].id));
  assert.ok(Math.abs(s.habitatHealth.rivals.food-1.99)<1e-9);habitatTick(s,120);assert.equal(s.agents.filter(a=>a.species==='emberfang').length,4);
  s.time=9999;assert.equal(rivalCapacity(s),6);
});
test('rival territory expansion warns first, then requires physical travel to settle',()=>{
  const s=fresh();s.time=600;s.clock.tick=12000;updateWeather(s);s.weather=s.weatherV3.current='clear';
  s.agents.push(makeAgent('fourth-rival','predator',24,-20,'forage','emberfang'));for(const a of s.agents)if(a.kind!=='companion')a.pacifiedUntil=1e9;
  rivalTick(s);const plan=structuredClone(s.habitatHealth.rivals.plan);assert.ok(plan);assert.equal(plan.startsAt,645);
  assert.ok(s.recentEvents.some(e=>e.type==='RivalExpansionWarned'));const loaded=deserialize(serialize(s));assert.ok(loaded);
  let largest=0;for(let i=0;i<2000&&s.habitatHealth.rivals.stage===0;i++){const positions=s.agents.map(a=>({id:a.id,x:a.x,z:a.z}));step(s);for(const a of s.agents){const before=positions.find(b=>b.id===a.id);if(before)largest=Math.max(largest,Math.hypot(a.x-before.x,a.z-before.z));}}
  assert.equal(s.habitatHealth.rivals.stage,1);assert.ok(largest<.8);assert.ok(plan.members.every(id=>{const a=s.agents.find(a=>a.id===id);return Math.hypot(a.homeX-plan.target.x,a.homeZ-plan.target.z)<.1;}));
  assert.ok(deserialize(serialize(s)));
});
