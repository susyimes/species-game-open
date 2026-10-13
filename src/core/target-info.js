import { SPECIES, JOBS } from './config.js';
import { creatureOptions } from './creature-interactions.js';
import { entityName } from './interaction-feedback.js';
import { isJuvenile } from './survival-config.js';
import { protectedAt } from './ecosystem.js';

export function targetInfo(s,{type,id}){
  const entity=(type==='resource'?s.resources:s.agents).find(a=>a.id===id);
  if(!entity)return null;
  if(type==='resource'){
    if(entity.sampleIndex!==undefined)return {entity,name:entityName(entity),description:'本次远征的样本。调查后带回营地返航，为家园留下新的景观。',facts:[entity.amount?'调查需要 12 秒':'本次已收集'],options:[{id:'harvest',name:'收集样本',description:'沿路靠近后调查，进度显示在场景中。',disabled:entity.amount<1}],hint:'单击收集；提前撤回会留下本次样本。'};
    const relic=entity.kind==='relic',verb=relic?'研究':entity.carcass?'拾取':'采集';
    return {entity,name:entityName(entity),description:relic?'古老生命留下的记忆，研究后可以获得进化点。':entity.carcass?'捕食留下的食物。靠近后放入背包。':'靠近后连续采集，返巢时自动放入仓库。',
      facts:relic?[entity.amount>=1?`本次 +${entity.researchCount?8:18} 进化点`:'等待重新孕育']:[`剩余 ${Math.floor(entity.amount)} ${entity.kind==='material'?'材料':'食物'}`,'每批最多 2 份'],
      options:[{id:'harvest',name:verb,description:'自动靠近并开始。',disabled:entity.amount<1}],hint:'单击即可行动，点击地面可中止。'};
  }
  const companion=entity.kind==='companion',options=creatureOptions(s,entity);
  if(isJuvenile(s,entity))return {entity,name:companion?'族群幼体':`${entityName(entity)} · 幼体`,description:'还在成长，暂不劳动、参战或繁殖。',facts:[`${Math.ceil(entity.juvenileUntil-s.time)} 秒后成年`,...(companion?[`饱食 ${Math.floor(entity.satiety??100)} · 半份成年食量`]:[])],options,hint:'先照料食物与周围环境，让幼体安稳成长。'};
  return {entity,name:companion?`同伴 ${String(s.agents.filter(a=>a.kind==='companion').indexOf(entity)+1).padStart(2,'0')}`:entityName(entity),
    description:companion?(entity.retreating?'这位同伴受伤了，正在沿路撤退、回巢休养。':'同伴会照料家园，也可以陪你远行。'):SPECIES[entity.species]?.description||'岛上的野生邻居。',
    facts:[`生命 ${Math.ceil(entity.hp)} / ${SPECIES[entity.species]?.hp||100}`,companion?`饱食 ${Math.floor(entity.satiety??100)} · 分工 ${JOBS[entity.job]}`:`亲近 ${entity.trust||0} / 100`,...(entity.dominated?['已归顺']:[]),...(protectedAt(s,entity)?['位于禁猎区']:[])],options,
    hint:companion?'指令只作用于这位同伴。':!s.parts.includes('crest')?'长出共鸣冠饰，可解锁交流。':!options.some(o=>o.id==='dominate'||o.id==='release')?'共鸣冠饰、弯月双角和任意一种专精可解锁统治。':'统治需要至少 60 亲近，或生命不高于 40%。'};
}
