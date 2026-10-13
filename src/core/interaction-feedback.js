import { SPECIES, speciesStats } from './config.js';
import { clamp, dist } from './math.js';

export function entityName(a){
  return a.sampleName||a.foodName|| (a.carcass?'掉落食物':SPECIES[a.species]?.name||({food:'浆果',material:'矿石',relic:'远古孢子',companion:'同伴'}[a.kind])||'初生之巢');
}
export function harvestDuration(a,r){return r.sampleIndex!==undefined?12:r.kind==='relic'?3:a.kind==='player'?1.35:2.6;}
export function actionNotice(s,text,entity=s.player){
  s.actionNotice={text,x:entity.x,z:entity.z,expiresAt:s.time+4};
}
export function actionFeedback(s){
  const p=s.player,target=p.target;
  if(!target){const n=s.actionNotice;return n&&s.time<n.expiresAt?{entity:n,label:n.text,kind:'notice',value:null}:null;}
  const entity=(target.type==='resource'?s.resources:s.agents).find(a=>a.id===target.id);
  if(!entity)return null;
  const name=entityName(entity),distance=dist(p,entity),anchor=distance>10?p:entity;
  if(target.type==='resource'){
    const full=p.carry.food+p.carry.material>=speciesStats(s.parts,s.style).carry&&entity.kind!=='relic';
    if(full)return {entity:anchor,label:'背包满了 · 返巢入库',kind:'notice',value:null};
    if(entity.amount<1)return {entity:anchor,label:'已采集完',kind:'notice',value:100,valueText:'完成'};
    const working=p.behavior==='gather'&&distance<=2.1,verb=entity.kind==='relic'?'研究':entity.carcass?'拾取':'采集';
    return {entity:anchor,label:`${working?verb:'靠近'} · ${name}`,kind:'gather',value:working?clamp(p.work/harvestDuration(p,entity)*100,0,100):null,valueText:working?'本批进度':''};
  }
  if(target.type==='enemy'&&entity.hp>0){
    const max=SPECIES[entity.species]?.hp||100;
    return {entity:anchor,label:`${distance<=2.05?'捕食':'追近'} · ${name}`,kind:'hunt',value:clamp(entity.hp/max*100,0,100),valueText:`生命 ${Math.ceil(entity.hp)} / ${max}`};
  }
  if(['feed','communicate','dominate'].includes(target.type)){
    const working=distance<=(target.type==='feed'?3:2.6),verb={feed:'投喂',communicate:'交流',dominate:'统治'}[target.type];
    return {entity:anchor,label:`${working?verb:'靠近'} · ${name}`,kind:'gather',value:working?clamp(p.work/2.5*100,0,100):null,valueText:working?'互动进度':''};
  }
  return null;
}
