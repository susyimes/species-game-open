import { QUESTS } from '../core/config.js';

export function visibleSystems(s){
  const veteran=!!s.journey?.era||!!s.journey?.active;
  const settled=QUESTS.every(q=>s.completed.includes(q.id));
  return {
    evolve:veteran||s.metrics.deposited>=6||s.parts.length>0,
    colony:veteran||s.metrics.evolved>0||s.metrics.built>0||!!s.survival?.guideFood,
    journal:veteran||s.completed.includes('build')&&s.discovered.length>1,
    journey:veteran||s.journey?.serial>0||settled||!!s.habitatHealth?.critical||s.survival?.level==='famine',
    chapter:veteran||settled||!!s.chapter.trial||s.chapter.status==='won',
    rally:veteran||s.completed.includes('explore')||s.player.hp<90,
    weather:veteran||s.completed.includes('build')||s.weather==='squall',
  };
}
