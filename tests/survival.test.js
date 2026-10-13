import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,makeAgent} from '../src/core/state.js';
import {step} from '../src/core/simulation.js';
import {NEST,SPECIES} from '../src/core/config.js';
import {foodOutlook,settleFood,hatchChoice,startHatching,configureFood,recoveryFactor,plantSeeds} from '../src/core/food.js';
import {habitatTick,habitatInfo,configureHabitat,releaseYoung,immigrationPosition} from '../src/core/ecosystem.js';
import {isJuvenile,isResident} from '../src/core/survival-config.js';
import {serialize,deserialize} from '../src/core/persistence.js';
import {planDeparture,collectSample,planReturn} from '../src/core/journey.js';
import {biomeAt} from '../src/core/terrain.js';
import {interact,commandCompanion} from '../src/core/actions.js';
import {directAction} from '../src/core/direct-actions.js';
import {nextGuide,acknowledgeGuide} from '../src/core/onboarding.js';
import {updateWeather} from '../src/core/weather.js';
const fresh=()=>{const s=createState();s.started=true;s.colony.breedingAllowed=false;for(const a of s.agents){if(a.kind==='companion')a.job='guard';else a.pacifiedUntil=1e9;}return s;};
const run=(s,seconds)=>{for(let i=0;i<seconds*20;i++)step(s,.05);};
const spawn=id=>makeAgent(id,'companion',7,10);
const meal=(s,seconds)=>{for(let i=0;i<seconds*20;i++)settleFood(s,.05,spawn);};
function conservationTime(s,seconds){for(let i=0;i<seconds;i++){s.time++;s.clock.tick+=20;updateWeather(s);habitatTick(s);}}
function wipe(s){for(const a of s.agents)if(isResident(a)){a.hp=0;a.respawnAt=null;}s.habitatHealth.immigrationAt=1e9;}
function readyHome(){const s=fresh();s.colony.food=78;s.completed=['gather','home','evolve','build'];s.parts=['legs'];Object.assign(s.player,NEST);return s;}

test('one food settlement pays maintenance and actual stamina recovery without double charging',()=>{
  const s=fresh();s.colony.food=60;meal(s,5);assert.ok(Math.abs(s.colony.food-(60-.022*6*5))<1e-8);assert.equal(s.player.satiety,100);
  const before=s.colony.food;s.player.stamina=80;s.player.energyWanted=.4;settleFood(s,.05,spawn);
  assert.ok(Math.abs(before-s.colony.food-(.022*6*.05+.4*.003))<1e-9);
  assert.equal(s.player.stamina,80.4);assert.ok(Math.abs(s.survival.energyFoodSpent-.0012)<1e-9);
  const food=s.colony.food;s.player.energyWanted=0;settleFood(s,.05,spawn);assert.ok(Math.abs(food-s.colony.food-.022*6*.05)<1e-9);
});
test('empty stores give a four-minute satiety buffer and then real starvation damage',()=>{
  const s=fresh();s.colony.food=0;run(s,120);assert.ok(Math.abs(s.player.satiety-50)<.1);assert.equal(s.player.hp,100);
  run(s,120);assert.ok(s.player.satiety<.1);assert.ok(s.player.hp<100);const hp=s.player.hp;run(s,20);assert.ok(s.player.hp<hp);
  assert.equal(s.survival.level,'famine');assert.ok(s.survival.guideFood);
  const notices=s.recentEvents.filter(e=>e.type==='FoodDangerChanged');assert.equal(new Set(notices.map(e=>e.level)).size,notices.length);
});
test('legacy rations remain accounted for, body size changes demand, and retired styles add nothing',()=>{
  const normal=fresh(),ration=fresh();normal.colony.food=ration.colony.food=60;configureFood(ration,'foodPolicy','ration');meal(normal,60);meal(ration,60);
  assert.ok(ration.colony.food>normal.colony.food);assert.ok(ration.player.satiety<normal.player.satiety);assert.ok(recoveryFactor(ration,ration.player)<1);
  const baseline=foodOutlook(normal).demand;normal.style='guardian';assert.equal(foodOutlook(normal).demand,baseline);normal.style='hunter';normal.parts=['horns','tail'];assert.ok(Math.abs(foodOutlook(normal).demand-baseline*1.1)<1e-9);
});
test('stable food forecasts use current production, weather, crisis and juvenile appetite',()=>{
  const s=fresh();while(s.agents.filter(a=>a.kind==='companion').length<9)s.agents.push(spawn('c'+s.nextId++));
  s.colony.food=60;s.buildings.push({id:'g1',kind:'garden',x:5,z:2,progress:1},{id:'g2',kind:'garden',x:12,z:9,progress:1});
  assert.ok(Math.abs(foodOutlook(s).net+3.2)<1e-9);assert.ok(Math.abs(foodOutlook(s).reserveMinutes-18.75)<1e-9);
  s.weather=s.weatherV3.current='rain';assert.ok(foodOutlook(s).income>10);
  s.weather=s.weatherV3.current='squall';assert.ok(foodOutlook(s).income<10);assert.ok(foodOutlook(s).demand>13.2);
  s.weather=s.weatherV3.current='clear';s.habitatHealth.stress=1;assert.equal(foodOutlook(s).income,7);
  s.agents.find(a=>a.kind==='companion').juvenileUntil=120;assert.ok(Math.abs(foodOutlook(s).demand-12.54)<1e-9);
});
test('automatic hatching reserves three minutes, obeys the cap, and preserves a paused egg',()=>{
  const s=fresh();s.colony.breedingAllowed=true;s.colony.capacity=10;s.colony.food=40;s.colony.nextAutoHatchAt=0;
  assert.equal(hatchChoice(s,true).ok,false);s.colony.food=60;assert.equal(hatchChoice(s,true).ok,true);
  assert.equal(startHatching(s,true).ok,true);assert.equal(s.colony.food,42);assert.equal(s.colony.nextAutoHatchAt,120);
  const remaining=s.colony.egg.remaining;configureFood(s,'breedingAllowed',false);meal(s,5);assert.equal(s.colony.egg.remaining,remaining);
  configureFood(s,'breedingAllowed',true);s.colony.populationLimit=6;meal(s,31);assert.equal(s.agents.filter(a=>a.kind==='companion').length,5);assert.ok(s.colony.egg);
  s.colony.populationLimit=7;settleFood(s,.05,spawn);assert.equal(s.agents.filter(a=>a.kind==='companion').length,6);assert.equal(s.colony.egg,null);
  assert.equal(hatchChoice(s,true).ok,false);
  const growing=fresh();growing.colony.breedingAllowed=true;growing.colony.nextAutoHatchAt=0;growing.colony.capacity=10;growing.colony.food=48;
  const young=spawn('growing');young.juvenileUntil=120;growing.agents.push(young);assert.equal(hatchChoice(growing,true).ok,false,'the reserve accounts for existing juveniles becoming adults within three minutes');
});
test('juveniles are actual half-ration members that cannot work or travel until they mature',()=>{
  const s=readyHome(),child=spawn('child');child.juvenileUntil=120;child.job='build';s.agents.push(child);
  s.buildings.push({id:'work',kind:'garden',x:7,z:10,progress:0});
  assert.equal(commandCompanion(s,child.id,'forage').ok,false);run(s,5);assert.equal(s.buildings.at(-1).progress,0);assert.equal(child.behavior,'young');
  const away=planDeparture(s,'glowflower').state;assert.ok(!away.journey.active.party.includes(child.id));
  s.time=119.95;s.clock.tick=2399;step(s,.05);assert.equal(isJuvenile(s,child),false);assert.equal(child.juvenileUntil,0);
});
test('pause and loading a save cannot spend food or advance growth and ecology',()=>{
  const s=fresh();s.agents[0].juvenileUntil=120;s.habitatHealth.critical=true;s.habitatHealth.stress=.4;s.paused=true;
  const before={time:s.time,food:s.colony.food,satiety:s.player.satiety,child:s.agents[0].juvenileUntil,stress:s.habitatHealth.stress};run(s,300);
  const loaded=deserialize(serialize(s));assert.ok(loaded);assert.deepEqual({time:loaded.time,food:loaded.colony.food,satiety:loaded.player.satiety,child:loaded.agents[0].juvenileUntil,stress:loaded.habitatHealth.stress},before);
});
test('extinction never uses the old respawn timer and consequences ramp over 120 seconds',()=>{
  const s=fresh();wipe(s);for(const a of s.agents.filter(a=>a.hp===0))a.respawnAt=1;
  run(s,60);assert.equal(habitatInfo(s).total,0);assert.equal(s.habitatHealth.critical,true);assert.ok(Math.abs(s.habitatHealth.stress-.5)<.02);
  run(s,100);assert.equal(habitatInfo(s).total,0);assert.equal(s.habitatHealth.stress,1);assert.equal(s.habitatHealth.extinct.length,4);assert.ok(deserialize(serialize(s)));
});
test('natural births need a mature pair and real food; a lone survivor cannot replenish',()=>{
  const s=fresh(),parents=s.agents.filter(a=>a.species==='mossback');const food=s.resources.find(r=>r.kind==='food'&&!r.coast&&Math.hypot(r.x-5,r.z-9)>13&&biomeAt(r.x,r.z,s).id==='meadow');
  s.agents=s.agents.filter(a=>a.kind==='companion');
  Object.assign(parents[0],{x:food.x,z:food.z});s.agents.push(parents[0]);conservationTime(s,130);assert.equal(s.agents.filter(a=>a.species==='mossback').length,1);
  Object.assign(parents[1],{x:food.x+.5,z:food.z});s.agents.push(parents[1]);const amount=food.amount;conservationTime(s,120);
  assert.equal(s.agents.filter(a=>a.species==='mossback').length,3);assert.equal(food.amount,amount-2);assert.ok(s.agents.some(a=>a.species==='mossback'&&isJuvenile(s,a)));
});
test('protected sites stop voluntary hunts and reserve fruit, while actual self defence remains possible',()=>{
  const s=fresh(),fruit=s.resources[0];configureHabitat(s,'protected',biomeAt(fruit.x,fruit.z,s).id);configureHabitat(s,'reserveFruit',true);
  fruit.amount=6;Object.assign(s.player,{x:fruit.x,z:fruit.z});assert.ok(directAction(s,{type:'resource',entity:fruit}).ok);run(s,10);assert.ok(fruit.amount>=4);assert.equal(s.player.carry.food,2);
  Object.assign(s.player,{x:15,z:21,target:null,path:[]});const enemy=makeAgent('local-attacker','predator',16.4,21,'guard','emberfang');s.agents.push(enemy);
  assert.equal(directAction(s,{type:'enemy',entity:enemy}).ok,false);run(s,.15);assert.ok(s.player.hp<100);
  assert.equal(directAction(s,{type:'enemy',entity:enemy}).ok,true);const hp=enemy.hp;run(s,.1);assert.ok(enemy.hp<hp);
});
test('three released pairs mature before a two-species, sixty-second ecological recovery',()=>{
  const s=fresh();wipe(s);conservationTime(s,120);Object.assign(s.player,NEST);s.colony.nursery={mossback:2,reedbeak:2,glowbug:2};
  for(const species of ['mossback','reedbeak','glowbug']){configureHabitat(s,'protected',SPECIES[species].biome);assert.ok(releaseYoung(s,species).ok,species);}
  assert.equal(habitatInfo(s).total,6);conservationTime(s,119);assert.equal(s.habitatHealth.critical,true);
  conservationTime(s,59);assert.equal(s.habitatHealth.critical,true);conservationTime(s,2);assert.equal(s.habitatHealth.critical,false);
  assert.equal(releaseYoung(s,'mossback').ok,false);assert.ok(deserialize(serialize(s)));
});
test('coastal recolonisation is announced and visibly travels before hatching',()=>{
  const s=fresh();wipe(s);s.habitatHealth.immigrationAt=0;conservationTime(s,1);assert.ok(s.habitatHealth.incoming);
  const first=immigrationPosition(s);conservationTime(s,30);const next=immigrationPosition(s);assert.ok(Math.hypot(next.x-first.x,next.z-first.z)>3);assert.equal(habitatInfo(s).total,0);
  conservationTime(s,30);assert.equal(habitatInfo(s).total,2);assert.equal(s.habitatHealth.incoming,null);
});
test('emergency travel works without food, freezes home, and preserves the travellers satiety',()=>{
  const s=fresh();s.colony.food=0;Object.assign(s.player,NEST);s.player.satiety=42;s.agents[0].juvenileUntil=120;
  const result=planDeparture(s,'glowflower',true);assert.ok(result.ok);const a=result.state,before=JSON.stringify(a.journey.home);
  assert.equal(a.colony.food,0);assert.equal(a.player.satiety,42);run(a,20);assert.equal(JSON.stringify(a.journey.home),before);
  const returned=planReturn(a,'emergency').state;assert.equal(returned.time,s.time);assert.equal(returned.player.satiety,a.player.satiety);assert.equal(returned.agents.find(x=>x.id===s.agents[0].id).juvenileUntil,120);assert.ok(deserialize(serialize(returned)));
});
test('egg and seed expeditions return actual collected cargo once, and planting changes production',()=>{
  for(const id of ['tidespore','saltseed']){
    const h=readyHome(),a=planDeparture(h,id).state;
    for(const r of a.resources.filter(r=>r.sampleIndex!==undefined)){assert.ok(collectSample(a,r));assert.equal(collectSample(a,r),false);}
    assert.ok(deserialize(serialize(a)));const result=planReturn(a).state;assert.ok(result);assert.equal(planReturn(result).ok,false);
    if(id==='tidespore')assert.equal(Object.values(result.colony.nursery).reduce((a,b)=>a+b,0),6);
    else{assert.equal(result.colony.seedStock,3);result.buildings.push({id:'garden',kind:'garden',x:5,z:2,progress:1});const before=foodOutlook(result).income;assert.ok(plantSeeds(result).ok);assert.equal(foodOutlook(result).income,before+.75);}
    assert.ok(deserialize(serialize(result)));
  }
});
test('coastal fallback food survives a crisis and tidal food requires an actual swimming evolution',()=>{
  const s=fresh(),shore=s.resources.find(r=>r.coast==='emergency'),tidal=s.resources.find(r=>r.coast==='tidal');shore.amount=0;s.habitatHealth.critical=true;s.habitatHealth.stress=1;
  assert.equal(interact(s,{type:'resource',entity:tidal}).ok,false);s.parts=['fins'];assert.ok(interact(s,{type:'resource',entity:tidal}).ok);run(s,90);
  assert.ok(shore.amount>1);assert.ok(s.metrics.gathered>=2,'the player physically reaches a tidal food source');
});
test('old saves migrate full satiety and settings while corrupt survival state is rejected',()=>{
  const s=fresh(),raw=JSON.parse(serialize(s));delete raw.survival;delete raw.habitatHealth;
  for(const key of ['foodPolicy','breedingAllowed','populationLimit','nextAutoHatchAt','seedStock','soilLevel','nursery'])delete raw.colony[key];
  for(const a of [raw.player,...raw.agents]){delete a.satiety;delete a.juvenileUntil;}
  const restored=deserialize(JSON.stringify(raw));assert.ok(restored);assert.equal(restored.player.satiety,100);assert.equal(restored.colony.populationLimit,10);
  for(const corrupt of [x=>x.player.satiety=101,x=>x.colony.populationLimit=-1,x=>x.colony.nursery={unknown:2},x=>x.colony.nursery=JSON.parse('{"__proto__":2}'),x=>x.habitatHealth.stress=2,x=>x.habitatHealth.protected=['grove','grove'],x=>x.survival.shortageSeconds=-1]){
    const bad=JSON.parse(serialize(s));corrupt(bad);assert.equal(deserialize(JSON.stringify(bad)),null);
  }
});
test('food and ecosystem guidance appears once and is available during later chapters and expeditions',()=>{
  const s=fresh();s.survival.guideFood=true;assert.equal(nextGuide(s).id,'food');acknowledgeGuide(s,'gather');assert.notEqual(nextGuide(s)?.id,'food');
  s.survival.guideEcology=true;s.journey.era=1;assert.equal(nextGuide(s).id,'ecosystem');acknowledgeGuide(s,'survival');assert.equal(nextGuide(s),null);
});
