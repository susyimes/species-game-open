import { interact, moveTo, stopPlayer } from './actions.js';
import { startCreatureAction } from './creature-interactions.js';
import { NEST } from './config.js';
import { actionNotice, entityName } from './interaction-feedback.js';

/** Single-click commands never open UI; repeated taps on the current job preserve its progress. */
export function directAction(s,{type,entity}){
  if(type==='ground'||type==='home'){
    s.selected=null;s.actionNotice=null;stopPlayer(s);return moveTo(s,type==='home'?NEST:entity);
  }
  const current=(type==='resource'?s.resources:s.agents).find(a=>a.id===entity?.id);
  if(!current)return {ok:false,reason:'目标已经离开了。'};
  s.selected=current;s.actionNotice=null;
  if(type==='companion'||current.dominated){actionNotice(s,`${entityName(current)} · 长按查看指令`,current);return {ok:true};}
  const action=type==='resource'?'resource':'enemy';
  if(s.player.target?.id===current.id&&s.player.target.type===action)return {ok:true};
  stopPlayer(s);
  if(type==='resource')return interact(s,{type:'resource',entity:current});
  if(type==='enemy')return startCreatureAction(s,current.id,'hunt');
  return {ok:false,reason:'这里暂时没有可执行的动作。'};
}
