import {emit,disruptStability} from './events.js';

/** Remove fallen members at the simulation boundary, never while iterating actors. */
export function removeDeadCompanions(s){
  const fallen=s.agents.filter(a=>a.kind==='companion'&&a.hp<=0);if(!fallen.length)return;
  const ids=new Set(fallen.map(a=>a.id)),run=s.journey?.active;
  for(const a of fallen){
    if(run?.party.includes(a.id)){run.casualties??=[];if(!run.casualties.includes(a.id))run.casualties.push(a.id);}
    emit(s,'CompanionDied',{entityId:a.id,cause:a.deathCause||(a.satiety<=0?'hunger':'combat'),tripId:run?.id||null},'一位同伴倒下了，族群减少一员。携带的物资也遗落了。',!!s.chapter?.trial);
  }
  s.agents=s.agents.filter(a=>!ids.has(a.id));
  for(const a of [s.player,...s.agents]){
    if(ids.has(a.target?.id)){a.target=null;a.path=[];a.work=0;a.behavior='idle';}
    if(ids.has(a.huntTargetId)){a.huntTargetId=null;a.path=[];a.decision=0;}
  }
  if(ids.has(s.selected?.id))s.selected=null;
  for(const group of s.ecology?.groups||[]){const members=group.memberIds.filter(id=>!ids.has(id));if(members.length!==group.memberIds.length){group.memberIds=members;group.groupRevision++;group.intent=null;}}
  s.metrics.population=1+s.agents.filter(a=>a.kind==='companion').length;
  disruptStability(s,'族群失去了一位同伴');
}
