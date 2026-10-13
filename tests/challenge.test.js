import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,makeAgent} from '../src/core/state.js';
import {NEST,QUESTS} from '../src/core/config.js';
import {step} from '../src/core/simulation.js';
import {initGroups} from '../src/core/ecology.js';
import {hostileTarget} from '../src/core/hostility.js';
import {environment,updateWeather} from '../src/core/weather.js';
import {createArrival} from '../src/core/migration.js';
import {seaRoutes} from '../src/core/sea-navigation.js';
import {serialize,deserialize} from '../src/core/persistence.js';

function fresh(){const s=createState();s.started=true;s.agents=[];return s;}
function run(s,seconds,input={}){for(let i=0;i<seconds*20;i++)step(s,.05,input);}
function weather(s,id){s.weather=id;s.weatherV3.current=id;s.weatherV3.schedule=[{id,start:s.clock.tick,end:s.clock.tick+24000}];}
function predatorScene(){
  const s=fresh(),a=makeAgent('hunter','predator',22,-23,'forage','emberfang');s.agents.push(a);Object.assign(s.player,{x:23.5,z:-23});
  initGroups(s);const g=s.ecology.groups[0];g.intent={actionId:'rest_at_shelter',target:{x:29,z:-23},untilTick:10000,source:'model'};
  a.path=[g.intent.target];a.decision=5;return {s,a,g};
}
test('a resting model intent cannot suppress immediate hostile attacks',()=>{
  const {s,a,g}=predatorScene();const hp=s.player.hp;run(s,.5);
  assert.ok(s.player.hp<hp);assert.equal(a.behavior,'attack');assert.equal(g.intent.actionId,'rest_at_shelter');
  assert.equal(s.player.lastAttackerId,a.id);
});
test('nearby victims are pursued even while the ecological controller is waiting',()=>{
  const {s,a}=predatorScene();s.player.x=27;const before=Math.hypot(a.x-s.player.x,a.z-s.player.z);run(s,2);
  assert.ok(Math.hypot(a.x-s.player.x,a.z-s.player.z)<before);assert.ok(s.player.hp<100);
});
test('a predator that roamed away from home still defends its immediate surroundings',()=>{
  const {s,a}=predatorScene();a.homeX=-15;run(s,.5);assert.ok(s.player.hp<100);
});
test('pacification, adopted creatures, and the nest refuge keep their meaning',()=>{
  const {s,a}=predatorScene();a.pacifiedUntil=10;run(s,1);assert.equal(s.player.hp,100);
  a.pacifiedUntil=0;a.dominated=true;run(s,1);assert.equal(s.player.hp,100);
  a.dominated=false;Object.assign(s.player,NEST);Object.assign(a,{x:NEST.x+7,z:NEST.z,homeX:NEST.x+7,homeZ:NEST.z});
  assert.equal(hostileTarget(s,a),null);
});
test('night extends detection but mist and distance can still hide the player',()=>{
  const {s,a}=predatorScene();s.player.x=a.x+9.6;assert.equal(hostileTarget(s,a),null);
  s.time=210;s.clock.tick=4200;assert.equal(hostileTarget(s,a)?.id,'player');
  weather(s,'mist');assert.equal(hostileTarget(s,a),null);
  weather(s,'clear');s.player.x=a.x+30;assert.equal(hostileTarget(s,a),null);
});
test('landed reefjaws attack automatically and stop when departure begins',()=>{
  const s=fresh();s.time=700;s.clock.tick=14000;s.completed=QUESTS.map(q=>q.id);s.quest=6;updateWeather(s);
  const route=seaRoutes()[0],arrival=createArrival(s,{species:'reefjaw',routeId:route.id});assert.ok(arrival);
  s.clock.tick=arrival.startTick;s.time=s.clock.tick/20;updateWeather(s);
  const a=s.agents.find(a=>a.id===arrival.roster[0].id);Object.assign(a,{...route.land,marinePhase:'onshore'});Object.assign(s.player,{x:a.x+1.5,z:a.z});
  run(s,.5);assert.ok(s.player.hp<100);
  arrival.status='departing';const before=s.player.hp;run(s,.5);assert.equal(s.player.hp,before);
});
test('rain soaks the ground, survives reload, and dries gradually only while playing',()=>{
  const s=fresh();weather(s,'rain');run(s,45);assert.ok(s.weatherV3.groundWetness>.99);
  const restored=deserialize(serialize(s));assert.ok(restored);assert.equal(restored.weatherV3.groundWetness,s.weatherV3.groundWetness);
  restored.paused=true;const before=structuredClone(restored.weatherV3);run(restored,30);assert.deepEqual(restored.weatherV3,before);
  restored.paused=false;weather(restored,'clear');run(restored,30);assert.ok(restored.weatherV3.groundWetness>.65&&restored.weatherV3.groundWetness<.75);
  run(restored,80);assert.equal(restored.weatherV3.groundWetness,0);
});
test('wet terrain affects actual walking; shelter and fins mitigate it',()=>{
  const dry=fresh();Object.assign(dry.player,{x:13,z:10});const wet=structuredClone(dry);wet.weatherV3.groundWetness=1;
  run(dry,.5,{x:1,z:0});run(wet,.5,{x:1,z:0});assert.ok(wet.player.x<dry.player.x-.1);
  weather(wet,'squall');Object.assign(wet.player,{x:-10,z:20});const mud=environment(wet,wet.player);
  wet.parts=['fins'];assert.ok(environment(wet,wet.player).movement>mud.movement);
  Object.assign(wet.player,NEST);const home=environment(wet,wet.player);assert.equal(home.movement,1);assert.equal(home.harvest,1);assert.equal(home.recovery,1);
});
test('storm food demand rises without hidden resource deductions',()=>{
  const clear=fresh(),storm=fresh();weather(clear,'clear');weather(storm,'squall');const food=clear.colony.food;
  run(clear,60);run(storm,60);assert.ok(Math.abs((food-storm.colony.food)/(food-clear.colony.food)-1.12)<1e-7);
});
test('existing V3 saves load without ground fields and invalid wetness is rejected',()=>{
  const s=fresh();delete s.weatherV3.groundWetness;delete s.weatherV3.surfaceTick;
  const migrated=deserialize(serialize(s));assert.ok(migrated);run(migrated,1);assert.ok(Number.isFinite(migrated.weatherV3.groundWetness));
  migrated.weatherV3.groundWetness=8;assert.equal(deserialize(serialize(migrated)),null);
});
