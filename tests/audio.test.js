import test from 'node:test';
import assert from 'node:assert/strict';
import {AudioMixer} from '../src/audio/mixer.js';
import {SoundDirector,soundscape} from '../src/audio/director.js';
import {audioSettings,readAudioSettings} from '../src/audio/settings.js';
import {createState} from '../src/core/state.js';

class Param{value=1;cancelScheduledValues(){}setValueAtTime(v){this.value=v;}linearRampToValueAtTime(v){this.value=v;}}
class Node{gain=new Param();playbackRate=new Param();threshold=new Param();knee=new Param();ratio=new Param();connect(){}disconnect(){}start(){this.started=true;}stop(){this.stopped=true;this.onended?.();}}
class Context{
  state='suspended';currentTime=0;destination={};sources=[];
  createGain(){return new Node();}createDynamicsCompressor(){return new Node();}
  createBufferSource(){const s=new Node();this.sources.push(s);return s;}
  async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}
  async decodeAudioData(){return {duration:2};}
}
const response=()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(8)});
const flush=()=>new Promise(resolve=>setImmediate(resolve));
const scene={active:true,music:'island-day',musicGain:1,rain:0,surf:0};
function setup(fetcher=async()=>response()){
  const context=new Context(),storage={getItem(){return null;},setItem(){}};
  const mixer=new AudioMixer({contextFactory:()=>context,fetcher,storage});return {mixer,context};
}

test('soundscape follows actual day/night, expedition, rain and coastal proximity without touching the save',()=>{
  const s=createState();s.started=true;const raw=JSON.stringify(s);assert.equal(soundscape(s,'land').music,'island-day');assert.equal(JSON.stringify(s),raw);
  s.time=180;s.clock.tick=3600;assert.equal(soundscape(s,'land').music,'island-night');s.journey.active={id:'trip'};assert.equal(soundscape(s,'land').music,'island-expedition');
  s.weather='squall';assert.equal(soundscape(s,'land').rain,.8);assert.equal(soundscape(s,'land',{modal:true}).rain,0);assert.ok(soundscape(s,'land',{modal:true}).musicGain<1);
  s.player.x=42;assert.ok(soundscape(s,'swim').surf>.5);assert.equal(soundscape(s,'land',{hidden:true}).active,false);assert.equal(soundscape(s,'land',{manualPause:true}).active,false);
});
test('audio observes real resource transfers and purchases once, never replays a loaded or rolled-back snapshot',()=>{
  const s=createState();s.started=true;const d=new SoundDirector();assert.deepEqual(d.sample(s,'land'),[]);
  s.metrics.gathered+=2;assert.equal(d.sample(s,'land')[0].id,'gather-leaf');assert.deepEqual(d.sample(s,'land'),[]);
  s.player.carry.material+=2;assert.equal(d.sample(s,'land')[0].id,'gather-stone');s.metrics.deposited+=4;assert.equal(d.sample(s,'land')[0].id,'deposit');
  s.generation++;assert.equal(d.sample(s,'land')[0].id,'evolve');s.player.hitAt=1;assert.equal(d.sample(s,'land')[0].id,'impact');
  s.time=20;d.sample(s,'land');s.time=10;s.generation++;assert.deepEqual(d.sample(s,'land'),[]);s.mapId='expedition';s.quest++;assert.deepEqual(d.sample(s,'land'),[]);
});
test('preferences tolerate corrupt or blocked storage and clamp volume without changing game data',()=>{
  assert.equal(audioSettings({music:2,effects:-4,ambience:NaN}).music,1);assert.equal(audioSettings({effects:-4}).effects,0);
  assert.equal(readAudioSettings({getItem(){throw Error('blocked');}}).muted,false);
  const {mixer}=setup();mixer.storage={getItem(){},setItem(){throw Error('blocked');}};assert.doesNotThrow(()=>mixer.setSettings({muted:true}));
});
test('no audio context or download starts before a gesture; pause, mute and dispose silence playback',async()=>{
  const calls=[],{mixer,context}=setup(async url=>{calls.push(url);return response();});mixer.sync(scene);assert.equal(mixer.context,null);assert.deepEqual(calls,[]);
  mixer.unlock();mixer.sync(scene);await flush();assert.equal(context.state,'running');assert.ok(mixer.inspect().loops.some(s=>s.id==='island-day'));
  mixer.play({id:'impact'});await flush();assert.equal(mixer.inspect().played,1);
  mixer.sync({...scene,active:false});await flush();assert.equal(context.state,'suspended');assert.equal(mixer.inspect().effects,0);
  mixer.sync(scene);await flush();assert.equal(context.state,'running');mixer.setSettings({muted:true});await flush();assert.equal(context.state,'suspended');
  mixer.dispose();await flush();assert.equal(context.state,'closed');
});
test('a late night download cannot replace day after the player changes back',async()=>{
  let deliver;const {mixer}=setup(url=>url.includes('island-night')?new Promise(resolve=>{deliver=resolve;}):Promise.resolve(response()));
  mixer.unlock();mixer.sync(scene);await flush();mixer.sync({...scene,music:'island-night'});mixer.sync(scene);deliver(response());await flush();
  assert.deepEqual(mixer.inspect().loops.map(s=>s.id),['island-day']);mixer.dispose();
});
test('failed Ogg decoding uses MP3, while unavailable audio is quiet and rate limited',async()=>{
  const calls=[],{mixer}=setup(async url=>{calls.push(url);return {...response(),ok:!url.endsWith('.ogg')};});mixer.unlock();mixer.sync(scene);await flush();
  assert.ok(calls.some(url=>url.endsWith('island-day.mp3')));assert.ok(mixer.inspect().loops.length);mixer.dispose();
  const bad=setup(async()=>{throw Error('offline');}).mixer;bad.unlock();bad.sync(scene);await flush();const count=bad.inspect().failed;bad.sync(scene);await flush();assert.equal(bad.inspect().failed,count);bad.dispose();
});
test('rapid impacts are bounded and pending effects cannot play after pause/resume',async()=>{
  const {mixer,context}=setup();mixer.unlock();mixer.sync(scene);await flush();
  for(let i=0;i<30;i++)mixer.play({id:'impact'});await flush();assert.equal(mixer.inspect().played,1);
  for(const id of ['deposit','gather-leaf','gather-stone','splash','evolve'])mixer.play({id});await flush();assert.ok(mixer.inspect().effects<=4);
  mixer.sync({...scene,active:false});await flush();mixer.sync(scene);await flush();context.currentTime=10;mixer.buffers.delete('impact');let deliver;
  mixer.fetcher=()=>new Promise(resolve=>{deliver=resolve;});mixer.play({id:'impact'});mixer.sync({...scene,active:false});mixer.sync(scene);deliver(response());await flush();assert.equal(mixer.inspect().effects,0);mixer.dispose();
});
