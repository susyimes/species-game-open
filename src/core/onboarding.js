import { BUILDINGS, EVOLUTIONS, QUESTS, speciesStats } from './config.js';
import { evolutionChoice } from './evolution.js';
import { livedSeconds } from './journey-config.js';

export const GUIDE_IDS=['gather','return','evolve','build','hatch','journal','trial','food','ecosystem'];
export function nextGuide(s){
  if(!s.started)return null;
  const seen=Array.isArray(s.hints?.guideV1)?s.hints.guideV1:[];
  if(s.survival?.guideFood&&!seen.includes('food'))return {id:'food',target:'gather',text:'大家饿了，先在附近采些食物带回家。',label:'采集食物'};
  if(s.survival?.guideEcology&&!seen.includes('ecosystem'))return {id:'ecosystem',target:'survival',text:'野生种群正在减少。划出禁猎区、保留野果，或带回卵囊放归。',label:'保护岛屿'};
  if(s.journey?.active||s.journey?.era)return null;
  const carried=s.player.carry.food+s.player.carry.material;
  const evolved=s.parts.length>0||s.metrics.evolved>0,built=s.buildings.some(b=>b.kind!=='home');
  const hatched=s.agents.filter(a=>a.kind==='companion').length>5||s.metrics.population>6||!!s.colony.egg;
  const evolution=EVOLUTIONS.find(e=>evolutionChoice(s,e.id).ok);
  const building=[...BUILDINGS].sort((a,b)=>(b.id==='garden')-(a.id==='garden')).find(b=>s.colony.food>=b.cost.food&&s.colony.material>=b.cost.material);
  const steps=[
    {id:'gather',target:'gather',ready:s.metrics.gathered<2&&s.metrics.deposited<6&&!evolved&&!built,text:'先采一点浆果。单击采集，长按查看。',label:'采集浆果'},
    {id:'return',target:'home',ready:s.metrics.deposited<6&&(carried>=6||carried>=speciesStats(s.parts,s.style).carry),text:'背包里已有收获，返巢后会自动入库。',label:'返巢'},
    {id:'evolve',target:'evolve',ready:s.metrics.deposited>=6&&!evolved&&!!evolution,text:evolution?`进化点够了，可以长出${evolution.name}。`:'',label:'进化'},
    {id:'build',target:'colony',ready:evolved&&!built&&s.metrics.deposited>=6&&!!building,text:building?`先营造${building.name}，让同伴帮你照料。`:'',label:'营造家园'},
    {id:'hatch',target:'colony',ready:s.completed.includes('explore')&&!hatched&&s.colony.food>=18&&1+s.agents.filter(a=>a.kind==='companion').length<s.colony.capacity,text:'有空位，也备好了 18 食物，可以孵育新同伴。',label:'家园'},
    {id:'journal',target:'journal',ready:s.completed.includes('build')&&s.discovered.length>=2&&!s.completed.includes('explore')&&s.discovered.length<4,text:'发现了新的栖息地，在见闻里认识这里的生物。',label:'见闻'},
    {id:'trial',target:'chapter',ready:livedSeconds(s)>=900&&QUESTS.every(q=>s.completed.includes(q.id))&&!s.chapter.trial&&s.chapter.status!=='won',text:'已经熟悉这座岛，可以准备一次潮汐来客。',label:'初岛安居'},
  ];
  return steps.find(g=>g.ready&&!seen.includes(g.id))||null;
}
export function nextObjective(s){
  if(!s.started||s.journey?.active||s.journey?.era)return null;
  const q=QUESTS[s.quest];if(!q)return null;
  const copy={gather:['采一点浆果带回家','采集浆果','gather'],home:['收获已经在背包里了','返巢','home'],evolve:['让小芽长出第一个新部件','进化','evolve'],build:['先建一块浆果圃，同伴会自动施工','营造家园','colony'],explore:['越过草地，去看看新的栖息地','向远处探索','explore'],colony:['家园安顿好了，再迎接新同伴','查看家园','colony']}[q.id];
  return {id:'objective-'+q.id,target:copy[2],text:`${copy[0]} · ${Math.min(q.target,Math.floor(s.metrics[q.metric]||0))}/${q.target}`,label:copy[1],objective:true};
}
export function acknowledgeGuide(s,target=null){
  const guide=nextGuide(s);if(!guide||target&&guide.target!==target)return false;
  if(!s.hints||typeof s.hints!=='object'||Array.isArray(s.hints))s.hints={};
  s.hints.guideV1=[...(Array.isArray(s.hints.guideV1)?s.hints.guideV1.filter(id=>GUIDE_IDS.includes(id)):[]),guide.id];
  return true;
}
