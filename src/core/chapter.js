import { secondChapterProgress, updateSecondChapter } from './journey.js';
import { NEST, QUESTS, EVOLUTIONS } from './config.js';
import { dist } from './math.js';
import { emit, disruptStability } from './events.js';
import { reserveTrialWeather } from './weather.js';
import { seaRoutes } from './sea-navigation.js';
import { createArrival, canArrive } from './migration.js';
import { foodOutlook } from './food.js';
import { livedSeconds } from './journey-config.js';

const population=s=>1+s.agents.filter(a=>a.kind==='companion').length;
export function chapterProgress(s){
  if(s.chapter.id==='second_island')return secondChapterProgress(s);
  const built=kind=>s.buildings.filter(b=>b.kind===kind&&b.progress===1).length;
  const base=s.parts.filter(id=>EVOLUTIONS.some(e=>e.id===id&&!e.parent)).length;
  const specialist=s.parts.filter(id=>EVOLUTIONS.some(e=>e.id===id&&e.parent&&s.parts.includes(e.parent))).length;
  const goals=[{id:'journey',label:'基础旅程',value:QUESTS.filter(q=>s.completed.includes(q.id)).length,target:6},
    {id:'population',label:'族群成员',value:population(s),target:10},
    {id:'nest',label:'育幼巢',value:built('nest'),target:1},{id:'garden',label:'浆果圃',value:built('garden'),target:2},
    {id:'cache',label:'储藏堆',value:built('cache'),target:1},{id:'biomes',label:'栖息地',value:s.discovered.length,target:4},
    {id:'base',label:'基础适应',value:base,target:3},{id:'specialist',label:'专精',value:specialist,target:1},
    {id:'trial',label:'潮汐来客',value:s.chapter.trial?.completedRoutes?.length?1:0,target:1}];
  return {goals,ready:goals.every(g=>g.value>=g.target),stableSeconds:s.chapter.stableSinceTick===null?0:Math.min(180,(s.clock.tick-s.chapter.stableSinceTick)/20),
    minimumSeconds:Math.max(0,1800-livedSeconds(s)),food:s.colony.food,won:s.chapter.status==='won'};
}
export function startTrial(s){
  if(s.journey?.active||s.chapter.id!=='first_island')return {ok:false,reason:'这一阶段的目标在远征菜单中。'};
  if(dist(s.player,NEST)>5)return {ok:false,reason:'回到巢边，再准备下一次潮汐。'};
  if(s.chapter.status==='won')return {ok:false,reason:'初岛安居已经达成。'};
  if(livedSeconds(s)<900||QUESTS.some(q=>!s.completed.includes(q.id)))return {ok:false,reason:'先完成六项基础旅程，累计探索至少 15 分钟（含远征）。'};
  const old=s.chapter.trial;
  if(old&&!['failed','interrupted'].includes(old.status))return {ok:false,reason:old.status==='resolved'?'潮汐来客已经处理妥当。':'已经预约了一次潮汐来客。'};
  if(old?.retryAt>s.clock.tick)return {ok:false,reason:'先在巢边休整，稍后可以重新预约。'};
  const route=seaRoutes(s).find(r=>r.trialEligible);
  if(!route||!canArrive(s,'reefjaw',2,true))return {ok:false,reason:'岸边尚有来客，或暂时没有安全的登陆路线。'};
  const window=reserveTrialWeather(s);if(!window)return {ok:false,reason:'暂时无法安排足够预警的涨潮窗口。'};
  const arrival=createArrival(s,{species:'reefjaw',routeId:route.id,count:2,startTick:window.start,trial:true});
  if(!arrival)return {ok:false,reason:'来客名额刚刚被占用，请稍后再试。'};
  s.chapter.trial={id:`trial-${s.nextId++}`,status:'scheduled',startTick:window.start,endTick:window.end,arrivalId:arrival.id,
    reinforced:false,feeEventId:null,refundEventId:null,initialFood:null,minFood:null,guardSinceTick:null,maxGuardTicks:0,
    playerRecoveries:0,companionRecoveries:0,seenRecoverySeq:s.eventSeq,completedRoutes:[],routeEvidence:{}};
  emit(s,'TrialScheduled',{trialId:s.chapter.trial.id,arrivalId:arrival.id,startTick:window.start,endTick:window.end},'潮汐来客已预约。可准备口粮、召集守卫，或加固巢区。',true);
  return {ok:true};
}
export function reinforceNest(s){
  const t=s.chapter.trial;
  if(!t||t.status!=='scheduled'||s.clock.tick>=t.startTick)return {ok:false,reason:'在已预约的风雨开始前加固巢区。'};
  if(t.reinforced)return {ok:false,reason:'这次潮汐的巢区已经加固。'};
  if(dist(s.player,NEST)>5||s.colony.material<12)return {ok:false,reason:'靠近巢穴，并准备仓库中的 12 材料。'};
  s.colony.material-=12;t.reinforced=true;
  t.feeEventId=emit(s,'NestReinforced',{trialId:t.id,material:12},'巢区已经加固。准备至少 40 食物，并让两位守卫留守。',true).seq;
  return {ok:true};
}
export function interruptTrial(s,reason){
  const t=s.chapter.trial;if(!t||['resolved','failed','interrupted'].includes(t.status))return;
  t.status='interrupted';t.retryAt=s.clock.tick+3600;
  if(t.reinforced&&!t.refundEventId){
    const room=Math.max(0,s.colony.storage-s.colony.material),returned=Math.min(12,room);
    s.colony.material+=returned;s.colony.materialRefund=(s.colony.materialRefund||0)+12-returned;
    t.refundEventId=emit(s,'NestReinforcementRefunded',{trialId:t.id,feeEventId:t.feeEventId,material:12},'巢区加固材料已退还，仓满的部分会在腾出空间后入库。',true).seq;
  }
  emit(s,'TrialInterrupted',{trialId:t.id,reason},'来客行程中断，可休整后重新预约。',true);
}
export function updateChapter(s){
  if(s.journey?.active)return;
  if(s.chapter.id==='second_island'){updateSecondChapter(s);return;}
  const c=s.chapter,t=c.trial,tick=s.clock.tick;
  if(s.colony.materialRefund>0){const amount=Math.min(s.colony.materialRefund,Math.max(0,s.colony.storage-s.colony.material));s.colony.material+=amount;s.colony.materialRefund-=amount;}
  if(c.status==='won')return;
  if(t&&!['resolved','failed','interrupted'].includes(t.status)){
    const a=s.ecology.arrivals.find(a=>a.id===t.arrivalId);
    if(!a||a.status==='cancelled'||a.interruptionReason){interruptTrial(s,a?.interruptionReason||a?.cancelReason||'missing_arrival');}
    else{
      if(tick>=t.startTick&&t.status==='scheduled'){
        t.status='active';t.initialFood=s.colony.food;t.minFood=s.colony.food;
        emit(s,'TrialStarted',{trialId:t.id,food:s.colony.food},'涨潮与风雨到了。照料家园，也留意岸边的来客。',true);
      }
      if(t.status==='active'&&tick<=t.endTick){
        t.minFood=Math.min(t.minFood,s.colony.food);
        const guards=s.agents.filter(a=>a.kind==='companion'&&a.hp>0&&a.job==='guard'&&!a.retreating&&!(a.recoverUntil>s.time)&&dist(a,NEST)<=8);
        if(guards.length>=2&&dist(s.player,NEST)<=8)t.guardSinceTick??=tick;else t.guardSinceTick=null;
        if(t.guardSinceTick!==null)t.maxGuardTicks=Math.max(t.maxGuardTicks,tick-t.guardSinceTick);
        for(const ev of s.recentEvents.filter(e=>e.seq>t.seenRecoverySeq&&['CombatRecovery','CompanionDied'].includes(e.type))){if(ev.player)t.playerRecoveries++;else t.companionRecoveries++;}
        t.seenRecoverySeq=s.eventSeq;
      }
      if(tick>=t.endTick&&t.status==='active'){
        t.routeEvidence.shelter=t.reinforced&&t.initialFood>=40&&t.minFood>=20&&t.maxGuardTicks>=1200&&!t.playerRecoveries&&t.companionRecoveries<=2;
        t.status='departing';
      }
      if(a.resolved){
        const routes=[];if(a.peaceful)routes.push('coexist');if(a.repulsedByPlayer)routes.push('repelled');if(t.routeEvidence.shelter)routes.push('shelter');
        t.completedRoutes=routes;t.status=routes.length?'resolved':'failed';t.retryAt=tick+3600;
        t.resultEventId=emit(s,routes.length?'TrialCompleted':'TrialFailed',{trialId:t.id,arrivalId:a.id,routes},routes.length?'潮汐来客已经处理妥当。家园又多了一段经历。':'这次来客已经离开。休整三分钟后，可以再次迎接潮汐。',true).seq;
      }
    }
  }
  const progress=chapterProgress(s);
  if(s.habitatHealth?.critical||foodOutlook(s).average<70){disruptStability(s,s.habitatHealth?.critical?'先解除生态临界':'先让族群恢复饱食');return;}
  const threat=s.agents.some(a=>a.kind==='predator'&&!a.dominated&&a.hp>0&&!(a.pacifiedUntil>s.time)&&dist(a,NEST)<12);
  if(!progress.ready||s.colony.food<30||threat||c.lastDisruptionTick===tick){
    disruptStability(s,!progress.ready?'尚有初岛目标未完成':s.colony.food<30?'食物需保持至少 30':'巢边仍有动静');return;
  }
  c.stableSinceTick??=tick;c.disruption='';
  if(livedSeconds(s)>=1800&&tick-c.stableSinceTick>=3600){
    c.status='won';c.victory={id:`first-island-${s.seed}-${tick}`,tick,elapsedTicks:Math.round(livedSeconds(s)*20),rulesVersion:s.rulesVersion,goals:progress.goals,
      routes:[...t.completedRoutes],evidenceId:t.resultEventId,population:population(s),parts:[...s.parts]};
    emit(s,'ChapterWon',{victory:c.victory},'初岛安居：小芽与同伴，在这座岛上建立了自己的家。',true);
  }
}
