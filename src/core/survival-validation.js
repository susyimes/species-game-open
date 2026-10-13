import { SPECIES, BIOMES } from './config.js';
import { seaRoute } from './sea-navigation.js';
const number=n=>Number.isFinite(n)&&n>=0&&n<=1e12;
const stock=o=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.entries(o).every(([id,n])=>Object.hasOwn(SPECIES,id)&&Number.isSafeInteger(n)&&n>=0&&n<=1000000);
export function validSurvival(s){
  const c=s.colony,f=s.survival,h=s.habitatHealth;
  if(c.foodPolicy!==undefined&&!['normal','ration'].includes(c.foodPolicy))return false;
  if(c.breedingAllowed!==undefined&&typeof c.breedingAllowed!=='boolean')return false;
  if(c.populationLimit!==undefined&&(!Number.isInteger(c.populationLimit)||c.populationLimit<1||c.populationLimit>18))return false;
  if(c.nextAutoHatchAt!==undefined&&!number(c.nextAutoHatchAt))return false;
  if(c.seedStock!==undefined&&(!Number.isSafeInteger(c.seedStock)||c.seedStock<0||c.seedStock>1000000))return false;
  if(c.soilLevel!==undefined&&(!Number.isInteger(c.soilLevel)||c.soilLevel<0||c.soilLevel>3))return false;
  if(c.nursery!==undefined&&!stock(c.nursery))return false;
  if(c.egg?.automatic!==undefined&&typeof c.egg.automatic!=='boolean')return false;
  for(const a of [s.player,...s.agents]){
    if(a.retreating!==undefined&&typeof a.retreating!=='boolean')return false;
    if(a.satiety!==undefined&&(!number(a.satiety)||a.satiety>100))return false;
    if(a.juvenileUntil!==undefined&&(!number(a.juvenileUntil)||a.juvenileUntil>s.time+120.01))return false;
  }
  if(f&&(f.version!==1||!['fed','strained','hungry','famine'].includes(f.level)||![f.shortageSeconds,f.foodSpent,f.energyFoodSpent].every(number)||typeof f.guideFood!=='boolean'||typeof f.guideEcology!=='boolean'))return false;
  if(h){
    if(h.version!==1||!stock(h.baseline)||Object.values(h.baseline).some(n=>n<1||n>32)||!Object.keys(h.baseline).length||Object.values(h.baseline).reduce((a,b)=>a+b,0)>64)return false;
    if(!h.breeding||Object.entries(h.breeding).some(([id,n])=>!Object.hasOwn(h.baseline,id)||!number(n))||typeof h.critical!=='boolean'||typeof h.reserveFruit!=='boolean')return false;
    if(![h.stress,h.recovery,h.immigrationAt].every(number)||h.stress>1||h.recovery>60||!['healthy','endangered','critical','recovering'].includes(h.level))return false;
    if(!Array.isArray(h.protected)||h.protected.length>4||new Set(h.protected).size!==h.protected.length||h.protected.some(id=>!BIOMES.some(b=>b.id===id)))return false;
    if(!Array.isArray(h.extinct)||new Set(h.extinct).size!==h.extinct.length||h.extinct.some(id=>!Object.hasOwn(h.baseline,id)))return false;
    if(h.incoming&&(!Object.hasOwn(SPECIES,h.incoming.species)||!seaRoute(h.incoming.routeId,s)||!number(h.incoming.startedAt)||h.incoming.startedAt>s.time))return false;
    if(h.rivals){
      const r=h.rivals,p=r.plan;
      if(!Number.isInteger(r.stage)||r.stage<0||r.stage>3||!number(r.nextAt))return false;
      if(r.food!==undefined&&(!number(r.food)||r.food>24))return false;
      if(p&&(![p.target?.x,p.target?.z].every(n=>Number.isFinite(n)&&Math.abs(n)<46)||!number(p.startsAt)||!Array.isArray(p.members)||p.members.length!==2||new Set(p.members).size!==2||p.members.some(id=>typeof id!=='string')))return false;
    }
  }
  for(const r of s.resources){
    if(r.coast!==undefined&&(!['emergency','tidal'].includes(r.coast)||r.kind!=='food'||r.max!==(r.coast==='emergency'?6:12)||!seaRoute(r.coastRoute,s)))return false;
    if(r.sampleSpecies!==undefined&&!Object.hasOwn(SPECIES,r.sampleSpecies))return false;
    if(r.foodName!==undefined&&(typeof r.foodName!=='string'||r.foodName.length>80))return false;
  }
  const run=s.journey?.active;
  if(run){
    if(run.emergency!==undefined&&typeof run.emergency!=='boolean')return false;
    if(run.cargoVersion!==undefined){
      if(run.cargoVersion!==1||!stock(run.specimens)||!number(run.provisions)||!Number.isInteger(run.seeds)||run.seeds<0)return false;
      const count=run.samples.length,specimens=Object.values(run.specimens).reduce((a,b)=>a+b,0);
      if(run.provisions!==(run.contractId==='glowflower'?8*count:0)||run.seeds!==(run.contractId==='saltseed'?count:0)||specimens!==(run.contractId==='tidespore'?2*count:0))return false;
    }
  }
  return true;
}
