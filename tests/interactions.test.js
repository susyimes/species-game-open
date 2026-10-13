import test from 'node:test';
import assert from 'node:assert/strict';
import { CreatureGestures } from '../src/view/gestures.js';
import { createState, makeAgent } from '../src/core/state.js';
import { creatureOptions, startCreatureAction } from '../src/core/creature-interactions.js';
import { targetInfo } from '../src/core/target-info.js';
import { stopPlayer, moveTo, commandCompanion } from '../src/core/actions.js';
import { step } from '../src/core/simulation.js';
import { dist } from '../src/core/math.js';

const wild=id=>({type:'enemy',entity:{id}}),resource={type:'resource',entity:{id:'fruit'}};
function tap(g,target,t){g.begin(target,10,10,t);return g.finish(target,t+40);}
function fixture(){const s=createState();s.started=true;Object.assign(s.player,{x:15,z:-5});const a=makeAgent('target','grazer',16,-5,'forage','mossback');s.agents=[a];return {s,a};}
function run(s,seconds){for(let i=0;i<seconds*20;i++)step(s,.05);}
test('every short tap is a direct single action, including two rapid taps',()=>{
  const g=new CreatureGestures();assert.equal(tap(g,wild('a'),0).gesture,'single');assert.equal(tap(g,wild('b'),100).gesture,'single');assert.equal(tap(g,wild('b'),200).gesture,'single');
  assert.equal(tap(g,wild('b'),1000).gesture,'single');assert.equal(tap(g,wild('b'),1500).gesture,'single');
  assert.equal(tap(g,resource,1600).gesture,'single');assert.equal(tap(g,resource,1700).gesture,'single');
});
test('long press opens options once and suppresses the release click',()=>{
  const g=new CreatureGestures();tap(g,wild('a'),0);g.begin(wild('a'),10,10,100);
  assert.equal(g.longPress(500),null);assert.equal(g.longPress(670).gesture,'long');assert.equal(g.longPress(900),null);assert.equal(g.finish(wild('a'),950),null);
  assert.equal(tap(g,wild('a'),1050).gesture,'single');
});
test('dragging and cancelled multi-touch gestures cannot hunt or open a menu',()=>{
  const g=new CreatureGestures();g.begin(wild('a'),10,10,0);g.move(25,10);assert.equal(g.longPress(800),null);assert.equal(g.finish(wild('a'),850),null);
  g.begin(wild('a'),10,10,1000);g.cancel();assert.equal(g.finish(wild('a'),1100),null);
});
test('resource long press and threshold release inspect without a follow-up single action',()=>{
  const g=new CreatureGestures();g.begin(resource,10,10,0);assert.equal(g.finish(resource,560).gesture,'long');assert.equal(g.finish(resource,600),null);
  g.begin(resource,10,10,1000);assert.equal(g.longPress(1550).gesture,'long');assert.equal(g.finish(resource,1590),null);
  g.begin(wild('a'),10,10,2000);assert.equal(g.finish(wild('b'),2040),null);
});
test('reading target details is side-effect free and resources expose a separate action',()=>{
  const {s,a}=fixture(),before=structuredClone(s),info=targetInfo(s,{type:'enemy',id:a.id});assert.equal(info.name,'苔背团兽');assert.deepEqual(s,before);
  const r=s.resources[0],resourceInfo=targetInfo(s,{type:'resource',id:r.id});assert.deepEqual(resourceInfo.options.map(x=>x.id),['harvest']);assert.deepEqual(s,before);
});
test('context options expand only with the actual required evolutions',()=>{
  const {s,a}=fixture();assert.deepEqual(creatureOptions(s,a).map(o=>o.id),['hunt']);assert.equal(startCreatureAction(s,a.id,'communicate').ok,false);
  s.parts=['crest'];assert.deepEqual(creatureOptions(s,a).map(o=>o.id),['communicate','hunt']);
  s.parts=['crest','horns'];assert.ok(!creatureOptions(s,a).some(o=>o.id==='dominate'));
  s.parts.push('legs','sprinter');assert.ok(creatureOptions(s,a).some(o=>o.id==='dominate'));
});
test('communication builds real trust, then domination preserves the species and causes following',()=>{
  const {s,a}=fixture();s.parts=['crest','horns','legs','sprinter'];
  assert.equal(startCreatureAction(s,a.id,'dominate').ok,false);
  assert.ok(startCreatureAction(s,a.id,'communicate').ok);run(s,3);assert.equal(a.trust,35);assert.equal(a.hp,55);
  assert.ok(startCreatureAction(s,a.id,'communicate').ok);run(s,3);assert.equal(a.trust,70);
  assert.ok(startCreatureAction(s,a.id,'dominate').ok);run(s,3);assert.equal(a.dominated,true);assert.equal(a.species,'mossback');assert.equal(a.kind,'grazer');
  s.player.x+=6;run(s,8);assert.ok(dist(a,s.player)<4);assert.ok(creatureOptions(s,a).some(o=>o.id==='release'));
  assert.ok(startCreatureAction(s,a.id,'release').ok);assert.equal(a.dominated,false);
});
test('ground retreat cancels pending damage and movement does not resume the old hunt',()=>{
  const {s,a}=fixture();assert.ok(startCreatureAction(s,a.id,'hunt').ok);step(s,.05);const hp=a.hp;
  stopPlayer(s);moveTo(s,{x:15,z:6});run(s,5);assert.equal(a.hp,hp);assert.equal(s.player.target,null);
});
test('companion follow and job reassignment operate on exactly the selected individual',()=>{
  const s=createState();s.started=true;const a=s.agents.find(a=>a.kind==='companion'),other=s.agents.find(x=>x.kind==='companion'&&x!==a);
  assert.ok(commandCompanion(s,a.id,'follow').ok);assert.equal(a.manualFollow,true);assert.equal(other.manualFollow,undefined);
  assert.ok(commandCompanion(s,a.id,'guard').ok);assert.equal(a.manualFollow,false);assert.equal(a.job,'guard');
});
