import { CONTRACTS, STYLES } from './journey-config.js';
import { MAP_IDS } from './maps.js';

const finite=n=>Number.isFinite(n)&&n>=0&&n<=1e12;
const integer=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e12;
const unique=(a,allowed,max=allowed.length)=>Array.isArray(a)&&a.length<=max&&new Set(a).size===a.length&&a.every(x=>allowed.includes(x));
const contracts=CONTRACTS.map(c=>c.id),biomes=['meadow','wetland','grove','ridge'];
const cargo=c=>c&&['food','material'].every(k=>finite(c[k]));
export function validJourney(s,{nested=false}={}){
  if(s.lifetimeAwaySeconds!==undefined&&(!finite(s.lifetimeAwaySeconds)||s.journey&&s.lifetimeAwaySeconds!==s.journey.totalAwayTime))return false;
  if(!MAP_IDS.includes(s.mapId||'home')||!STYLES.some(x=>x.id===(s.style||'balanced')))return false;
  if(s.style==='tidal'&&!s.parts.includes('fins'))return false;
  for(const a of [s.player,...s.agents]){
    if(a.skillReadyAt!==undefined&&!finite(a.skillReadyAt))return false;
    if(a.skill&&(!['hunter','guardian','tidal'].includes(a.skill.kind)||!finite(a.skill.until)||typeof a.skill.used!=='boolean'))return false;
    if(a.special&&(!['windup','dash','recover'].includes(a.special.phase)||!finite(a.special.until)||![a.special.dx,a.special.dz,a.special.startX,a.special.startZ].every(Number.isFinite)||!Array.isArray(a.special.hitIds)||a.special.hitIds.length>65||a.special.hitIds.some(id=>typeof id!=='string')))return false;
  }
  const j=s.journey;
  if(!j)return nested?(s.mapId||'home')!=='expedition':(s.mapId||'home')==='home'&&s.chapter.id==='first_island';
  if(nested||j.version!==1||![0,1].includes(j.era)||![j.serial,j.successes,j.eraSuccesses].every(integer)||j.successes>j.serial||j.eraSuccesses>j.successes||!finite(j.totalAwayTime)||!cargo(j.pending))return false;
  if(!unique(j.rewards,contracts)||!unique(j.eraContracts,contracts)||j.knowledge&&!unique(j.knowledge,biomes)||!Array.isArray(j.history)||j.history.length>12)return false;
  if(new Set(j.history.map(h=>h.id)).size!==j.history.length||j.history.some(h=>typeof h.id!=='string'||!contracts.includes(h.contractId)||typeof h.success!=='boolean'||!['normal','emergency','injured','timeout'].includes(h.reason)||!cargo(h.cargo)||!finite(h.seconds)||![0,8,18].includes(h.dna)||!STYLES.some(t=>t.id===h.style)||![0,1].includes(h.era)))return false;
  if(j.history.some(h=>h.casualties!==undefined&&(!Array.isArray(h.casualties)||h.casualties.length>2||new Set(h.casualties).size!==h.casualties.length||h.casualties.some(id=>typeof id!=='string'||id.length>160))))return false;
  if(j.eraStartedAt!==undefined&&!finite(j.eraStartedAt))return false;
  const map=j.era?'rift':'home';
  if(j.active){
    const a=j.active;
    if(s.mapId!=='expedition'||!j.home||j.home.journey||j.home.mapId!==map||typeof a.id!=='string'||a.id.length>160||!contracts.includes(a.contractId)||!integer(a.seed)||a.seed!==s.seed||a.startedAt!==0||a.deadline!==900||a.eventAt!==180||!['squall','migration'].includes(a.event)||typeof a.eventWarned!=='boolean'||typeof a.eventStarted!=='boolean'||!unique(a.samples,[0,1,2])||!['normal','emergency','injured','timeout',null].includes(a.returnReason)||!STYLES.some(t=>t.id===a.style))return false;
    if(!Array.isArray(a.party)||a.party.length<(a.emergency?1:2)||a.party.length>2||new Set(a.party).size!==a.party.length)return false;
    const casualties=a.casualties||[];
    if(!unique(casualties,a.party,2)||a.party.some(id=>!j.home.agents?.some(x=>x.id===id&&x.kind==='companion')||(casualties.includes(id)?s.agents.some(x=>x.id===id):!s.agents.some(x=>x.id===id&&x.kind==='companion')))||s.agents.filter(x=>x.kind==='companion').length!==a.party.length-casualties.length)return false;
    const samples=s.resources.filter(r=>r.sampleIndex!==undefined);
    if(samples.length!==3||!unique(samples.map(r=>r.sampleIndex),[0,1,2])||samples.some(r=>r.tripId!==a.id||r.kind!=='relic'||r.max!==1||r.amount!==(a.samples.includes(r.sampleIndex)?0:1)))return false;
    if(j.history.some(h=>h.id===a.id)||j.transition)return false;
  }else if(j.home||s.mapId!==map||s.resources.some(r=>r.sampleIndex!==undefined))return false;
  if(j.era&&!(j.home||s).chapterEvidence?.some(e=>e.type==='ChapterWon'&&e.victory?.id===j.firstVictory?.id))return false;
  if(j.era&&(!j.firstVictory?.id||!integer(j.firstVictory.elapsedTicks??j.firstVictory.tick)||(j.firstVictory.elapsedTicks??j.firstVictory.tick)<36000||s.chapter.id!==(j.active?'first_island':'second_island')))return false;
  if(!j.era&&s.chapter.id!=='first_island')return false;
  if(j.transition&&(j.era||s.chapter.status!=='won'||typeof j.transition.id!=='string'||!finite(j.transition.progress)||j.transition.progress>1))return false;
  return true;
}
