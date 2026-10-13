import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createState } from '../src/core/state.js';
import { planDeparture } from '../src/core/journey.js';
import { SPECIES, EXPEDITION_FAUNA, NEST } from '../src/core/config.js';
import { NATIVE_COUNTS } from '../src/core/survival-config.js';
import { serialize, deserialize } from '../src/core/persistence.js';
import { terrainFor } from '../src/core/terrain.js';
import { step } from '../src/core/simulation.js';
import { hostileTarget } from '../src/core/hostility.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

function trip(seed=73429){
  const s=createState(seed);s.started=true;Object.assign(s.player,NEST);s.completed=['evolve','build'];s.colony.food=60;
  const next=planDeparture(s,'glowflower');assert.ok(next.ok);return next.state;
}

test('new fauna share the expedition population budget and keep camp routes and old home fauna',()=>{
  for(const seed of [73429,42,901]){
    const s=trip(seed),wild=s.agents.filter(a=>a.kind!=='companion');
    assert.equal(wild.length,19);assert.equal(wild.filter(a=>a.kind==='predator').length,10);
    assert.deepEqual(Object.fromEntries(Object.keys(s.habitatHealth.baseline).map(id=>[id,wild.filter(a=>a.species===id).length])),NATIVE_COUNTS.expedition);
    assert.ok(s.journey.home.agents.every(a=>!EXPEDITION_FAUNA.includes(a.species)));
    for(const a of wild.filter(a=>EXPEDITION_FAUNA.includes(a.species))){
      assert.equal(a.hp,SPECIES[a.species].hp);assert.ok(Math.hypot(a.x-NEST.x,a.z-NEST.z)>13);
      assert.ok(terrainFor(s).walkable(a.x,a.z,!!SPECIES[a.species].swim,{level:.5}));
    }
    for(let i=0;i<200;i++)step(s);
    const saved=deserialize(serialize(s));assert.ok(saved);assert.deepEqual(saved.habitatHealth.baseline,s.habitatHealth.baseline);
    assert.ok(EXPEDITION_FAUNA.every(id=>saved.agents.some(a=>a.species===id)));
  }
});

test('old expedition saves retain their living wildlife and historical baseline without injecting new animals',()=>{
  const s=trip(),previous={fernback:'resinshell',moonray:'stormlantern',mireclaw:'tideblade',spinedillo:'stonehorn'};
  for(const a of s.agents)if(previous[a.species]){a.species=previous[a.species];a.hp=SPECIES[a.species].hp;}
  s.habitatHealth.baseline={...NATIVE_COUNTS.rift};
  const read=deserialize(serialize(s));assert.ok(read);assert.deepEqual(read.habitatHealth.baseline,NATIVE_COUNTS.rift);
  assert.equal(read.agents.filter(a=>EXPEDITION_FAUNA.includes(a.species)).length,0);
});

test('shore claws respect the safe camp and distant visitors; grass and gliding fauna never target prey',()=>{
  const s=trip();s.time=100;s.clock.tick=2000;
  const crab=s.agents.find(a=>a.species==='mireclaw');s.agents=[crab];Object.assign(crab,{x:22,z:-20,homeX:22,homeZ:-20});
  Object.assign(s.player,{x:25,z:-20});assert.equal(hostileTarget(s,crab),s.player);
  Object.assign(s.player,{x:33,z:-20});assert.equal(hostileTarget(s,crab),null);
  Object.assign(s.player,NEST);Object.assign(crab,{x:7,z:9,homeX:7,homeZ:9});assert.equal(hostileTarget(s,crab),null);
  for(const id of ['fernback','moonray'])assert.equal(hostileTarget(s,{...crab,kind:SPECIES[id].kind,species:id}),null);
});

test('Blender exports contain independent animated pivots and stay within a small geometry and download budget',async()=>{
  let bytes=0;
  for(const id of EXPEDITION_FAUNA){
    const file=fs.readFileSync(new URL(`../public/models/${id}.glb`,import.meta.url));bytes+=file.length;
    assert.equal(file.readUInt32LE(0),0x46546c67);assert.equal(file.readUInt32LE(4),2);assert.equal(file.readUInt32LE(8),file.length);
    const doc=JSON.parse(file.subarray(20,20+file.readUInt32LE(12)).toString());
    assert.ok(doc.asset.generator.includes('Blender'));assert.ok(doc.buffers.every(b=>!b.uri));
    const loaded=await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength),'');
    const names=[];loaded.scene.traverse(o=>names.push(o.name));
    for(const pivot of ['BodyPivot','HeadPivot','TailPivot',...(id==='moonray'?['Wing_L','Wing_R']:['Leg_FL','Leg_FR','Leg_BL','Leg_BR','Knee_FL','Knee_FR','Knee_BL','Knee_BR']),...(id==='mireclaw'?['Claw_L','Claw_R']:[])])assert.ok(names.some(n=>n===pivot||n.endsWith('_'+pivot)),`${id} lacks ${pivot}`);
    const vertices=doc.meshes.flatMap(m=>m.primitives).reduce((n,p)=>n+doc.accessors[p.attributes.POSITION].count,0);
    assert.ok(vertices<15000,`${id}: ${vertices} vertices`);assert.ok(doc.materials.length>=3);
  }
  assert.ok(bytes<1000000,`${bytes} bytes for four models`);
});
