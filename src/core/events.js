export function emit(s, type, data = {}, message = '', important = false) {
  s.eventSeq = (s.eventSeq || 0) + 1;
  const event = { seq: s.eventSeq, tick: s.clock?.tick ?? Math.round(s.time * 20), type, mapId:s.mapId||'home', ...data };
  s.recentEvents ??= []; s.recentEvents.push(event);
  if (s.recentEvents.length > 256) s.recentEvents.splice(0, s.recentEvents.length - 256);
  if (important) {
    s.chapterEvidence ??= []; s.chapterEvidence.push(event);
    if(s.chapterEvidence.length>256){
      const pinned=new Set([s.chapter?.victory?.evidenceId,s.chapter?.trial?.resultEventId,s.chapter?.trial?.feeEventId,s.chapter?.trial?.refundEventId]);
      const recent=new Set(s.chapterEvidence.slice(-240).map(e=>e.seq));
      s.chapterEvidence=s.chapterEvidence.filter(e=>recent.has(e.seq)||pinned.has(e.seq)||e.type==='ChapterWon');
    }
  }
  if (message) {
    const notice = { time: s.time, text: message, kind: type === 'ChapterWon' ? 'quest' : type === 'ExpeditionSample' ? 'resource' : type === 'CompanionDied' ? 'danger' : 'info' };
    s.notifications.push(notice); s.notifications = s.notifications.slice(-5);
    s.journal.unshift(notice); s.journal = s.journal.slice(0, 80);
  }
  return event;
}
export function disruptStability(s, reason) {
  if (!s.chapter || s.chapter.status === 'won') return;
  s.chapter.stableSinceTick = null;
  s.chapter.lastDisruptionTick = s.clock.tick;
  s.chapter.disruption = reason;
}
