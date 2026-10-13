import { EVOLUTIONS, BIOMES } from './config.js';

export function evolutionChoice(s,id){
  const part=EVOLUTIONS.find(e=>e.id===id);
  if(!part)return {ok:false,reason:'未知的进化部件。'};
  const owned=s.parts.includes(id);
  const replaced=part.parent?EVOLUTIONS.find(e=>e.parent===part.parent&&e.id!==id&&s.parts.includes(e.id)):null;
  const refund=replaced?Math.floor(replaced.cost/2):0;
  const cost=part.cost-refund;
  const parts=s.parts.filter(p=>p!==replaced?.id);if(!owned)parts.push(id);
  let reason='';
  if(owned)reason='这个部件已被族群继承。';
  else if(part.parent&&!s.parts.includes(part.parent))reason=`先长出${EVOLUTIONS.find(e=>e.id===part.parent).name}。`;
  else if(part.biome&&!s.discovered.includes(part.biome)&&!s.journey?.knowledge?.includes(part.biome))reason=`探索${BIOMES.find(b=>b.id===part.biome).name}，寻找这种适应的灵感。`;
  else if(s.colony.dna<cost)reason='进化点还不够，探索远古孢子或完成旅程可以获得。';
  return {ok:!reason,reason,part,owned,replaced,refund,cost,parts};
}
