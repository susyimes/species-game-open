import { SPECIES, NEST } from './config.js';
import { dist } from './math.js';

/** Windup fixes a visible line; movement and hit tests still use normal collision rules. */
export function wildAbility(s,a,target,dt,{walk,hurt}){
  const move=SPECIES[a.species]?.move;if(!['charge','lunge'].includes(move))return false;
  let action=a.special;
  if(!action&&dist(a,target)>2.2&&dist(a,target)<8&&s.time>=(a.specialReadyAt||0)){
    const d=Math.max(.01,dist(a,target));
    action=a.special={phase:'windup',until:s.time+(move==='charge'?1.1:1),dx:(target.x-a.x)/d,dz:(target.z-a.z)/d,startX:a.x,startZ:a.z,hitIds:[]};
    a.specialReadyAt=s.time+(move==='charge'?7:6);a.path=[];
  }
  if(!action)return false;
  if(action.phase==='windup'){
    a.behavior='windup';a.moveSpeed=0;a.heading=Math.atan2(action.dx,action.dz);
    if(s.time>=action.until){action.phase='dash';action.until=s.time+.95;}return true;
  }
  if(action.phase==='dash'){
    if(dist({x:a.x+action.dx*.5,z:a.z+action.dz*.5},NEST)<6){action.phase='recover';action.until=s.time+1.6;return true;}
    a.behavior='charge';walk(a,dt,move==='charge'?7.5:6,!!SPECIES[a.species]?.swim,{x:action.dx,z:action.dz});
    for(const victim of [s.player,...s.agents.filter(x=>x.kind==='companion'||x.dominated)]){
      if(dist(victim,NEST)>6&&!action.hitIds.includes(victim.id)&&dist(a,victim)<1.9){action.hitIds.push(victim.id);hurt(s,victim,move==='charge'?24:18,a);}
    }
    if(s.time>=action.until||a.moveSpeed<.1){action.phase='recover';action.until=s.time+1.6;}return true;
  }
  a.behavior='recover';a.moveSpeed=0;if(s.time>=action.until)a.special=null;return true;
}
