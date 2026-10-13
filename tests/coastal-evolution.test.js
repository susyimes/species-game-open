import test from 'node:test';
import assert from 'node:assert/strict';
import { createState } from '../src/core/state.js';
import { evolve, moveTo, setAppearance } from '../src/core/actions.js';
import { step } from '../src/core/simulation.js';
import { NEST, SEA_RADIUS, APPEARANCES, speciesStats } from '../src/core/config.js';
import { edgeAt, walkable, TREES } from '../src/core/terrain.js';
import { seaRoutes } from '../src/core/sea-navigation.js';
import { navigation } from '../src/core/weather.js';
import { waterDepthAt } from '../src/core/water.js';
import { habitatStage } from '../src/core/habitat.js';
import { serialize, deserialize } from '../src/core/persistence.js';
import { dist } from '../src/core/math.js';

function fresh(){const s=createState();s.started=true;s.agents=[];s.resources=[];s.colony.dna=150;return s;}
function advance(s,seconds,input={}){for(let i=0;i<seconds*20;i++)step(s,.05,input);}

test('purchased fins cross all four coasts and physically swim home through changing tides',()=>{
  for(const target of [{x:0,z:54},{x:0,z:-54},{x:54,z:0},{x:-54,z:0}]){
    const s=fresh();assert.ok(Math.hypot(target.x,target.z)>edgeAt(target.x,target.z));
    assert.match(moveTo(s,target).reason,/潮汐侧鳍/);
    assert.ok(evolve(s,'fins').ok);assert.equal(s.colony.dna,124);assert.ok(walkable(target.x,target.z,true,navigation(s)));
    assert.ok(moveTo(s,target).ok);let maximumStep=0;
    for(let i=0;i<1100&&dist(s.player,target)>.4;i++){const before={x:s.player.x,z:s.player.z};step(s,.05);maximumStep=Math.max(maximumStep,dist(before,s.player));}
    assert.ok(dist(s.player,target)<.5,JSON.stringify({target,player:s.player}));
    assert.ok(waterDepthAt(s.player.x,s.player.z,s.time,s)>1.5);assert.ok(maximumStep<.3);
    assert.ok(moveTo(s,NEST).ok);advance(s,60);assert.ok(dist(s.player,NEST)<.5);
  }
});

test('direct movement crosses the former coast barrier but stays inside the near-sea boundary',()=>{
  const s=fresh(),route=seaRoutes()[0];Object.assign(s.player,route.land);assert.ok(evolve(s,'fins').ok);
  const input={x:Math.cos(route.theta),z:Math.sin(route.theta)};
  advance(s,25,input);assert.ok(Math.hypot(s.player.x,s.player.z)>edgeAt(s.player.x,s.player.z)+2);
  advance(s,45,input);assert.ok(Math.hypot(s.player.x,s.player.z)<=SEA_RADIUS);assert.ok(Math.hypot(s.player.x,s.player.z)>SEA_RADIUS-.5);
});

test('an at-sea save preserves fins and a working return path',()=>{
  const s=fresh();evolve(s,'fins');Object.assign(s.player,{x:0,z:54});s.player.path=[];
  const restored=deserialize(serialize(s));assert.ok(restored);assert.ok(speciesStats(restored.parts).swim);
  assert.ok(moveTo(restored,NEST).ok);advance(restored,60);assert.ok(dist(restored.player,NEST)<.5);
});

test('navigation distinguishes an outer-sea boundary and obstacles from missing fins',()=>{
  const s=fresh();assert.match(moveTo(s,{x:0,z:SEA_RADIUS+2}).reason,/外海/);
  evolve(s,'fins');const blocked=moveTo(s,TREES[0]);assert.equal(blocked.ok,false);assert.doesNotMatch(blocked.reason,/侧鳍/);assert.match(blocked.reason,/障碍/);
  assert.equal(moveTo(s,{x:NaN,z:0}).ok,false);
});

test('field evolution keeps wounds and stamina proportion, prerequisites and payment',()=>{
  const s=fresh();Object.assign(s.player,{x:25,z:12,hp:41,stamina:32,poisonUntil:10});
  const before=structuredClone(s);assert.equal(evolve(s,'gills').ok,false);assert.deepEqual(s,before);
  assert.ok(evolve(s,'tail').ok);assert.equal(s.player.hp,41);assert.equal(s.player.stamina,40);assert.equal(s.player.poisonUntil,10);
  s.colony.dna=0;const poor=structuredClone(s);assert.equal(evolve(s,'fins').ok,false);assert.deepEqual(s,poor);
});

test('all four colours can be changed away from home and saved without spending or healing',()=>{
  const s=fresh();Object.assign(s.player,{x:25,z:12,hp:31,stamina:28});const colony=structuredClone(s.colony);
  for(const appearance of APPEARANCES){
    assert.ok(setAppearance(s,appearance.id).ok);assert.equal(s.appearance,appearance.id);
    assert.equal(deserialize(serialize(s)).appearance,appearance.id);assert.deepEqual(s.colony,colony);assert.equal(s.player.hp,31);assert.equal(s.generation,1);
  }
  const before=structuredClone(s);assert.equal(setAppearance(s,'invalid').ok,false);assert.deepEqual(s,before);
});

test('home growth recognises completed facilities in existing saves without counting worksites',()=>{
  const s=fresh();assert.equal(habitatStage(s).level,1);
  const projects=['nest','garden','cache','garden'].map((kind,i)=>({id:'grown'+i,kind,x:12+i*2,z:9,progress:.95}));
  s.buildings.push(...projects);assert.equal(habitatStage(s).level,1);
  projects[0].progress=1;assert.equal(habitatStage(s).level,2);assert.equal(habitatStage(s).nextAt,4);
  projects.forEach(p=>p.progress=1);const restored=deserialize(serialize(s));assert.equal(habitatStage(restored).level,3);assert.equal(habitatStage(restored).nextAt,null);
});
