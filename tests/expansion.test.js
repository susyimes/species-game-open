import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, makeAgent, upgradeState } from '../src/core/state.js';
import { step, bagTotal } from '../src/core/simulation.js';
import { evolve, hatch, rally, interact, setAppearance } from '../src/core/actions.js';
import { evolutionChoice } from '../src/core/evolution.js';
import { NEST, SPECIES, EVOLUTIONS, speciesStats } from '../src/core/config.js';
import { serialize, deserialize } from '../src/core/persistence.js';
import { walkable, TREES } from '../src/core/terrain.js';
import { dist } from '../src/core/math.js';

function fresh(){const s=createState();s.started=true;return s;}
function run(s,seconds){for(let i=0;i<seconds*20;i++)step(s,.05);}
test('standing at full storage emits at most one deposit notice per visit, with no zero-quantity spam',()=>{
  const s=fresh();s.agents=[];Object.assign(s.player,NEST);s.player.carry.food=12;s.colony.food=80;
  run(s,120);const notices=s.journal.filter(e=>e.kind==='resource');
  assert.equal(notices.length,1);assert.ok(!notices[0].text.includes('0 份'));assert.ok(bagTotal(s.player)>0);
  assert.ok(Math.abs(s.metrics.deposited-(12-s.player.carry.food))<1e-8);
  s.player.x=NEST.x+4.5;run(s,.1);Object.assign(s.player,NEST);run(s,.1);
  assert.equal(s.journal.filter(e=>e.kind==='resource').length,2);
});
test('one full deposit completes the return goal once and preserves fractional legacy cargo',()=>{
  const s=fresh();s.agents=[];Object.assign(s.player,NEST);s.colony.material=79;s.player.carry.material=3.75;
  run(s,1);assert.equal(s.colony.material,80);assert.equal(s.player.carry.material,2.75);
  s.colony.material=60;run(s,1);assert.equal(s.colony.material,62.75);assert.equal(s.player.carry.material,0);
  assert.equal(s.journal.filter(e=>e.kind==='resource').length,1);assert.equal(s.metrics.deposited,3.75);
});
test('specialisations require the base part and habitat discovery before spending DNA',()=>{
  const s=fresh();Object.assign(s.player,NEST);s.colony.dna=150;
  assert.equal(evolve(s,'sprinter').ok,false);assert.equal(s.colony.dna,150);
  assert.ok(evolve(s,'legs').ok);assert.equal(evolve(s,'sprinter').ok,false);
  s.discovered.push('grove');assert.ok(evolve(s,'sprinter').ok);assert.ok(speciesStats(s.parts).speed>6);
});
test('branch changes are exclusive, preview the real result, and refund half only once',()=>{
  const s=fresh();Object.assign(s.player,NEST);s.discovered=['meadow','grove','ridge'];s.colony.dna=150;
  evolve(s,'legs');evolve(s,'sprinter');const before=s.colony.dna;
  const preview=evolutionChoice(s,'digger');assert.equal(preview.cost,14);assert.ok(!preview.parts.includes('sprinter'));
  assert.ok(evolve(s,'digger').ok);assert.deepEqual(s.parts,preview.parts);assert.equal(s.colony.dna,before-14);
  assert.equal(evolve(s,'digger').ok,false);assert.equal(s.colony.dna,before-14);
});
test('venom continues damaging after the first hit without requiring another attack',()=>{
  const s=fresh();Object.assign(s.player,{x:22,z:-15});s.parts=['horns','venom'];
  const prey=makeAgent('target','grazer',23,-15,'forage','mossback');prey.hp=100;prey.decision=999;prey.cooldown=999;s.agents=[prey];
  interact(s,{type:'enemy',entity:prey});step(s,.05);assert.ok(prey.poisonUntil>s.time);
  const hp=prey.hp;s.player.target=null;s.player.path=[];run(s,1);
  assert.ok(prey.hp<hp-2.5);assert.ok(prey.hp>hp-3.5);
});
test('thorns retaliate and regeneration waits until the creature leaves combat',()=>{
  const s=fresh();Object.assign(s.player,{x:22,z:-15});s.parts=['shell','thorns'];
  const predator=makeAgent('pred','predator',23,-15,'forage','emberfang');s.agents=[predator];
  step(s,.05);assert.equal(predator.hp,60);assert.ok(s.player.hp<100);
  s.agents=[];s.parts=['tail','regrowth'];s.player.hp=60;s.player.hitAt=s.time;run(s,5);assert.equal(s.player.hp,60);run(s,3);assert.ok(s.player.hp>60);
});
test('brood changes real hatching duration and carry capacity; calls respect range',()=>{
  const s=fresh();s.parts=['crest','brood'];s.colony.capacity=10;s.colony.food=60;assert.ok(hatch(s).ok);assert.equal(s.colony.egg.total,20);assert.equal(speciesStats(s.parts).workerCarry,10);
  s.player.x=40;s.player.z=30;assert.equal(rally(s).ok,false);Object.assign(s.player,NEST);assert.ok(rally(s).ok);
  assert.ok(s.agents.find(a=>a.job==='guard').ralliedUntil>s.time);
});
test('the original island retains its four resident species while new descendants have independent assets',()=>{
  const s=fresh();assert.equal(new Set(s.agents.filter(a=>a.species).map(a=>a.species)).size,4);
  assert.equal(new Set(Object.values(SPECIES).map(s=>s.asset)).size,16);
  assert.equal(Object.values(SPECIES).filter(s=>s.marine&&s.swim).length,3);
  assert.ok(SPECIES.reedbeak.swim);assert.ok(SPECIES.glowbug.fly);assert.equal(SPECIES.emberfang.kind,'predator');
  assert.equal(new Set(s.resources.map(r=>r.id)).size,s.resources.length);
  for(const r of s.resources.filter(r=>r.kind==='relic')){assert.ok(walkable(r.x,r.z,true));assert.ok(TREES.every(t=>dist(t,r)>2.1));}
});
test('old saves gain wildlife once, preserve progress, and retain new evolution choices',()=>{
  const s=fresh();delete s.worldRevision;delete s.appearance;s.agents=s.agents.filter(a=>a.kind==='companion');s.colony.dna=73;
  const upgraded=upgradeState(s),count=upgraded.agents.length;upgradeState(upgraded);assert.equal(upgraded.agents.length,count);assert.equal(upgraded.colony.dna,73);
  upgraded.parts=['legs','digger'];setAppearance(upgraded,'tide');const saved=deserialize(serialize(upgraded));assert.ok(saved);assert.deepEqual(saved.parts,['legs','digger']);
  const corrupt=structuredClone(upgraded);corrupt.parts.push('sprinter');assert.equal(deserialize(serialize(corrupt)),null);
});
