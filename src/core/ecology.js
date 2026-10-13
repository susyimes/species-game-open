import { SPECIES, NEST } from './config.js';
import { biomeAt, findPath, walkable } from './terrain.js';
import { dist } from './math.js';
import { clockInfo } from './clock.js';
import { environment, navigation } from './weather.js';
import { emit } from './events.js';
import { marineOpportunities, applyMarineChoice } from './migration.js';
import { ECOLOGY_TIMING, validateChoices } from './ecology-commands.js';

export function initGroups(s){
  const ecology=s.ecology;
  if(ecology.initialized)return;
  for(const [species,spec] of Object.entries(SPECIES).filter(([id,spec])=>!spec.marine||id==='tideblade'&&s.mapId!=='home')){
    const members=s.agents.filter(a=>a.species===species&&a.kind!=='companion'&&!a.dominated).sort((a,b)=>a.x-b.x);
    const split=s.mapId&&s.mapId!=='home'?(species==='riftstalker'?2:members.length):(members.length>=4?Math.ceil(members.length/2):members.length);
    for(let i=0;split&&i<members.length;i+=split){
      const groupMembers=members.slice(i,i+split),home={x:groupMembers.reduce((n,a)=>n+a.x,0)/groupMembers.length,z:groupMembers.reduce((n,a)=>n+a.z,0)/groupMembers.length};
      const id=`${species}-${i/split}`;
      ecology.groups.push({id,species,memberIds:groupMembers.map(a=>a.id),groupRevision:0,home,regionId:biomeAt(home.x,home.z,s).id,lastSlot:0,events:[],intent:null});
      for(const a of groupMembers){a.groupId=id;a.origin='resident';}
    }
  }
  ecology.initialized=true;
}
function members(s,g){return s.agents.filter(a=>g.memberIds.includes(a.id)&&!a.dominated&&a.hp>0);}
function groupOpportunity(s,g,slot){
  const agents=members(s,g);if(!agents.length)return null;
  const center={x:agents.reduce((n,a)=>n+a.x,0)/agents.length,z:agents.reduce((n,a)=>n+a.z,0)/agents.length};
  const spec=SPECIES[g.species],sight=Math.max(6,14*environment(s).sight),swim=!!spec.swim;
  const foods=s.resources.filter(r=>r.kind==='food'&&(spec.kind!=='predator'||r.carcass)&&r.amount>=1&&dist(center,r)<sight&&dist(r,NEST)>10).sort((a,b)=>dist(center,a)-dist(center,b)).slice(0,3);
  const recentHurt=agents.some(a=>a.hitAt!==undefined&&s.time-a.hitAt<720);
  const choices=[{action_id:'hold',variant_id:'local'}],targets={};
  for(const food of foods){const id=`food:${food.id}`;if(findPath(center,food,swim,navigation(s))){choices.push({action_id:'forage_patch',variant_id:id});targets[id]={x:food.x,z:food.z,resourceId:food.id};}}
  for(let i=0;i<8;i++){
    const theta=i*Math.PI/4,p={x:center.x+Math.cos(theta)*7,z:center.z+Math.sin(theta)*7};
    if(walkable(p.x,p.z,swim,navigation(s))&&dist(p,NEST)>10&&findPath(center,p,swim,navigation(s))){
      const id=`shelter:${i}`;targets[id]=p;choices.push({action_id:recentHurt?'avoid_region':'rest_at_shelter',variant_id:id});break;
    }
  }
  const prey=spec.kind==='predator'?s.agents.find(a=>a.kind==='grazer'&&!a.dominated&&a.hp>0&&dist(a,center)<sight&&dist(a,NEST)>10):null;
  if(prey){const id=`prey:${prey.id}`;targets[id]={x:prey.x,z:prey.z,entityId:prey.id};choices.push({action_id:'hunt_visible_prey',variant_id:id});}
  const basis=[`group:${g.id}:${g.groupRevision}`,`weather:${s.weather}`,`phase:${clockInfo(s).phase}`];
  return {id:`island:${slot}:${g.id}`,role:'island',group_id:g.id,revision:g.groupRevision,allowed_choices:choices,basis_ids:basis,targets,
    observations:{species:g.species,region:g.regionId,phase:clockInfo(s).phase,weather:s.weather,vegetationStress:s.habitatHealth?.stress||0,recentHurt,food:foods.map(r=>({id:r.id,stock:r.amount>=6?'plentiful':'low'})),encounters:g.events.slice(-8)}};
}
function pickRule(op){
  const actions=op.allowed_choices;
  if(op.role==='marine')return actions.find(a=>a.action_id==='enter_sea_route')||actions[0];
  if(op.observations.recentHurt)return actions.find(a=>a.action_id==='avoid_region')||actions[0];
  if(op.observations.weather==='squall'||op.observations.phase==='night'&&!['glowbug','emberfang'].includes(op.observations.species))return actions.find(a=>a.action_id==='rest_at_shelter')||actions[0];
  return actions.find(a=>a.action_id==='hunt_visible_prey')||actions.find(a=>a.action_id==='forage_patch')||actions[0];
}
function commitChoice(s,batch,op,c,source){
  let reason=null;
  const commandId=`${batch.id}:${op.id}:${source}`;
  if(s.ecology.appliedCommandIds.includes(commandId))return 'duplicate_command';
  if(op.role==='marine'){
    // Rule reservations already made in this slot are immutable, not a second spawn opportunity.
    if(source!=='rule'&&op.reservationId)return 'already_reserved';
    const before=s.ecology.arrivals.length;reason=applyMarineChoice(s,op,c);
    if(s.ecology.arrivals.length>before)op.reservationId=s.ecology.arrivals.at(-1).id;
  }else{
    const group=s.ecology.groups.find(g=>g.id===op.group_id);
    const target=op.targets[c.variant_id];
    if(!group||group.groupRevision!==op.revision||!members(s,group).length)reason='group_changed';
    else if(target?.resourceId&&!s.resources.some(r=>r.id===target.resourceId&&r.amount>=1))reason='missing_target';
    else if(target?.entityId&&!s.agents.some(a=>a.id===target.entityId&&a.hp>0&&!a.dominated))reason='missing_target';
    else if(target&&!findPath(members(s,group)[0]||group.home,target,!!SPECIES[group.species].swim,navigation(s)))reason='route_blocked';
    else{
      group.intent={actionId:c.action_id,variantId:c.variant_id,target:target||null,untilTick:batch.source_tick+3600,source,startTick:s.clock.tick,commandId};
      for(const a of members(s,group)){a.decision=0;a.path=[];}
    }
  }
  if(!reason){
    s.ecology.appliedCommandIds.push(commandId);s.ecology.appliedCommandIds=s.ecology.appliedCommandIds.slice(-256);
    emit(s,'IntentApplied',{commandId,role:op.role,groupId:op.group_id||op.arrival_id||null,action:c.action_id,source,sourceTick:batch.source_tick});
  }
  return reason;
}
export function consumeEcologyInbox(s){
  const e=s.ecology;
  for(const result of e.inbox.splice(0)){
    const before=s.eventSeq;
    const batch=e.pending?.find(b=>b.id===result.batchId);
    if(!batch||batch.epoch!==e.runEpoch||s.clock.tick>batch.acceptByTick||batch.closed){emit(s,'IntentRejected',{reason:'expired_or_stale'});continue;}
    let validated;
    try{validated=validateChoices(result.output,batch);}catch{validated={accepted:[],rejected:[{reason:'invalid_envelope'}]};}
    for(const c of validated.accepted){const op=batch.opportunities.find(o=>o.id===c.opportunity_id);const reason=commitChoice(s,batch,op,c,result.source==='mock'?'mock':'model');if(reason)emit(s,'IntentRejected',{reason,opportunityId:op.id});}
    const present=new Set(validated.accepted.map(c=>c.opportunity_id));
    for(const op of batch.opportunities)if(!present.has(op.id)&&op.role==='marine'&&!op.arrival_id&&!op.reservationId)commitChoice(s,batch,op,pickRule(op),'rule');
    for(const rejected of validated.rejected)emit(s,'IntentRejected',rejected);
    if(result.jobId){e.receipts??=[];e.receipts.push({jobId:result.jobId,applied_tick:s.clock.tick,events:s.recentEvents.filter(ev=>ev.seq>before&&['IntentApplied','IntentRejected'].includes(ev.type))});e.receipts=e.receipts.slice(-32);}
    batch.closed=true;
    for(const role of batch.roles)e.resolvedSlots[role.role]=Math.max(e.resolvedSlots[role.role]||0,role.slot_index);
  }
  e.pending=(e.pending||[]).filter(b=>!b.closed);
}
export function ecologyTick(s){
  initGroups(s);const e=s.ecology;
  for(const g of e.groups){
    const actual=s.agents.filter(a=>a.groupId===g.id&&!a.dominated).map(a=>a.id);
    if(actual.join('|')!==g.memberIds.join('|')){g.memberIds=actual;g.groupRevision++;g.intent=null;}
    for(const a of members(s,g))if(a.hitAt!==undefined&&s.time-a.hitAt<2&&!g.events.some(x=>x.tick===Math.round(a.hitAt*20)&&x.kind==='threat')){
      g.events.push({tick:Math.round(a.hitAt*20),kind:'threat',region:biomeAt(a.x,a.z,s).id});g.events=g.events.slice(-16);
    }
  }
  const island=Math.floor(s.time/120),marine=Math.floor(s.time/180),roles=[],ops=[];
  if(island>=e.nextIslandSlot){
    const chosen=e.groups.filter(g=>members(s,g).length).sort((a,b)=>a.lastSlot-b.lastSlot||a.id.localeCompare(b.id)).slice(0,4);
    for(const g of chosen){const op=groupOpportunity(s,g,island);if(op)ops.push(op);g.lastSlot=island;}
    roles.push({role:'island',slot_index:island});e.nextIslandSlot=island+1;
  }
  if(marine>=e.nextMarineSlot){ops.push(...marineOpportunities(s,marine));roles.push({role:'marine',slot_index:marine});e.nextMarineSlot=marine+1;}
  if(!roles.length)return;
  const batch={id:`decision-${s.clock.tick}`,schema_version:1,rules_version:s.rulesVersion,epoch:e.runEpoch||'',source_tick:s.clock.tick,
    acceptByTick:s.clock.tick+ECOLOGY_TIMING.acceptTicks,roles,opportunities:ops.slice(0,6)};
  // Land groups never wait for inference. New sea arrivals wait for the bounded model window.
  for(const op of batch.opportunities)if(op.role==='island'||!e.modelEnabled||op.arrival_id){
    const choice={...pickRule(op),role:op.role,opportunity_id:op.id,basis_ids:op.basis_ids.slice(0,1),reason:'依照当前习性与环境活动。'};
    commitChoice(s,batch,op,choice,'rule');
  }
  if(e.modelEnabled&&batch.opportunities.length){e.pending??=[];e.pending.push(batch);e.outbox.push(batch);}
  else for(const role of roles)e.resolvedSlots[role.role]=role.slot_index;
}
export function expireEcology(s){
  for(const batch of s.ecology.pending||[])if(!batch.closed&&s.clock.tick>batch.acceptByTick){
    for(const op of batch.opportunities)if(op.role==='marine'&&!op.arrival_id&&!op.reservationId)commitChoice(s,batch,op,pickRule(op),'rule');
    batch.closed=true;
    for(const role of batch.roles)s.ecology.resolvedSlots[role.role]=role.slot_index;
    emit(s,'DecisionFallback',{batchId:batch.id,reason:'deadline'});
  }
  s.ecology.pending=(s.ecology.pending||[]).filter(b=>!b.closed);
}
export function ecologyBehavior(s,a,dt,{route,walk,attack}){
  const group=s.ecology.groups.find(g=>g.id===a.groupId),intent=group?.intent;
  if(!intent||intent.untilTick<s.clock.tick||a.dominated)return false;
  if(a.species==='emberfang'&&s.mapId==='home'&&intent.actionId==='rest_at_shelter'&&s.weather!=='squall'&&s.clock.tick-intent.startTick>160)return false;
  const spec=SPECIES[a.species],danger=s.agents.find(b=>b.kind==='predator'&&!b.dominated&&b.hp>0&&dist(a,b)<5&&b!==a);
  if(a.kind==='grazer'&&(danger||dist(a,s.player)<5&&!(a.trust>0)))return false;
  if(a.hitAt!==undefined&&s.time-a.hitAt<3)return false;
  if(intent.actionId==='hold')return false;
  const target=intent.target;if(!target)return false;
  if(a.decision<=0){route(a,target,!!spec.swim);a.decision=3;}
  if(intent.actionId==='hunt_visible_prey'){
    const prey=s.agents.find(b=>b.id===target.entityId&&b.hp>0&&!b.dominated);
    if(!prey||dist(a,prey)>Math.max(6,14*environment(s).sight))return false;
    if(dist(a,prey)>2.05){if(a.decision<1)route(a,prey,!!spec.swim);walk(a,dt,spec.speed,!!spec.swim);}
    attack(s,a,prey,dt,spec.attack||8);return true;
  }
  if(dist(a,target)<2.5){
    a.path=[];a.moveSpeed=0;a.behavior=intent.actionId==='forage_patch'?'gather':'rest';
    const r=s.resources.find(r=>r.id===target.resourceId);
    const feeders=members(s,group).filter(b=>dist(b,target)<2.5).sort((a,b)=>a.id.localeCompare(b.id)).slice(0,2);
    if(r&&feeders.includes(a)){a.work+=dt;if(a.work>=5){r.amount=Math.max(0,r.amount-.25);a.work=0;}}
  }else{a.behavior='roam';walk(a,dt,spec.speed,!!spec.swim);}
  return true;
}
