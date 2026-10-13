import { EVOLUTIONS, JOBS, SPECIES } from './config.js';
import { interact, commandCompanion } from './actions.js';
import { notify } from './state.js';

export function creatureOptions(s,a){
  if(!a||a.hp<=0)return [];
  if(a.kind==='companion')return [{id:'follow',name:a.manualFollow?'返回原分工':'跟随我',description:'单独指挥这位同伴。'},...Object.entries(JOBS).map(([id,name])=>({id,name,description:`让同伴承担${name}工作。`}))];
  if(!['grazer','predator'].includes(a.kind))return [];
  const options=[{id:'hunt',name:'捕猎',description:'自动接近并持续攻击；点地面可撤离。'}];
  if(s.parts.includes('crest'))options.unshift({id:'communicate',name:'交流',description:'消耗 8 体力，建立 35 点亲近。'});
  if(a.dominated)options.push({id:'release',name:'放归野外',description:'结束跟随，让它回到自己的栖息地。'});
  else if(s.parts.includes('crest')&&s.parts.includes('horns')&&s.parts.some(id=>EVOLUTIONS.find(e=>e.id===id)?.parent))
    options.push({id:'dominate',name:'统治',description:'消耗 20 体力，使亲近或虚弱的生物成为追随者。'});
  return options;
}
export function startCreatureAction(s,id,action){
  const a=s.agents.find(a=>a.id===id);
  if(!a||a.hp<=0)return {ok:false,reason:'这只生物已经离开了。'};
  if(!creatureOptions(s,a).some(o=>o.id===action))return {ok:false,reason:'当前进化程度还没有解锁这种互动。'};
  if(a.kind==='companion')return commandCompanion(s,id,action);
  if(action==='release'){a.dominated=false;a.pacifiedUntil=s.time+15;a.path=[];a.decision=0;notify(s,`${SPECIES[a.species]?.name||'这只生物'}回到了野外。`);return {ok:true};}
  if(action==='hunt'){
    const result=interact(s,{type:'enemy',entity:a});
    if(result.ok){a.dominated=false;a.pacifiedUntil=0;}
    return result;
  }
  const cost=action==='communicate'?8:20;
  if(s.player.stamina<cost)return {ok:false,reason:`这次互动需要 ${cost} 体力。`};
  if(action==='communicate'&&(a.trust||0)>=100)return {ok:false,reason:'它已经十分熟悉你了。'};
  if(action==='dominate'&&(a.trust||0)<60&&a.hp>(SPECIES[a.species]?.hp||100)*.4)
    return {ok:false,reason:'先交流至 60 亲近，或将对方生命削弱到 40% 以下。'};
  // Move and resolve through the normal simulation, not an instant remote effect.
  return interact(s,{type:action,entity:a});
}
export function showWildGestureHint(s){
  s.hints??={};if(s.hints.wildGesture)return;
  s.hints.wildGesture=true;
  notify(s,'双击同一只野生动物可捕猎；长按可查看已解锁的互动。','hint');
}
