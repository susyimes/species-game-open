import { SPECIES, NEST } from './config.js';
import { makeAgent } from './state.js';
import { dist } from './math.js';
import { walkable } from './terrain.js';
import { emit } from './events.js';
import { seaRoutes, seaRoute, routeToward } from './sea-navigation.js';
import { clockInfo } from './clock.js';
import { hostileTarget, canListen } from './hostility.js';

export const arrivalActive=a=>!['resolved','cancelled'].includes(a.status);
export function canArrive(s,species,count=2,trial=false) {
  const alive=s.ecology.arrivals.filter(arrivalActive),day=clockInfo(s).day;
  const quota=s.ecology.dayQuotas.find(q=>q.day===day)||{total:0,hostile:0};
  const hostile=SPECIES[species]?.kind==='predator';
  if(!SPECIES[species]?.marine||count<2||count>4)return false;
  if(hostile&&alive.filter(a=>SPECIES[a.species]?.kind==='predator').reduce((n,a)=>n+a.roster.length,0)+count>3)return false;
  if(alive.length>=2||alive.reduce((n,a)=>n+a.roster.length,0)+count>8||s.agents.length+count>64)return false;
  if(hostile&&(s.clock.tick<s.ecology.adaptationUntilTick||s.completed.length<6||alive.some(a=>SPECIES[a.species]?.kind==='predator')))return false;
  if(!trial&&(quota.total>=2||(hostile&&quota.hostile>=1)||s.chapter.trial&&!['resolved','failed','interrupted'].includes(s.chapter.trial.status)))return false;
  return true;
}
export function createArrival(s,{species='tideback',routeId,count=2,startTick=s.clock.tick+1200,trial=false}={}) {
  const route=routeId?seaRoute(routeId,s):seaRoutes(s)[0];
  if(!route||!canArrive(s,species,count,trial)||startTick<s.clock.tick+1200)return null;
  const id=`arrival-${s.nextId++}`,day=clockInfo(s).day;
  let quota=s.ecology.dayQuotas.find(q=>q.day===day);
  if(!quota){quota={day,total:0,hostile:0};s.ecology.dayQuotas.push(quota);s.ecology.dayQuotas=s.ecology.dayQuotas.slice(-4);}
  quota.total++;if(SPECIES[species]?.kind==='predator')quota.hostile++;
  const arrival={id,species,routeId:route.id,status:'announced',warningTick:s.clock.tick,startTick,trial,
    roster:[],feedCount:0,lastFeedTick:-300,firstFeedTick:null,lastPlayerDamageTick:null,routeRevision:0,
    resolved:false,endTick:trial?startTick+2400:startTick+(species==='tideback'?150:120)*20};
  for(let i=0;i<count;i++) {
    const id=`marine-${s.nextId++}`,theta=route.theta+(i-(count-1)/2)*.022;
    const a=makeAgent(id,SPECIES[species].kind,Math.cos(theta)*56,Math.sin(theta)*56,'forage',species);
    Object.assign(a,{origin:'marine',arrivalId:arrival.id,returnRouteId:route.id,controller:'rule',marinePhase:'offshore',lootClaimed:false});
    s.agents.push(a);arrival.roster.push({id,status:'alive'});
  }
  s.ecology.arrivals.push(arrival);
  emit(s,'ArrivalAnnounced',{arrivalId:id,species,routeId:route.id,count,startTick},`${route.name}的海面出现了靠近的水纹。来客将在至少一分钟后上岸。`,trial);
  return arrival;
}
export function marineOpportunities(s,slot) {
  const ops=[],routes=seaRoutes(s);if(s.journey?.active)return ops;
  for(const a of s.ecology.arrivals.filter(arrivalActive).slice(0,2)){
    const basis=`arrival:${a.id}:${a.status}`;
    ops.push({id:`marine:${slot}:${a.id}`,role:'marine',arrival_id:a.id,revision:a.routeRevision,basis_ids:[basis],
      allowed_choices:[{action_id:'hold',variant_id:'continue'},{action_id:'return_to_sea',variant_id:'homeward'}],
      observations:{species:a.species,phase:a.status,feeds:a.feedCount,weather:s.weather}});
  }
  if(ops.length<2&&s.time>=360){
    for(const species of (s.mapId==='rift'?['tideblade']:['tideback','reefjaw']))if(ops.length<2&&canArrive(s,species)){
      ops.push({id:`marine:${slot}:visit:${species}`,role:'marine',species,basis_ids:[`coast:weather:${s.weather}`],
        allowed_choices:[{action_id:'hold',variant_id:'remain_at_sea'},...routes.map(r=>({action_id:'enter_sea_route',variant_id:r.id}))],
        observations:{species,weather:s.weather,tide:s.tide.bucket,shoreHistory:s.ecology.arrivals.filter(a=>a.resolved).slice(-3).map(a=>({route:a.routeId,outcome:a.outcome}))}});
    }
  }
  return ops;
}
export function applyMarineChoice(s,op,choice) {
  if(op.arrival_id){
    const a=s.ecology.arrivals.find(a=>a.id===op.arrival_id&&arrivalActive(a));
    if(!a||a.routeRevision!==op.revision)return 'group_changed';
    if(choice.action_id==='return_to_sea'){
      // A chapter's fixed challenge cannot be silently skipped by a model.
      if(a.trial)return 'chapter_window';
      depart(s,a,'natural');
    }
    return null;
  }
  if(choice.action_id==='hold')return null;
  return createArrival(s,{species:op.species,routeId:choice.variant_id})?null:'budget_or_route';
}
export function depart(s,arrival,reason){
  if(arrival.status==='departing'||!arrivalActive(arrival))return;
  arrival.status='departing';arrival.departReason=reason;arrival.routeRevision++;
  for(const row of arrival.roster){const a=s.agents.find(a=>a.id===row.id);if(a&&!a.dominated){a.path=[];a.target=null;a.decision=0;a.pacifiedUntil=s.time+120;}}
  emit(s,'ArrivalDeparting',{arrivalId:arrival.id,reason},'海上的来客开始沿着潮水返回。',arrival.trial);
}
export function feedArrival(s,a){
  const arrival=s.ecology.arrivals.find(x=>x.id===a.arrivalId&&arrivalActive(x));
  if(!arrival)return {ok:false,reason:'这一批来客已经离开。'};
  if(s.clock.tick-arrival.lastFeedTick<300)return {ok:false,waiting:true,reason:'来客还在享用上一次的食物。'};
  if(s.player.carry.food<8)return {ok:false,reason:'背包需要 8 食物，可以在巢边携带口粮。'};
  s.player.carry.food-=8;s.player.reservedFood=Math.max(0,(s.player.reservedFood||0)-8);
  arrival.feedCount++;arrival.lastFeedTick=s.clock.tick;arrival.firstFeedTick??=s.clock.tick;
  for(const row of arrival.roster){const member=s.agents.find(x=>x.id===row.id);if(member){member.pacifiedUntil=s.time+90;member.path=[];member.decision=0;}}
  emit(s,'MarineFed',{arrivalId:arrival.id,food:8,count:arrival.feedCount},'来客低头享用食物，暂时放下了戒备。',arrival.trial);
  return {ok:true};
}
export function migrationTick(s){
  for(const arrival of s.ecology.arrivals.filter(arrivalActive)){
    const blocked=arrival.roster.some(row=>{const a=s.agents.find(a=>a.id===row.id);return a&&a.hp>0&&!a.dominated&&a.routeBlockedSinceTick!=null&&s.clock.tick-a.routeBlockedSinceTick>=600;});
    if(blocked&&!arrival.interruptionReason){
      arrival.interruptionReason='route_unavailable';depart(s,arrival,'route_unavailable');
      emit(s,'ArrivalInterrupted',{arrivalId:arrival.id,reason:'route_unavailable'},'这批来客的航路暂时无法通行，行程已中断。它们会留在岸边寻找归路。',arrival.trial);
    }
    let living=0,playerRetreat=false;
    for(const row of arrival.roster){
      const a=s.agents.find(a=>a.id===row.id);
      if(!a)continue;
      if(a.dominated){row.status='adopted';continue;}
      if(a.lastAttackSide==='player'&&a.hitAt!==undefined){
        arrival.lastPlayerDamageTick=Math.max(arrival.lastPlayerDamageTick??-1,Math.round(a.hitAt*20));
        if(a.hp<=SPECIES[a.species].hp*.35)playerRetreat=true;
      }
      if(a.hp<=0){row.status='defeated';continue;}
      if(a.marinePhase==='gone'){row.status='departed';continue;}
      living++;
    }
    if(playerRetreat){arrival.repulsedByPlayer=true;depart(s,arrival,'repelled');}
    const peaceful=arrival.feedCount>=2&&s.clock.tick-arrival.lastFeedTick>=600&&
      (arrival.lastPlayerDamageTick===null||arrival.lastPlayerDamageTick<arrival.firstFeedTick);
    arrival.peaceful=peaceful;
    if(peaceful)depart(s,arrival,'coexist');
    if(s.clock.tick>=arrival.endTick)depart(s,arrival,'window_end');
    if(!living){
      arrival.status='resolved';arrival.resolved=true;arrival.resolvedTick=s.clock.tick;
      arrival.outcome=arrival.peaceful?'coexist':arrival.repulsedByPlayer?'repelled':'departed';
      emit(s,'ArrivalResolved',{arrivalId:arrival.id,outcome:arrival.outcome,roster:arrival.roster.map(r=>({...r}))},'这一批海上来客的行程结束了。',arrival.trial);
    }
  }
  const activeIds=new Set(s.ecology.arrivals.filter(arrivalActive).flatMap(a=>a.roster.map(r=>r.id)));
  s.agents=s.agents.filter(a=>a.origin!=='marine'||a.dominated||a.releasedDeparture&&a.marinePhase!=='gone'||activeIds.has(a.id));
  // Critical chapter evidence is retained separately; normal history is bounded.
  const finished=s.ecology.arrivals.filter(a=>!arrivalActive(a));
  if(finished.length>12){const keep=new Set(finished.slice(-12).map(a=>a.id));s.ecology.arrivals=s.ecology.arrivals.filter(a=>arrivalActive(a)||a.id===s.chapter.trial?.arrivalId||keep.has(a.id));}
}
export function marineStep(s,a,dt,{walk,attack}) {
  if(a.hp<=0){a.moveSpeed=0;return true;}
  if(a.dominated)return false;
  if(a.releasedDeparture){
    const r=seaRoute(a.returnRouteId,s)||seaRoutes(s)[0];
    if(!r){a.moveSpeed=0;return true;}
    if(dist(a,r.entry)<2){a.marinePhase='gone';a.moveSpeed=0;return true;}
    a.decision-=dt;if(a.decision<=0||!a.path.length)routeToward(s,a,r.entry);
    a.behavior='return';walk(a,dt,SPECIES[a.species].seaSpeed,true);return true;
  }
  const arrival=s.ecology.arrivals.find(x=>x.id===a.arrivalId),route=arrival&&seaRoute(arrival.routeId,s);
  if(!arrival||!route){a.moveSpeed=0;return true;}
  a.cooldown=Math.max(0,a.cooldown-dt);a.decision-=dt;
  const spec=SPECIES[a.species];
  if(arrival.status==='departing'){
    if(dist(a,route.entry)<2){a.marinePhase='gone';a.moveSpeed=0;return true;}
    if(a.decision<=0||!a.path.length)routeToward(s,a,route.entry);
    a.behavior='return';walk(a,dt,spec.seaSpeed,true);return true;
  }
  if(s.clock.tick<arrival.startTick){
    if(dist(a,route.near)>2){if(a.decision<=0||!a.path.length)routeToward(s,a,route.near);walk(a,dt,spec.seaSpeed,true);}
    else{a.path=[];a.moveSpeed=0;a.behavior='wait';}return true;
  }
  if(a.marinePhase!=='onshore'){
    arrival.status='landing';
    if(dist(a,route.land)<2.3){a.marinePhase='onshore';a.path=[];a.decision=0;arrival.status='onshore';}
    else{if(a.decision<=0||!a.path.length)routeToward(s,a,route.land);a.behavior='walk';walk(a,dt,spec.seaSpeed,true);return true;}
  }
  const listening=canListen(s,a);
  if(listening){a.path=[];a.moveSpeed=0;a.behavior='curious';return true;}
  const target=hostileTarget(s,a,{anchor:route.land,marine:true});
  if(target){if(a.huntTargetId!==target.id||dist(a,target)<=2.05){a.path=[];a.decision=0;}if(dist(a,target)>2.05&&(a.decision<=0||!a.path.length))routeToward(s,a,target);a.huntTargetId=target.id;a.decision=Math.min(a.decision,.6);a.behavior='attack';walk(a,dt,spec.speed,true);attack(s,a,target,dt,spec.attack);return true;}
  if(a.huntTargetId){a.huntTargetId=null;a.path=[];a.decision=0;}
  if(a.decision<=0){
    // A chapter feeding trial must remain reachable without a swimming evolution.
    const shoreOnly=arrival.trial||s.weather==='squall';
    const r=s.resources.filter(r=>r.kind==='food'&&r.amount>=1&&dist(a,r)<12&&dist(r,NEST)>10&&(!arrival.trial||!r.coast)&&(!shoreOnly||walkable(r.x,r.z,false,{mapId:s.mapId,level:.5}))).sort((x,y)=>dist(a,x)-dist(a,y))[0];
    if(r){routeToward(s,a,r);a.marineFoodId=r.id;}
    a.decision=5;
  }
  const r=s.resources.find(r=>r.id===a.marineFoodId);
  if(r&&dist(a,r)<2.5){a.path=[];a.behavior='gather';a.moveSpeed=0;a.work+=dt;if(a.work>=5){r.amount=Math.max(0,r.amount-.25);a.work=0;}}
  else{a.behavior='forage';walk(a,dt,spec.speed,true);}
  return true;
}
