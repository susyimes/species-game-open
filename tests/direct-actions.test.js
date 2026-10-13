import test from 'node:test';
import assert from 'node:assert/strict';
import { createState, makeAgent } from '../src/core/state.js';
import { directAction } from '../src/core/direct-actions.js';
import { step } from '../src/core/simulation.js';
import { actionFeedback, actionNotice } from '../src/core/interaction-feedback.js';
import { nextGuide, acknowledgeGuide } from '../src/core/onboarding.js';
import { serialize, deserialize } from '../src/core/persistence.js';
import { dist } from '../src/core/math.js';

function fixture(){const s=createState();s.started=true;s.agents=[];Object.assign(s.player,{x:15,z:-5});return s;}
function advance(s,seconds){for(let i=0;i<seconds*20;i++)step(s,.05);}

test('one command hunts immediately then physically collects the finite dropped food',()=>{
  const s=fixture(),prey=makeAgent('prey','grazer',16,-5,'forage','mossback');prey.hp=12;s.agents=[prey];
  assert.ok(directAction(s,{type:'enemy',entity:prey}).ok);assert.equal(s.player.target.type,'enemy');
  step(s,.05);assert.equal(prey.hp,0);assert.equal(s.player.target.type,'resource');assert.equal(s.player.carry.food,0);
  const drop=s.resources.find(r=>r.carcass);assert.ok(drop);assert.equal(actionFeedback(s).kind,'gather');
  advance(s,7);assert.equal(s.player.carry.food,8);assert.equal(drop.amount,0);assert.equal(s.metrics.kills,1);assert.match(actionFeedback(s).label,/已拾取/);
});

test('a guard finishing the selected prey does not award remote food',()=>{
  const s=fixture(),prey=makeAgent('prey','predator',21,-5,'forage','emberfang');prey.hp=1;
  const guard=makeAgent('guard','companion',21.5,-5,'guard');s.agents=[prey,guard];
  directAction(s,{type:'enemy',entity:prey});step(s,.05);assert.equal(prey.hp,0);assert.equal(s.player.carry.food,0);
  assert.ok(dist(s.player,prey)>2.1);const drop=s.resources.find(r=>r.carcass);
  for(let i=0;i<200&&s.player.carry.food===0;i++){step(s,.05);if(s.player.carry.food>0)assert.ok(dist(s.player,drop)<=2.1);}
  assert.ok(s.player.carry.food>0);
});

test('rapid repeats preserve the same resource work and moving away cancels it',()=>{
  const s=fixture(),r=s.resources[0];Object.assign(r,{x:16,z:-5});directAction(s,{type:'resource',entity:r});advance(s,.6);
  const progress=s.player.work;assert.ok(progress>0);for(let i=0;i<4;i++)directAction(s,{type:'resource',entity:r});assert.equal(s.player.work,progress);
  assert.ok(actionFeedback(s).value>0);s.paused=true;advance(s,2);assert.equal(s.player.work,progress);s.paused=false;
  directAction(s,{type:'ground',entity:{x:15,z:2}});assert.equal(s.player.target,null);assert.equal(actionFeedback(s),null);advance(s,2);assert.equal(s.player.carry.food,0);
});

test('single clicks do not hunt companions or already adopted creatures',()=>{
  const s=fixture(),friend=makeAgent('friend','grazer',16,-5,'forage','mossback');friend.dominated=true;
  const companion=makeAgent('companion','companion',16,-6);s.agents=[friend,companion];
  for(const [type,entity] of [['enemy',friend],['companion',companion]]){
    assert.ok(directAction(s,{type,entity}).ok);assert.equal(s.player.target,null);advance(s,1);assert.equal(friend.hp,55);assert.equal(friend.dominated,true);
  }
});

test('full bags stop harvesting with inline feedback and no toast',()=>{
  const s=fixture(),r=s.resources[0];Object.assign(r,{x:16,z:-5});s.player.carry.food=12;
  directAction(s,{type:'resource',entity:r});step(s,.05);assert.equal(s.player.target,null);assert.match(actionFeedback(s).label,/背包满/);
  assert.equal(s.notifications.filter(n=>n.kind==='info'||n.kind==='resource').length,0);const amount=r.amount;advance(s,2);assert.equal(r.amount,amount);
  actionNotice(s,'Temporary result');const saved=deserialize(serialize(s));assert.ok(saved);assert.equal(saved.actionNotice,undefined);
  Object.assign(r,{x:22,z:-5});directAction(s,{type:'resource',entity:r});step(s,.05);assert.equal(s.player.path.length,0);
});

test('gather, return and affordable evolution guides are ordered and acknowledge only eligible steps',()=>{
  const s=createState();s.started=true;assert.equal(nextGuide(s).id,'gather');assert.equal(acknowledgeGuide(s,'evolve'),false);
  assert.ok(acknowledgeGuide(s,'gather'));assert.equal(nextGuide(s),null);
  s.metrics.gathered=6;s.player.carry.food=6;s.colony.dna=20;assert.equal(nextGuide(s).id,'return');
  assert.ok(acknowledgeGuide(s,'home'));assert.equal(nextGuide(s),null,'points alone must not introduce evolution before depositing');s.metrics.deposited=6;assert.equal(nextGuide(s).id,'evolve');
  s.colony.dna=17;assert.equal(nextGuide(s),null);s.colony.dna=20;assert.equal(nextGuide(s).id,'evolve');
  assert.ok(acknowledgeGuide(s,'evolve'));s.colony.dna=0;s.colony.dna=100;assert.equal(nextGuide(s),null);
  const restored=deserialize(serialize(s));assert.ok(restored);assert.equal(nextGuide(restored),null);assert.deepEqual(restored.hints.guideV1,['gather','return','evolve']);
});

test('home guides require real resources and capacity, while completed old progress is skipped',()=>{
  const s=fixture();s.parts=['legs'];s.metrics.evolved=1;s.metrics.deposited=6;s.metrics.gathered=6;s.colony.food=12;s.colony.material=11;
  assert.equal(nextGuide(s),null);s.colony.material=12;assert.equal(nextGuide(s).id,'build');acknowledgeGuide(s,'colony');
  s.buildings.push({id:'nursery',kind:'nest',x:5,z:2,progress:1});s.colony.capacity=10;s.colony.food=17;assert.equal(nextGuide(s),null);
  s.colony.food=18;assert.equal(nextGuide(s),null);s.completed=['gather','home','evolve','build','explore'];assert.equal(nextGuide(s).id,'hatch');s.colony.egg={remaining:30,total:30};assert.equal(nextGuide(s),null);
  s.completed=s.completed.filter(id=>id!=='explore');s.discovered=['meadow','grove'];assert.equal(nextGuide(s).id,'journal');s.completed.push('explore');assert.equal(nextGuide(s),null);
});

test('malformed guide records are rejected and old saves without guide fields remain compatible',()=>{
  const s=fixture();assert.ok(deserialize(serialize(s)));
  for(const seen of ['build',['unknown'],['gather','gather']]){s.hints={guideV1:seen};assert.equal(deserialize(serialize(s)),null);}
});
