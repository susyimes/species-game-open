import { EVOLUTIONS, APPEARANCES, BUILDINGS, JOBS, NEST, speciesStats } from './config.js';
import { evolutionChoice } from './evolution.js';
import { clamp, dist } from './math.js';
import { findPath, walkable } from './terrain.js';
import { notify, population, nearbyContext } from './state.js';

const fail=(reason)=>({ok:false,reason});
export function moveTo(s,target,interaction=null) {
  if(!target||!Number.isFinite(target.x+target.z))return fail('这条路走不通。');
  const path=findPath(s.player,target,speciesStats(s.parts).swim);
  if(!path)return fail('这里暂时走不通。深水需要侧鳍，树旁可以点附近的空地。');
  s.player.path=path;s.player.target=interaction;s.player.behavior='walk';s.player.work=0;
  return {ok:true};
}
export function interact(s,entity=null) {
  const p=s.player,ctx=entity||nearbyContext(s);
  if(!ctx)return fail('靠近浆果、矿石或远古孢子后再试。');
  if(ctx.type==='home'){p.path=[];p.target=null;p.behavior='rest';return {ok:true};}
  if(dist(p,ctx.entity)>3)return moveTo(s,ctx.entity,{type:ctx.type,id:ctx.entity.id});
  p.target={type:ctx.type,id:ctx.entity.id};p.path=[];p.work=0;p.behavior=ctx.type==='enemy'?'attack':'gather';
  return {ok:true};
}
export function stopPlayer(s){
  s.player.path=[];s.player.target=null;s.player.behavior='idle';s.player.work=0;s.player.moveSpeed=0;
  return {ok:true};
}
export function commandCompanion(s,id,command){
  const a=s.agents.find(a=>a.id===id&&a.kind==='companion');
  if(!a)return fail('先选择一位同伴。');
  if(command==='follow')a.manualFollow=!a.manualFollow;
  else if(command in JOBS){a.job=command;a.manualFollow=false;a.ralliedUntil=0;}
  else return fail('未知的同伴指令。');
  a.path=[];a.target=null;a.decision=0;a.work=0;
  return {ok:true};
}
export function evolve(s,id) {
  const choice=evolutionChoice(s,id);if(!choice.ok)return fail(choice.reason);
  const e=choice.part;s.colony.dna-=choice.cost;s.parts=choice.parts;s.generation++;s.metrics.evolved++;
  s.player.stamina=speciesStats(s.parts).stamina;s.player.hp=100;
  notify(s,`第 ${s.generation} 代：族群长出了${e.name}。`,'evolve');
  return {ok:true};
}
export function setAppearance(s,id){
  if(!APPEARANCES.some(a=>a.id===id))return fail('未知的体色。');
  if(dist(s.player,NEST)>5)return fail('回到巢边再改变体色吧。');
  s.appearance=id;return {ok:true};
}
export function build(s,kind) {
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
  const companions=s.agents.filter(a=>a.kind==='companion');
  let agent;
  if(delta===1)agent=companions.find(a=>a.job!==job&&a.job==='guard')||companions.find(a=>a.job!==job);
  else agent=companions.find(a=>a.job===job);
  if(!agent)return fail(delta===1?'所有同伴都已分配到这里。':'这里已经没有同伴了。');
  agent.job=delta===1?job:job==='forage'?'guard':'forage';agent.target=null;agent.path=[];agent.decision=0;
  return {ok:true};
}
export function hatch(s) {
  if(s.colony.egg)return fail('已有一枚卵在孵育。');
  if(population(s)>=s.colony.capacity)return fail('巢穴住满了，先营造育幼巢。');
  if(s.colony.food<18)return fail('孵育需要 18 食物。');
  const duration=30/speciesStats(s.parts).hatchSpeed;
  s.colony.food-=18;s.colony.egg={remaining:duration,total:duration};notify(s,'一枚新的卵，在巢中轻轻晃动。','birth');return {ok:true};
}
export function rally(s) {
  if(s.time<s.rallyCooldown)return fail('同伴还在响应上一次召唤。');
  const stats=speciesStats(s.parts),guards=s.agents.filter(a=>a.kind==='companion'&&a.job==='guard'&&dist(a,s.player)<=stats.rallyRadius);
  if(!guards.length)return fail('附近没有听得见呼唤的守卫。靠近同伴后再试。');
  s.rallyUntil=s.time+stats.rallyDuration;s.rallyCooldown=s.time+28;
  for(const a of guards){a.ralliedUntil=s.rallyUntil;a.decision=0;}
  notify(s,`${guards.length} 位守卫听见了呼唤，将陪你同行 ${stats.rallyDuration} 秒。`);
  return {ok:true};
}
