import { NEST, SPECIES } from './config.js';
import { dist } from './math.js';
import { clockInfo } from './clock.js';
import { environment } from './weather.js';

export const NEST_REFUGE_RADIUS=6;
export function hostileTarget(s,a,{anchor=a,marine=false}={}){
  if(a.kind!=='predator'||a.dominated||a.hp<=0||a.pacifiedUntil>s.time)return null;
  const radius=(SPECIES[a.species]?.detect||(marine?8:9))*environment(s,a).sight*(clockInfo(s).phase==='night'?1.2:1);
  const home=marine?anchor:{x:a.homeX??a.x,z:a.homeZ??a.z};
  const modern=s.mapId&&s.mapId!=='home';
  if(modern&&s.time-(s.journey?.active?0:s.journey?.eraStartedAt||0)<90&&dist(a,NEST)<18&&a.lastAttackSide!=='player')return null;
  return [s.player,...s.agents].filter(b=>b!==a&&b.hp>0&&!(b.recoverUntil>s.time)&&
    (b.kind!=='predator'||b.dominated)&&(!modern||s.agents.filter(x=>x!==a&&x.hp>0&&!x.dominated&&x.huntTargetId===b.id).length<2)&&dist(b,NEST)>NEST_REFUGE_RADIUS&&dist(b,a)<radius&&(dist(b,home)<(SPECIES[a.species]?.move==='territory'?10:marine?18:24)||!marine&&dist(b,a)<4))
    .sort((b,c)=>score(b)-score(c))[0]||null;
  function score(b){return dist(a,b)-(b.id===a.lastAttackerId&&s.time-(a.hitAt??-100)<6?4:0);}
}
export function canListen(s,a){
  const action=s.player.target?.type;
  if(s.player.target?.id!==a.id||dist(a,s.player)>3.2)return false;
  if(action==='feed')return a.origin==='marine'&&s.player.carry.food>=8;
  if(!['communicate','dominate'].includes(action)||s.player.stamina<(action==='communicate'?8:20))return false;
  return a.kind!=='predator'||a.pacifiedUntil>s.time||a.trust>=35||a.hp<=(SPECIES[a.species]?.hp||64)*.4;
}
