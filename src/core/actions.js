import { EVOLUTIONS, APPEARANCES, BUILDINGS, JOBS, NEST, SEA_RADIUS, speciesStats } from './config.js';
import { evolutionChoice } from './evolution.js';
import { clamp, dist } from './math.js';
import { terrainFor } from './terrain.js';
import { notify, population, nearbyContext } from './state.js';
import { navigation } from './weather.js';
import { emit } from './events.js';
import { startHatching } from './food.js';
import { isJuvenile } from './survival-config.js';
import { mayHunt, edibleAmount } from './ecosystem.js';
import { feedingApproach } from './sea-navigation.js';

const fail=(reason)=>({ok:false,reason});
export function moveTo(s,target,interaction=null) {
  const {findPath}=terrainFor(s);
  if(!target||!Number.isFinite(target.x+target.z))return fail('这条路走不通。');
  if(Math.hypot(target.x,target.z)>SEA_RADIUS)return fail('远处是尚未探索的外海，先留在小岛周围的近海。');
  const stats=speciesStats(s.parts,s.style),nav=navigation(s),path=findPath(s.player,target,stats.swim,nav);
  if(!path){
    if(!stats.swim&&findPath(s.player,target,true,nav))return fail('这段水路需要潮汐侧鳍。随时打开进化，即可解锁游泳。');
    return fail('这条路线被障碍挡住了，试试旁边的空地。');
  }
  s.player.path=path;s.player.target=interaction;s.player.behavior='walk';s.player.work=0;
  return {ok:true};
}
export function interact(s,entity=null) {
  const p=s.player,ctx=entity||nearbyContext(s);
  if(!ctx)return fail('靠近浆果、矿石或远古孢子后再试。');
  if(ctx.type==='enemy'&&!mayHunt(s,p,ctx.entity))return fail('禁猎区保留野生生物，受到攻击时仍可反击。');
  if(ctx.type==='resource'&&edibleAmount(s,ctx.entity)<1)return fail(ctx.entity.coast==='tidal'&&!s.parts.includes('fins')?'先长出潮汐侧鳍，再利用近海食源。':'这丛野果已留给野生生物，换一处采集。');
  if(ctx.type==='home'){p.path=[];p.target=null;p.behavior='rest';return {ok:true};}
  if(dist(p,ctx.entity)>3){
    const target=ctx.type==='feed'?feedingApproach(s,p,ctx.entity,speciesStats(s.parts,s.style).swim,navigation(s)):ctx.entity;
    if(!target)return fail('来客离可通行岸边太远，等它上岸或长出侧鳍后再投喂。');
    return moveTo(s,target,{type:ctx.type,id:ctx.entity.id});
  }
  p.target={type:ctx.type,id:ctx.entity.id};p.path=[];p.work=0;p.behavior=ctx.type==='enemy'?'attack':'gather';
  return {ok:true};
}
export function stopPlayer(s){
  s.player.path=[];s.player.target=null;s.player.behavior='idle';s.player.work=0;s.player.moveSpeed=0;
  return {ok:true};
}
export function provisions(s,returning=false){
  const p=s.player;
  if(dist(p,NEST)>5)return fail('靠近巢穴，再携带或归还口粮。');
  if(returning){
    const amount=Math.min(p.reservedFood||0,Math.max(0,Math.floor(s.colony.storage-s.colony.food)));
    if(!amount)return fail('没有待归还的口粮，或仓库已满。');
    p.carry.food-=amount;p.reservedFood-=amount;s.colony.food+=amount;
    emit(s,'ProvisionsReturned',{food:amount},`已归还 ${amount} 食物。`);return {ok:true};
  }
  if(p.reservedFood>0)return fail('先使用或归还已经携带的口粮。');
  if(s.colony.food<8||speciesStats(s.parts,s.style).carry-p.carry.food-p.carry.material<8)return fail('仓库需要 8 食物，背包需要 8 个空位。');
  s.colony.food-=8;p.carry.food+=8;p.reservedFood=8;
  emit(s,'ProvisionsLoaded',{food:8},'已带上 8 食物，返回巢边时会为你保留。');return {ok:true};
}
export function commandCompanion(s,id,command){
  const a=s.agents.find(a=>a.id===id&&a.kind==='companion');
  if(!a)return fail('先选择一位同伴。');
  if(isJuvenile(s,a))return fail('幼体正在长大，成年后再分配工作。');
  if(command==='follow')a.manualFollow=!a.manualFollow;
  else if(command in JOBS){a.job=command;a.manualFollow=false;a.ralliedUntil=0;}
  else return fail('未知的同伴指令。');
  a.path=[];a.target=null;a.decision=0;a.work=0;
  return {ok:true};
}
export function evolve(s,id) {
  const choice=evolutionChoice(s,id);if(!choice.ok)return fail(choice.reason);
  const e=choice.part,before=speciesStats(s.parts,s.style);s.colony.dna-=choice.cost;s.parts=choice.parts;s.generation++;s.metrics.evolved++;
  // A larger stamina reserve keeps the same fill ratio; evolving away from home is not a healing action.
  s.player.stamina=clamp(s.player.stamina/before.stamina,0,1)*speciesStats(s.parts,s.style).stamina;
  notify(s,`第 ${s.generation} 代：族群长出了${e.name}。`,'evolve');
  return {ok:true};
}
export function setAppearance(s,id){
  if(!APPEARANCES.some(a=>a.id===id))return fail('未知的体色。');
  s.appearance=id;return {ok:true};
}
export function build(s,kind) {
  if(s.journey?.active)return fail('远征营地用于休整。回到家园再营造。');
  const {walkable}=terrainFor(s);
  const spec=BUILDINGS.find(b=>b.id===kind);
  if(!spec)return fail('未知的设施。');
  if(s.buildings.some(b=>b.progress<1))return fail('先完成当前的营造工程。');
  if(s.buildings.filter(b=>b.kind===kind).length>=spec.max)return fail('这种设施已经足够了。');
  if(s.colony.food<spec.cost.food||s.colony.material<spec.cost.material)return fail('巢穴中的食物或材料不足。');
  const slots=[[5,2],[-1,3],[12,9],[5,16],[-2,13],[12,17],[-3,18],[14,2]];
  const spot=slots.find(([x,z])=>walkable(x,z)&&s.buildings.every(b=>dist(b,{x,z})>3));
  if(!spot)return fail('巢穴附近没有空地了。');
  s.colony.food-=spec.cost.food;s.colony.material-=spec.cost.material;
  s.buildings.push({id:'b'+s.nextId++,kind,x:spot[0],z:spot[1],progress:0});
  if(!s.agents.some(a=>a.kind==='companion'&&a.job==='build'))assignJob(s,'build',1);
  notify(s,`${spec.name}已开始营造，同伴正在赶往工地。`,'build');
  return {ok:true};
}
export function assignJob(s,job,delta) {
  if(!(job in JOBS)||![-1,1].includes(delta))return fail('无法分配这项工作。');
  const companions=s.agents.filter(a=>a.kind==='companion'&&!isJuvenile(s,a));
  let agent;
  if(delta===1)agent=companions.find(a=>a.job!==job&&a.job==='guard')||companions.find(a=>a.job!==job);
  else agent=companions.find(a=>a.job===job);
  if(!agent)return fail(delta===1?'所有同伴都已分配到这里。':'这里已经没有同伴了。');
  agent.job=delta===1?job:job==='forage'?'guard':'forage';agent.target=null;agent.path=[];agent.decision=0;
  return {ok:true};
}
export function hatch(s) {
  return startHatching(s);
}
export function rally(s) {
  if(s.time<s.rallyCooldown)return fail('同伴还在响应上一次召唤。');
  const stats=speciesStats(s.parts,s.style),guards=s.agents.filter(a=>a.kind==='companion'&&!isJuvenile(s,a)&&a.job==='guard'&&dist(a,s.player)<=stats.rallyRadius);
  if(!guards.length)return fail('附近没有听得见呼唤的守卫。靠近同伴后再试。');
  s.rallyUntil=s.time+stats.rallyDuration;s.rallyCooldown=s.time+28;
  for(const a of guards){a.ralliedUntil=s.rallyUntil;a.decision=0;}
  notify(s,`${guards.length} 位守卫听见了呼唤，将陪你同行 ${stats.rallyDuration} 秒。`);
  return {ok:true};
}
