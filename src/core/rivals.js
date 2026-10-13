import {NEST} from './config.js';
import {dist} from './math.js';
import {terrainFor} from './terrain.js';
import {isJuvenile} from './survival-config.js';
import {emit} from './events.js';
export const RIVAL_SITES=[{x:18,z:-10},{x:6,z:-18},{x:-5,z:-18}];

export function rivalCapacity(s){return s.mapId==='home'?Math.min(6,3+Math.floor(s.time/360)):3;}
export function feedRivals(s,prey){
  if(s.mapId!=='home'||prey.kind!=='grazer'||prey.dominated)return;
  const r=s.habitatHealth.rivals??={stage:0,nextAt:360,plan:null,food:0};
  const food=isJuvenile(s,prey)?3:8;r.food=Math.min(24,(r.food||0)+food);
  emit(s,'RivalHuntFed',{preyId:prey.id,food});
}
export function rivalTick(s){
  if(s.mapId!=='home')return;
  const h=s.habitatHealth,r=h.rivals??={stage:0,nextAt:360,plan:null};
  r.food=Math.max(0,(r.food||0)-.01);
  const adults=s.agents.filter(a=>a.species==='emberfang'&&a.hp>0&&!a.dominated&&!isJuvenile(s,a));
  if(r.plan){
    const travellers=adults.filter(a=>r.plan.members.includes(a.id));
    if(travellers.length<2){r.plan=null;r.nextAt=s.time+180;return;}
    if(s.time>=r.plan.startsAt&&travellers.every(a=>dist(a,r.plan.target)<3)){
      for(const a of travellers){a.homeX=r.plan.target.x;a.homeZ=r.plan.target.z;}
      r.stage++;r.plan=null;r.nextAt=s.time+300;
      emit(s,'RivalTerritorySettled',{stage:r.stage},'赤鬃猎兽在新的猎场留下了足迹。绕开它们，或和守卫一起行动。');
    }else if(s.time>r.plan.startsAt+150){r.plan=null;r.nextAt=s.time+180;}
    return;
  }
  if(r.stage>=3||s.time<r.nextAt||adults.length<4+r.stage||s.weather==='squall')return;
  const target=RIVAL_SITES[r.stage],terrain=terrainFor(s);
  const pair=adults.filter(a=>terrain.findPath(a,target,false,{level:.5})).slice(-2);
  if(pair.length<2||dist(target,NEST)<14){r.nextAt=s.time+60;return;}
  r.plan={target,members:pair.map(a=>a.id),startsAt:s.time+45};
  emit(s,'RivalExpansionWarned',{stage:r.stage+1,target},'赤鬃猎兽正在寻找新的猎场，稍后会结伴向林缘移动。');
}
export function rivalMovement(s,a,dt,{route,walk}){
  const plan=s.mapId==='home'&&s.habitatHealth?.rivals?.plan;
  if(!plan||!plan.members.includes(a.id)||s.time<plan.startsAt)return false;
  if(dist(a,plan.target)<2.5){a.path=[];a.moveSpeed=0;a.behavior='watch';return true;}
  if(!a.path.length||a.decision<=0){route(a,plan.target,false);a.decision=2;}
  a.behavior='patrol';walk(a,dt,2.5,false);return true;
}
