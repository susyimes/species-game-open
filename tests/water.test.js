import test from 'node:test';
import assert from 'node:assert/strict';
import { waterPose,waterHeightAt } from '../src/core/water.js';
import { createState } from '../src/core/state.js';
import { step } from '../src/core/simulation.js';
import { interact } from '../src/core/actions.js';
import { dist } from '../src/core/math.js';

test('shallow wading keeps feet on the bed; swimming submerges the body with the head above water',()=>{
  const shallow=waterPose({ground:0,surface:.18,bodyHeight:1,scale:1.12,canSwim:true});
  assert.equal(shallow.mode,'wade');assert.equal(shallow.rootY,-.07);
  const deep=waterPose({ground:-2,surface:.18,bodyHeight:1,scale:1.12,canSwim:true});
  assert.equal(deep.mode,'swim');assert.ok(Math.abs(deep.rootY+1.12-.24)<1e-8);
  assert.ok(deep.rootY+1.12+.35>.18);assert.ok(deep.rootY<.18);
});
test('buoyancy is continuous at the shore transition and follows the same wave function',()=>{
  const surface=waterHeightAt(-19,8,12),transition=surface+.13-1.12;
  const a=waterPose({ground:transition-.001,surface,bodyHeight:1,scale:1.12,canSwim:true});
  const b=waterPose({ground:transition+.001,surface,bodyHeight:1,scale:1.12,canSwim:true});
  assert.ok(Math.abs(a.rootY-b.rootY)<.003);
  assert.notEqual(waterHeightAt(-19,8,12),waterHeightAt(-19,8,13));
});
test('gill specialisation increases actual swimming speed rather than only the displayed stat',()=>{
  const a=createState(),b=createState();for(const s of [a,b]){s.started=true;s.agents=[];Object.assign(s.player,{x:-19,z:8});}
  a.parts=['fins'];b.parts=['fins','gills'];const start={x:-19,z:8};
  for(let i=0;i<10;i++){step(a,.05,{x:1,z:0});step(b,.05,{x:1,z:0});}
  assert.ok(dist(b.player,start)>dist(a.player,start)*1.45);
});
test('relics regenerate after three real simulation minutes and give the smaller repeat reward',()=>{
  const s=createState();s.started=true;s.agents=[];const r=s.resources.find(r=>r.kind==='relic');Object.assign(s.player,{x:r.x,z:r.z});s.parts=['fins'];
  interact(s,{type:'resource',entity:r});for(let i=0;i<70;i++)step(s,.05);assert.equal(r.researchCount,1);assert.equal(r.amount,0);const dna=s.colony.dna;
  for(let i=0;i<3601;i++)step(s,.05);assert.equal(r.amount,1);
  interact(s,{type:'resource',entity:r});for(let i=0;i<70;i++)step(s,.05);assert.equal(s.colony.dna,dna+8);assert.equal(r.researchCount,2);
});
