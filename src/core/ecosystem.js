import { BIOMES, NEST, SPECIES } from './config.js';
import { makeAgent } from './state.js';
import { terrainFor, biomeAt } from './terrain.js';
import { seaRoutes, seaRoute } from './sea-navigation.js';
import { dist, clamp } from './math.js';
import { emit, disruptStability } from './events.js';
import { CRISIS_ENTER, CRISIS_EXIT, JUVENILE_SECONDS, initHabitat, isJuvenile, isResident } from './survival-config.js';
import { rivalCapacity, rivalTick } from './rivals.js';

export function protectedAt(s,a){return (s.habitatHealth?.protected||[]).includes(biomeAt(a.x,a.z,s).id);}
export function mayHunt(s,a,target){
  if(!protectedAt(s,target)||!['player','companion'].includes(a.kind)&&!a.dominated)return true;
  return [s.player,...s.agents.filter(b=>b.kind==='companion'||b.dominated)].some(b=>b.lastAttackerId===target.id&&s.time-(b.hitAt??-100)<8);
}
export function edibleAmount(s,r){
  if(r.coast==='tidal'&&!s.parts.includes('fins'))return 0;
  const reserve=s.habitatHealth?.reserveFruit&&r.kind==='food'&&!r.carcass&&!r.coast&&protectedAt(s,r)?4:0;
  return Math.max(0,r.amount-reserve);
}
function breedSite(s,species){
  const adults=s.agents.filter(a=>isResident(a)&&a.species===species&&a.hp>0&&!isJuvenile(s,a));
  const terrain=terrainFor(s),swim=!!SPECIES[species]?.swim;
  for(const parent of adults){
    if(!adults.some(a=>a!==parent&&dist(parent,a)<18))continue;
    if(species==='emberfang'&&s.mapId==='home'){
      if((s.habitatHealth?.rivals?.food||0)>=6)return {parent,point:parent,rival:true};
      continue;
    }
    if(SPECIES[species].kind==='predator'&&!s.agents.some(a=>isResident(a)&&a.kind==='grazer'&&a.hp>0&&dist(parent,a)<16))continue;
    const food=s.resources.find(r=>r.kind==='food'&&!r.carcass&&!r.coast&&r.amount>=4&&dist(parent,r)<14&&terrain.findPath(parent,r,swim,{level:.5}));
    if(food)return {parent,food};
  }
  return null;
}
export function habitatInfo(s){
  const h=s.habitatHealth,baseline=h?.baseline||{},residents=s.agents.filter(a=>isResident(a)&&a.hp>0);
  const species=Object.entries(baseline).map(([id,normal])=>({id,normal,count:residents.filter(a=>a.species===id).length,breeding:!!breedSite(s,id)}));
  const normal=Object.values(baseline).reduce((a,b)=>a+b,0)||1;
  return {species,total:residents.length,normal,ratio:Math.min(1,residents.length/normal),breedingSpecies:species.filter(a=>a.breeding).length};
}
function clearDead(s){
  s.agents=s.agents.filter(a=>a.hp>0||a.origin==='marine');
  const live=new Set(s.agents.map(a=>a.id));
  for(const g of s.ecology.groups){const ids=g.memberIds.filter(id=>live.has(id));if(ids.length!==g.memberIds.length){g.memberIds=ids;g.groupRevision++;g.intent=null;}}
}
function safeBirthPoint(s,center,swim=false){
  const t=terrainFor(s);
  for(let radius=1.5;radius<=7;radius+=1.5)for(let i=0;i<12;i++){
    const angle=i*Math.PI/6,p={x:center.x+Math.cos(angle)*radius,z:center.z+Math.sin(angle)*radius};
    if(dist(p,NEST)>9&&t.walkable(p.x,p.z,swim,{level:.5})&&t.TREES.every(a=>dist(a,p)>1.7)&&t.findPath(center,p,swim,{level:.5}))return p;
  }
  return null;
}
function spawnYoung(s,species,point,count=1){
  const positions=Array.from({length:count},(_,i)=>safeBirthPoint(s,{x:point.x+i*.8,z:point.z},!!SPECIES[species].swim));
  if(positions.some(p=>!p))return false;
  clearDead(s);if(s.agents.length+count>64)return false;
  for(const p of positions){
    const a=makeAgent('wild-young-'+s.nextId++,SPECIES[species].kind,p.x,p.z,'forage',species);a.juvenileUntil=s.time+JUVENILE_SECONDS;a.pacifiedUntil=s.time+30;
    const group=s.ecology.groups.filter(g=>g.species===species).sort((x,y)=>dist(x.home,p)-dist(y.home,p))[0];
    if(group){a.groupId=group.id;a.origin='resident';group.memberIds.push(a.id);group.groupRevision++;group.intent=null;}
    s.agents.push(a);
  }
  return true;
}
export function configureHabitat(s,key,value){
  initHabitat(s);
  if(key==='reserveFruit'&&typeof value==='boolean')s.habitatHealth.reserveFruit=value;
  else if(key==='protected'&&BIOMES.some(b=>b.id===value)){
    const list=s.habitatHealth.protected;s.habitatHealth.protected=list.includes(value)?list.filter(x=>x!==value):[...list,value];
  }else return {ok:false,reason:'未知的保护设置。'};
  return {ok:true};
}
export function releaseYoung(s,species){
  if(s.journey?.active||dist(s.player,NEST)>5)return {ok:false,reason:'先回到家园，再安排放归。'};
  if(!SPECIES[species]||(s.colony.nursery?.[species]||0)<2)return {ok:false,reason:'需要同种的两枚卵囊，才能建立繁殖对。'};
  const biome=SPECIES[species].biome;
  if(!s.habitatHealth.protected.includes(biome))return {ok:false,reason:`先把${BIOMES.find(b=>b.id===biome)?.name||'原生栖息地'}设为禁猎区。`};
  const food=s.resources.filter(r=>r.kind==='food'&&!r.coast&&!r.carcass&&r.amount>=4&&biomeAt(r.x,r.z,s).id===biome).sort((a,b)=>b.amount-a.amount)[0];
  if(!food)return {ok:false,reason:'这片保护区还没有足够野果，先保留至少一丛 4 份野果。'};
  if(!spawnYoung(s,species,food,2))return {ok:false,reason:'当前没有安全的放归地点或生态空间。'};
  s.colony.nursery[species]-=2;emit(s,'WildlifeReleased',{species,count:2},`${SPECIES[species].name}的两只幼体已在保护区安顿，成年后可以繁殖。`);return {ok:true,point:{x:food.x,z:food.z}};
}
export function immigrationPosition(s){
  const incoming=s.habitatHealth?.incoming,route=incoming&&seaRoute(incoming.routeId,s);if(!route)return null;
  const progress=clamp((s.time-incoming.startedAt)/60,0,1),p=progress*progress*(3-2*progress);
  return {x:route.entry.x+(route.land.x-route.entry.x)*p,z:route.entry.z+(route.land.z-route.entry.z)*p};
}
export function habitatTick(s,dt=1){
  initHabitat(s);const h=s.habitatHealth,info=habitatInfo(s);
  const extinct=info.species.filter(a=>!a.count).map(a=>a.id);
  for(const id of extinct.filter(id=>!h.extinct.includes(id)))emit(s,'LocalExtinction',{species:id},`${SPECIES[id].name}已在这座岛局部灭绝。海岸迁入或带回卵囊可以恢复。`);
  h.extinct=extinct;
  if(!h.critical&&info.ratio<=CRISIS_ENTER){h.critical=true;h.recovery=0;disruptStability(s,'生态临界');}
  if(h.critical){
    h.recovery=info.ratio>=CRISIS_EXIT&&info.breedingSpecies>=2?h.recovery+dt:0;
    if(h.recovery>=60){h.critical=false;h.recovery=0;emit(s,'EcologyRecovered',{total:info.total},'两种以上生物重新具备繁殖条件，生态临界已经解除。');}
  }
  h.stress=clamp(h.stress+(h.critical?1:-1)*dt/120,0,1);
  const level=h.critical?'critical':info.ratio<.4?'endangered':h.stress>0?'recovering':'healthy';
  if(level!==h.level){h.level=level;emit(s,'EcologyDangerChanged',{level,ratio:info.ratio},({critical:'生态进入临界！接下来的两分钟里，野果与果圃产出会逐渐降低。保护、放归或远征都能挽救。',endangered:'常驻野生生物不足正常规模的四成，先保留繁殖对。',recovering:'植被正在慢慢恢复。继续保留野果和野生繁殖对。',healthy:'这座岛的野生种群重新稳定了。'})[level]);}
  if(['critical','endangered'].includes(level))s.survival.guideEcology=true;
  for(const row of info.species){
    const limit=row.id==='emberfang'&&s.mapId==='home'?rivalCapacity(s):row.normal;
    const site=row.breeding&&row.count<limit?breedSite(s,row.id):null;
    h.breeding[row.id]=site?(h.breeding[row.id]||0)+dt:0;
    if(h.breeding[row.id]>=120&&spawnYoung(s,row.id,site.point||site.food)){
      if(site.rival)h.rivals.food-=6;else site.food.amount-=2;
      h.breeding[row.id]=0;emit(s,'WildlifeBorn',{species:row.id,food:site.rival?6:2},row.id==='emberfang'?'赤鬃猎兽养育了新的幼体，猎群正在壮大。':'');
    }
  }
  rivalTick(s);
  if(h.incoming){
    if(s.time>=h.incoming.startedAt+60){
      const route=seaRoute(h.incoming.routeId,s);
      if(route&&spawnYoung(s,h.incoming.species,route.land,2))emit(s,'CoastalRecolonisation',{species:h.incoming.species},'漂来的卵囊在岸边孵化了，保护这些幼体，它们会重新建立种群。');
      h.incoming=null;h.immigrationAt=s.time+300;
    }
  }else if(s.time>=h.immigrationAt){
    const route=seaRoutes(s).find(route=>s.resources.some(r=>r.kind==='food'&&!r.carcass&&r.amount>=2&&dist(r,route.land)<10));
    if(extinct.length&&route&&s.weather!=='squall'){
      h.incoming={species:extinct[0],routeId:route.id,startedAt:s.time};emit(s,'CoastalEggsSighted',{species:extinct[0],routeId:route.id},'海面漂来一团带卵的枝叶，约一分钟后抵岸。留些岸边食物，等待幼体安顿。');
    }else h.immigrationAt=s.time+30;
  }
}
