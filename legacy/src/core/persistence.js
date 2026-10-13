import { SAVE_KEY, VERSION, EVOLUTIONS, APPEARANCES, SPECIES } from './config.js';
import { createState, notify, upgradeState } from './state.js';

export function serialize(s){
  return JSON.stringify({...s,paused:false,selected:null,notifications:[],savedAt:Date.now()});
}
export function deserialize(raw){
  try{
    const s=JSON.parse(raw);
    if(s?.version!==VERSION||!s.player||!Array.isArray(s.agents)||!Array.isArray(s.resources)||!Array.isArray(s.buildings)||!Array.isArray(s.parts)||!Array.isArray(s.discovered)||!s.colony||!s.metrics||!Array.isArray(s.completed)||!Array.isArray(s.journal))return null;
    if(s.agents.length>150||s.resources.length>500||s.parts.some(p=>!EVOLUTIONS.some(e=>e.id===p))||new Set(s.parts).size!==s.parts.length)return null;
    for(const root of EVOLUTIONS.filter(e=>!e.parent))if(EVOLUTIONS.filter(e=>e.parent===root.id&&s.parts.includes(e.id)).length>1)return null;
    if(s.parts.some(id=>{const e=EVOLUTIONS.find(e=>e.id===id);return e.parent&&!s.parts.includes(e.parent);}))return null;
    if(s.appearance&&!APPEARANCES.some(a=>a.id===s.appearance))return null;
    if(typeof s.started!=='boolean'||![1,2].includes(s.speed)||!Number.isInteger(s.quest)||s.quest>6||!Number.isInteger(s.generation)||s.generation<1)return null;
    if(s.discovered.some(id=>!['meadow','wetland','grove','ridge'].includes(id)))return null;
    const numeric=[s.time,s.rng,s.seed,s.quest,s.generation,s.nextId,s.colony.food,s.colony.material,s.colony.dna,s.colony.storage,s.colony.capacity];
    if(numeric.some(n=>!Number.isFinite(n)||n<0)||s.colony.storage<1||s.colony.capacity<1||s.colony.food>s.colony.storage||s.colony.material>s.colony.storage)return null;
    if(!Object.values(s.metrics).every(v=>Number.isFinite(v)&&v>=0))return null;
    if(!['gathered','deposited','evolved','built','discovered','population','kills'].every(k=>Number.isFinite(s.metrics[k])))return null;
    if(!Number.isFinite(s.weatherAt)||!['clear','rain'].includes(s.weather)||!Number.isFinite(s.rallyUntil)||!Number.isFinite(s.rallyCooldown))return null;
    if(s.colony.egg&&(!Number.isFinite(s.colony.egg.remaining)||!Number.isFinite(s.colony.egg.total)||s.colony.egg.total<=0||s.colony.egg.remaining<0||s.colony.egg.remaining>s.colony.egg.total))return null;
    const ids=new Set();
    for(const a of [s.player,...s.agents]){
      if(typeof a.id!=='string'||ids.has(a.id)||!['player','companion','grazer','predator'].includes(a.kind))return null;
      ids.add(a.id);
      if(!a.carry||![a.x,a.z,a.hp,a.stamina,a.heading,a.cooldown,a.age,a.carry.food,a.carry.material].every(Number.isFinite)||Math.abs(a.x)>60||Math.abs(a.z)>60||a.hp<0||a.carry.food<0||a.carry.material<0)return null;
      if(a.kind==='companion'&&!['forage','build','guard'].includes(a.job))return null;
      if(a.species&&!SPECIES[a.species])return null;
      if(a.kind!=='player'&&a.kind!=='companion'&&a.hp===0&&![a.homeX,a.homeZ,a.respawnAt].every(Number.isFinite))return null;
      a.path=[];a.target=null;a.moveSpeed=0;a.decision=0;a.work=0;
    }
    if(s.player.kind!=='player'||s.agents.some(a=>a.kind==='player'))return null;
    for(const r of s.resources)if(!['food','material','relic'].includes(r.kind)||![r.x,r.z,r.amount,r.max].every(Number.isFinite)||r.amount<0||r.max<r.amount)return null;
    for(const b of s.buildings)if(!['home','nest','garden','cache'].includes(b.kind)||![b.x,b.z,b.progress].every(Number.isFinite)||b.progress<0||b.progress>1)return null;
    s.paused=false;s.selected=null;s.notifications=[];return upgradeState(s);
  }catch{return null;}
}
export function load(storage=globalThis.localStorage){
  try{
    const raw=storage.getItem(SAVE_KEY);
    const saved=raw&&deserialize(raw);
    if(saved)return {state:saved,isNew:false};
    const state=createState();
    if(raw)notify(state,'旧存档无法读取，已保留原记录并创建新的旅程。','danger');
    return {state,isNew:true,invalidRaw:raw||null};
  }catch{return {state:createState(),isNew:true};}
}
export function save(s,storage=globalThis.localStorage){
  try{storage.setItem(SAVE_KEY,serialize(s));return true;}catch{return false;}
}
