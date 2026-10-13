import { VERSION, NEST, BIOMES, SPECIES } from './config.js';
import { random, dist } from './math.js';
import { walkable, biomeAt, heightAt, TREES } from './terrain.js';

function clearRelicPosition(r){
  if(TREES.every(t=>dist(t,r)>2.1))return;
  const origin={x:r.x,z:r.z};
  for(let radius=2;radius<=5;radius+=.5)for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,p={x:origin.x+Math.cos(angle)*radius,z:origin.z+Math.sin(angle)*radius};
    if(walkable(p.x,p.z,true)&&TREES.every(t=>dist(t,p)>2.1)){Object.assign(r,p);return;}
  }
}

export function makeAgent(id,kind,x,z,job='forage',species=null) {
  return {id,kind,species,x,z,homeX:x,homeZ:z,heading:0,hp:SPECIES[species]?.hp??(kind==='predator'?48:kind==='grazer'?35:100),stamina:100,job,behavior:'idle',carry:{food:0,material:0},path:[],target:null,decision:0,work:0,cooldown:0,moveSpeed:0,age:0};
}
export function createState(seed=73429) {
  const rng=random(seed),resources=[];
  function node(kind,x,z) {
    resources.push({id:'r'+resources.length,kind,x,z,amount:kind==='relic'?1:kind==='food'?18:22,max:kind==='relic'?1:kind==='food'?18:22,regen:0});
  }
  for(const [kind,x,z] of [['food',10,14],['food',1,15],['food',11,5],['material',-1,8],['material',15,11]])node(kind,x,z);
  for(let i=0;i<58;i++) {
    const x=(rng()-.5)*78,z=(rng()-.5)*78;
    if(!walkable(x,z)||dist({x,z},NEST)<5||resources.some(r=>dist(r,{x,z})<3.2)){i--;continue;}
    node(i%3===0?'material':'food',x,z);
  }
  node('relic',-8,-22);node('relic',26,-21);node('relic',-26,10);node('relic',-19,8);
  for(const r of resources.filter(r=>r.kind==='relic'))clearRelicPosition(r);
  const agents=[];
  for(let i=0;i<5;i++)agents.push(makeAgent('a'+i,'companion',NEST.x+Math.cos(i*1.6)*2.8,NEST.z+Math.sin(i*1.6)*2.8,i<3?'forage':i===3?'build':'guard'));
  const wildlife=[['mossback',-5,1],['mossback',15,21],['mossback',4,-13],['mossback',-12,-20],['mossback',20,-3],['reedbeak',-25,11],['reedbeak',-16,17],['reedbeak',-22,0],['reedbeak',-25,21],['emberfang',22,-23],['emberfang',29,-15],['emberfang',17,-28],['glowbug',12,6],['glowbug',0,20],['glowbug',-9,-15],['glowbug',-2,-23]];
  for(const [species,x,z] of wildlife)agents.push(makeAgent('wild'+agents.length,SPECIES[species].kind,x,z,'forage',species));
  return {version:VERSION,seed,rng:seed,time:0,started:false,paused:false,speed:1,generation:1,
    player:makeAgent('player','player',8,14),agents,resources,
    colony:{food:28,material:22,dna:12,capacity:6,storage:80,egg:null,starve:0},
    buildings:[{id:'b0',kind:'home',x:NEST.x,z:NEST.z,progress:1}],
    parts:[],appearance:'fern',worldRevision:3,discovered:['meadow'],quest:0,completed:[],
    metrics:{gathered:0,deposited:0,evolved:0,built:0,discovered:1,population:6,kills:0},
    journal:[{time:0,text:'小芽和五位同伴，在初生原野安下了家。',kind:'story'}],
    notifications:[],rallyUntil:0,rallyCooldown:0,nextId:100,weather:'clear',weatherAt:120,selected:null};
}
export function upgradeState(s){
  s.appearance??='fern';
  s.nextId=Math.max(s.nextId,100,...s.resources.map(r=>(Number(String(r.id).slice(1))||0)+1));
  const used=new Set();for(const r of s.resources){if(used.has(r.id))r.id='r'+s.nextId++;used.add(r.id);}
  for(const r of s.resources.filter(r=>r.kind==='relic')){
    clearRelicPosition(r);
    if(r.amount===0&&!r.reawakenAt){r.researchCount=Math.max(1,r.researchCount||0);r.reawakenAt=s.time+180;}
  }
  if((s.worldRevision||0)<3){
    for(const a of s.agents){
      if(a.kind==='grazer')a.species='mossback';if(a.kind==='predator')a.species='emberfang';
      a.homeX??=a.x;a.homeZ??=a.z;
    }
    for(const [species,x,z] of [['reedbeak',-25,11],['reedbeak',-16,17],['reedbeak',-22,0],['glowbug',12,6],['glowbug',-9,-15],['glowbug',0,20]])
      s.agents.push(makeAgent('wild'+s.nextId++,SPECIES[species].kind,x,z,'forage',species));
    s.worldRevision=3;
  }
  return s;
}
export function population(s){return 1+s.agents.filter(a=>a.kind==='companion').length;}
export function notify(s,text,kind='info') {
  const entry={time:s.time,text,kind};s.notifications.push(entry);if(s.notifications.length>5)s.notifications.shift();
  s.journal.unshift(entry);if(s.journal.length>45)s.journal.length=45;
}
export function nearbyContext(s) {
  const p=s.player;
  const enemy=s.agents.filter(a=>a.kind==='predator'&&!a.dominated&&!(a.pacifiedUntil>s.time)&&a.hp>0&&dist(a,p)<3).sort((a,b)=>dist(a,p)-dist(b,p))[0];
  if(enemy)return {type:'enemy',entity:enemy,label:'抵御猎食者'};
  const r=s.resources.filter(r=>r.amount>=1&&dist(r,p)<3).sort((a,b)=>dist(a,p)-dist(b,p))[0];
  if(r)return {type:'resource',entity:r,label:r.kind==='relic'?'研究远古孢子':r.carcass?'拾取猎物':r.kind==='food'?'采集浆果':'拾取材料'};
  if(dist(p,NEST)<4)return {type:'home',entity:NEST,label:'在巢边休息'};
  return null;
}
