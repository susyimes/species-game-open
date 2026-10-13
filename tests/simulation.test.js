import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, population, makeAgent } from '../src/core/state.js';
import { step, bagTotal } from '../src/core/simulation.js';
import { NEST, speciesStats } from '../src/core/config.js';
import { moveTo, interact, evolve, build, hatch, assignJob } from '../src/core/actions.js';
import { walkable, findPath, heightAt, TREES } from '../src/core/terrain.js';
import { dist } from '../src/core/math.js';
import { serialize, deserialize } from '../src/core/persistence.js';

const fresh=(seed=73429)=>{const s=createState(seed);s.started=true;return s;};
const advance=(s,seconds,input={})=>{for(let i=0;i<Math.round(seconds*20);i++)step(s,.05,input);};

test('seeded worlds and the fixed-step simulation are reproducible',()=>{
  const a=fresh(23),b=fresh(23);advance(a,90);advance(b,90);assert.deepEqual(a,b);
  assert.notDeepEqual(a.resources,createState(24).resources);
});
test('diagonal movement is normalized and pause prevents every simulation side effect',()=>{
  const a=fresh(),b=fresh();a.agents=[];b.agents=[];advance(a,1,{x:1,z:0});advance(b,1,{x:1,z:1});
  assert.ok(Math.abs(dist(a.player,{x:8,z:14})-dist(b.player,{x:8,z:14}))<1e-8);
  a.paused=true;const before=structuredClone(a);advance(a,120,{x:1,z:1});assert.deepEqual(a,before);
});
test('navigation refuses deep water; side fins open a real shallow-water route',()=>{
  const s=fresh();s.agents=[];const pond={x:-19,z:8};assert.equal(walkable(pond.x,pond.z),false);assert.equal(moveTo(s,pond).ok,false);
  s.parts=['fins'];assert.equal(walkable(pond.x,pond.z,true),true);assert.equal(moveTo(s,pond).ok,true);
  advance(s,45);assert.ok(dist(s.player,pond)<1,`remaining distance ${dist(s.player,pond)}`);
});
test('A* routes around tree trunks and samples every shortcut against terrain',()=>{
  const t=TREES.find(t=>walkable(t.x-3,t.z)&&walkable(t.x+3,t.z));assert.ok(t);
  const start={x:t.x-3,z:t.z},end={x:t.x+3,z:t.z},path=findPath(start,end);assert.ok(path?.length>1);
  let from=start;
  for(const to of path){const samples=Math.ceil(dist(from,to)/.15);for(let i=1;i<=samples;i++)assert.ok(walkable(from.x+(to.x-from.x)*i/samples,from.z+(to.z-from.z)*i/samples));from=to;}
});
test('food only enters the bag after reaching and harvesting a finite resource',()=>{
  const s=fresh();s.agents=[];const r=s.resources[0];s.resources=[r];r.amount=6;r.max=6;
  assert.equal(interact(s,{type:'resource',entity:r}).ok,true);advance(s,5);
  assert.ok(s.metrics.gathered>=6);assert.equal(s.player.carry.food,6);assert.ok(r.amount<1);assert.ok(bagTotal(s.player)<=speciesStats(s.parts).carry);
  const food=s.colony.food;assert.equal(moveTo(s,NEST).ok,true);advance(s,6);assert.equal(bagTotal(s.player),0);assert.equal(s.metrics.deposited,6);assert.ok(s.colony.food>food+5);
});
test('storage cap conserves carried resources instead of destroying overflow',()=>{
  const s=fresh();s.agents=[];s.player.x=NEST.x;s.player.z=NEST.z;s.colony.material=79;s.player.carry.material=7;advance(s,.1);
  assert.equal(s.colony.material,80);assert.equal(s.player.carry.material,6);
});
test('evolution works away from home, is transactional, non-repeatable and changes traits',()=>{
  const s=fresh();Object.assign(s.player,{x:20,z:15,hp:42,stamina:36});s.colony.dna=100;
  assert.equal(evolve(s,'shell').ok,true);assert.equal(s.colony.dna,76);
  assert.equal(s.player.hp,42);assert.equal(s.player.stamina,36);assert.equal(s.player.x,20);
  assert.equal(evolve(s,'shell').ok,false);assert.equal(s.colony.dna,76);assert.equal(s.generation,2);
  const stats=speciesStats(s.parts);assert.equal(stats.armor,.4);assert.ok(stats.speed<4.3);
  const before=structuredClone(s);assert.equal(evolve(s,'nonsense').ok,false);assert.deepEqual(s,before);
});
test('construction consumes resources once and needs a worker physically at the site',()=>{
  const s=fresh();assert.equal(build(s,'nest').ok,true);assert.equal(s.colony.material,8);assert.equal(build(s,'nest').ok,false);
  const site=s.buildings[1],builder=s.agents.find(a=>a.job==='build');
  for(const a of s.agents.filter(a=>a.kind==='companion'))a.job='guard';advance(s,8);assert.equal(site.progress,0);
  builder.job='build';let observedWork=false;
  for(let i=0;i<800;i++){const progress=site.progress;step(s,.05);if(site.progress>progress){assert.ok(dist(builder,site)<3);observedWork=true;}}
  assert.ok(observedWork);assert.equal(site.progress,1);assert.equal(s.colony.capacity,10);assert.equal(s.metrics.built,1);
});
test('a full bag at full storage cannot deadlock a construction worker',()=>{
  const s=fresh();s.colony.food=80;s.colony.material=80;const builder=s.agents.find(a=>a.job==='build');
  builder.carry.food=6;Object.assign(builder,NEST);assert.ok(build(s,'garden').ok);s.colony.food=80;
  advance(s,38);assert.equal(s.buildings[1].progress,1);
});
test('hatching is bounded by capacity, has a real timer, and charges exactly once',()=>{
  const s=fresh();assert.equal(hatch(s).ok,false);s.colony.capacity=10;s.colony.food=60;
  assert.ok(hatch(s).ok);assert.equal(s.colony.food,42);assert.equal(hatch(s).ok,false);
  const before=population(s);advance(s,15);assert.equal(population(s),before);advance(s,16);assert.equal(population(s),before+1);assert.equal(s.colony.egg,null);
});
test('the economy cannot manufacture workers or exceed inventory limits during seven days',()=>{
  for(const seed of [3,42,73429]){
    const s=fresh(seed);advance(s,360*7);
    assert.ok(population(s)>=1&&population(s)<=6);assert.equal(s.parts.length,0);
    assert.ok(s.colony.dna>=12&&s.colony.dna<=12+s.metrics.kills*6,'defensive kills must account for any earned evolution points');
    for(const key of ['food','material'])assert.ok(Number.isFinite(s.colony[key])&&s.colony[key]>=0&&s.colony[key]<=s.colony.storage);
    for(const a of [s.player,...s.agents])assert.ok(Number.isFinite(a.x+a.z+a.hp)&&a.hp>=0);
    assert.ok(s.resources.length<80);
  }
});
test('save round-trip preserves progress while discarding transient routes',()=>{
  const s=fresh();advance(s,35);const next=deserialize(serialize(s));assert.ok(next);assert.equal(next.time,s.time);assert.deepEqual(next.colony,s.colony);assert.deepEqual(next.parts,s.parts);
  assert.equal(next.paused,false);assert.deepEqual(next.player.path,[]);assert.equal(next.player.target,null);
});
test('invalid imported state is rejected before it can replace a journey',()=>{
  assert.equal(deserialize('{bad'),null);assert.equal(deserialize('{}'),null);
  const s=fresh();s.player.x=Infinity;assert.equal(deserialize(serialize(s)),null);
  const b=fresh();b.parts=['illegal-part'];assert.equal(deserialize(serialize(b)),null);
  const c=fresh();c.resources[0].amount=-1;assert.equal(deserialize(serialize(c)),null);
  const d=fresh();d.colony.egg={remaining:'soon',total:30};assert.equal(deserialize(serialize(d)),null);
  const e=fresh();delete e.agents[0].heading;assert.equal(deserialize(serialize(e)),null);
  const f=fresh();f.colony.food=999;assert.equal(deserialize(serialize(f)),null);
});
