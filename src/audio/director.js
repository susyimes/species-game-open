import {clockInfo} from '../core/clock.js';

export function soundscape(s,mode,flags={}){
  const night=['dusk','night'].includes(clockInfo(s).phase);
  const coast=Math.max(0,Math.min(1,(Math.hypot(s.player.x,s.player.z)-28)/12));
  return {active:s.started&&!flags.hidden&&!flags.blocked&&!flags.manualPause,
    music:s.journey?.active?'island-expedition':night?'island-night':'island-day',
    musicGain:flags.modal ? .42 : s.journey?.transition ? .7 : 1,
    rain:flags.modal?0:s.weather==='squall'?.8:s.weather==='rain'?.48:0,
    surf:flags.modal?0:coast*(mode==='swim'?.7:.5)};
}

/** Read-only observations: no audio events, timers or randomness enter a saved simulation. */
export class SoundDirector{
  previous=null;
  sample(s,mode){
    const p=s.player,next={key:[s.saveId,s.mapId,s.journey?.active?.id].join('|'),time:s.time,
      gathered:s.metrics.gathered,material:p.carry.material,deposited:s.metrics.deposited,generation:s.generation,
      built:s.metrics.built,quest:s.quest,discoveries:s.discovered.length,samples:s.journey?.active?.samples.length||0,
      hit:p.hitAt,attack:p.attackAt,mode,walking:p.moveSpeed>.3,events:s.eventSeq,transition:!!s.journey?.transition};
    const old=this.previous;this.previous=next;
    if(!old||old.key!==next.key||next.time<old.time)return [];
    const cues=[];
    if(next.generation>old.generation||next.samples>old.samples||next.quest>old.quest||next.discoveries>old.discoveries||next.transition&&!old.transition)cues.push({id:'evolve',volume:.65});
    else if(next.built>old.built)cues.push({id:'deposit',volume:.8,rate:.82});
    else if(next.deposited>old.deposited)cues.push({id:'deposit',volume:.65});
    else if(next.material>old.material)cues.push({id:'gather-stone',volume:.48});
    else if(next.gathered>old.gathered)cues.push({id:'gather-leaf',volume:.5});
    if(next.hit!==undefined&&next.hit!==old.hit)cues.push({id:'impact',volume:.65});
    else if(next.attack!==undefined&&next.attack!==old.attack)cues.push({id:'impact',volume:.38,rate:1.08});
    if(['swim','wade'].includes(mode)&&next.walking&&(mode!==old.mode||Math.floor(next.time/1.4)!==Math.floor(old.time/1.4)))cues.push({id:'splash',volume:.2});
    if((s.recentEvents||[]).some(e=>e.seq>old.events&&e.type==='CompanionDied'))cues.push({id:'impact',volume:.45,rate:.75});
    return cues;
  }
}
