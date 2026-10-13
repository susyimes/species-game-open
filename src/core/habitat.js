/** Visual growth is derived from completed facilities, including existing saves. */
export function habitatStage(state){
  const completed=state.buildings.filter(b=>b.kind!=='home'&&b.progress===1).length;
  const level=completed>=4?3:completed>=1?2:1;
  return {level,completed,name:['初生巢地','枝叶家园','繁盛巢群'][level-1],nextAt:level===1?1:level===2?4:null};
}

export function habitatReinforced(state){
  const trial=state.chapter?.trial;
  return !!(trial?.reinforced&&['scheduled','active'].includes(trial.status)&&trial.endTick>state.clock.tick);
}
