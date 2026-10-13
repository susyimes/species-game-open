import { clockInfo, streamRandom } from './clock.js';
import { emit } from './events.js';
import { NEST, SPECIES } from './config.js';
import { biomeAt } from './terrain.js';

export const WEATHER = Object.freeze({
  clear: { name: '晴朗', min: 120, max: 240, wild: 1, garden: 1, sight: 1, recovery: 1, wind: .2 },
  cloudy: { name: '多云', min: 90, max: 150, wild: 1.1, garden: 1, sight: .95, recovery: 1, wind: .35 },
  rain: { name: '小雨', min: 90, max: 150, wild: 1.6, garden: 1.2, sight: .85, recovery: .95, wind: .5 },
  mist: { name: '薄雾', min: 60, max: 120, wild: 1.05, garden: 1, sight: .65, recovery: 1, wind: .15 },
  squall: { name: '风雨', min: 120, max: 120, wild: .7, garden: .6, sight: .75, recovery: .8, wind: 1 },
});
const TRANSITIONS = { clear: [['cloudy', 70], ['mist', 30]], cloudy: [['clear', 45], ['rain', 55]],
  rain: [['cloudy', 55], ['clear', 30], ['squall', 15]], mist: [['clear', 60], ['cloudy', 40]], squall: [['cloudy', 100]] };
export function initWeather(s, remaining = 180) {
  s.clock ??= { tick: Math.round(s.time * 20) };
  s.weatherV3 ??= { epoch: 0, current: s.weather || 'clear', lastSquallStartTick: -21600,
    schedule: [{ id: s.weather || 'clear', start: s.clock.tick, end: s.clock.tick + remaining * 20 }], publishedUntilTick: 0 };
  s.tide ??= { phaseOffset: -Math.PI / 2, bucket: 'low', navRevision: 0, changedAt: -200 };
  s.weatherV3.groundWetness ??= 0;
  s.weatherV3.surfaceTick ??= s.clock.tick;
  fillForecast(s);
}
export function fillForecast(s) {
  const w = s.weatherV3;
  while (w.schedule.at(-1).end < s.clock.tick + 3600) {
    const prev = w.schedule.at(-1), nextTick = prev.end;
    const hour = clockInfo({ time: nextTick / 20 }).hour;
    const candidates = TRANSITIONS[prev.id].filter(([id]) =>
      (id !== 'mist' || hour < 7 || hour >= 19) &&
      (id !== 'squall' || (nextTick >= (s.ecology?.adaptationUntilTick ?? 12000) && nextTick - w.lastSquallStartTick >= 21600 && !activeTrial(s))));
    let pick = streamRandom(s, 'weather') * candidates.reduce((sum, c) => sum + c[1], 0), id = candidates.at(-1)[0];
    for (const c of candidates) { pick -= c[1]; if (pick < 0) { id = c[0]; break; } }
    const spec = WEATHER[id], min = prev.id === 'squall' ? 120 : spec.min;
    const seconds = Math.round(min + streamRandom(s, 'weather') * (spec.max - min));
    w.schedule.push({ id, start: nextTick, end: nextTick + seconds * 20 });
    if (id === 'squall') w.lastSquallStartTick = nextTick;
  }
  w.publishedUntilTick = w.schedule.at(-1).end;
}
function activeTrial(s) { return s.chapter?.trial && !['resolved', 'failed', 'interrupted'].includes(s.chapter.trial.status); }
export function tideValue(s, at = s.time) {
  const blend = s.tide?.introducedAt === undefined ? 1 : Math.min(1, Math.max(0, (at - s.tide.introducedAt) / 60));
  return (s.mapId&&s.mapId!=='home'?.22:.1) * Math.sin(Math.PI * 2 * at / 180 + (s.tide?.phaseOffset ?? -Math.PI / 2)) * blend;
}
export function squallEnvelope(s, at = s.time) {
  const segment = s.weatherV3?.schedule.find(x => x.start <= at * 20 && x.end > at * 20);
  return segment?.id === 'squall' ? Math.max(0, Math.min(1, (at - segment.start / 20) / 10, (segment.end / 20 - at) / 10)) : 0;
}
export function seaLevel(s, at = s.time) { return .18 + tideValue(s, at) + .08 * squallEnvelope(s, at); }
export function environment(s, a = null) {
  const spec = WEATHER[s.weatherV3?.current || s.weather] || WEATHER.clear;
  const byNest=a&&Math.hypot(a.x-NEST.x,a.z-NEST.z)<=6;
  const reinforced=a&&s.chapter?.trial?.reinforced&&s.chapter.trial.endTick>s.clock.tick&&Math.hypot(a.x-NEST.x,a.z-NEST.z)<=8;
  const sheltered=!!(byNest||reinforced),wetness=s.weatherV3?.groundWetness||0;
  const amphibious=a&&(SPECIES[a.species]?.swim||['player','companion'].includes(a.kind)&&s.parts.includes('fins'));
  const biome=a?biomeAt(a.x,a.z,s).id:'meadow',mud=biome==='wetland'?.16:biome==='ridge'?.035:.08;
  const storm=(s.weatherV3?.current||s.weather)==='squall';
  return { ...spec,wetness,sheltered,foodDemand:storm?1.12:1,
    movement:sheltered?1:1-(amphibious?0:wetness*mud)-(storm?.06:0),
    harvest:sheltered?1:storm?.85:1,
    recovery:sheltered?1:spec.recovery };
}
export function navigation(s, marine = false) {
  return { mapId:s.mapId||'home', level: s.mapId&&s.mapId!=='home'?(s.tide?.bucket==='low'?.08:s.tide?.bucket==='high'?.50:.28):(s.tide?.bucket==='low'?.16:s.tide?.bucket==='high'?.36:.24),
    revision: s.tide?.navRevision || 0, marine, time: s.time, surface:seaLevel(s) };
}
export function updateWeather(s) {
  initWeather(s);
  const w = s.weatherV3, tick = s.clock.tick;
  while (w.schedule.length > 1 && tick >= w.schedule[0].end) {
    w.schedule.shift(); w.epoch++;
    emit(s, 'WeatherChanged', { weather: w.schedule[0].id }, `天气转为${WEATHER[w.schedule[0].id].name}。`);
  }
  w.current = w.schedule[0].id; s.weather = w.current; s.weatherAt = w.schedule[0].end / 20;
  const dt=Math.min(.1,Math.max(0,(tick-w.surfaceTick)/20));w.surfaceTick=tick;
  const rate=w.current==='rain'?1/45:w.current==='squall'?1/25:w.current==='clear'?-1/100:-1/180;
  w.groundWetness=Math.min(1,Math.max(0,w.groundWetness+rate*dt));
  fillForecast(s);
  const phase = clockInfo(s).phase;
  if (s.clock.phase && s.clock.phase !== phase) emit(s, 'DayPhaseChanged', { phase });
  s.clock.phase = phase;
  const level = seaLevel(s), old = s.tide.bucket;
  const bucket = level < .13 ? 'low' : level > .23 ? 'high' : level > .15 && level < .21 ? 'mid' : old;
  if (bucket !== old && tick - s.tide.changedAt >= 200) {
    s.tide.bucket = bucket; s.tide.navRevision++; s.tide.changedAt = tick;
    emit(s, 'TideChanged', { bucket });
  }
}
export function reserveTrialWeather(s) {
  initWeather(s);
  const w = s.weatherV3, tail = w.schedule.at(-1), earliest = Math.max(tail.end, s.clock.tick + 1200);
  // Center the 120-second window on an actual tide peak, including migrated phase offsets.
  const phase = s.tide.phaseOffset;
  let peak = (Math.PI / 2 - phase) / (Math.PI * 2) * 180;
  while ((peak - 60) * 20 < earliest) peak += 180;
  const start = Math.round((peak - 60) * 20), end = start + 2400;
  if (start > s.clock.tick + 14400) return null;
  if (tail.end < start) w.schedule.push({ id: 'cloudy', start: tail.end, end: start });
  w.schedule.push({ id: 'squall', start, end, trial: true }, { id: 'cloudy', start: end, end: end + 2400 });
  w.lastSquallStartTick = start; w.publishedUntilTick = end + 2400;
  return { start, end };
}
