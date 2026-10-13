export const TICKS_PER_SECOND = 20;
export const DAY_TICKS = 360 * TICKS_PER_SECOND;
export function clockInfo(s) {
  const seconds = s.clock ? s.clock.tick / TICKS_PER_SECOND : s.time;
  const total = 8 + seconds / 360 * 24, hour = total % 24;
  return { day: Math.floor(total / 24) + 1, hour, elapsedDays: Math.floor(seconds / 360),
    phase: hour >= 5 && hour < 7 ? 'dawn' : hour >= 7 && hour < 17 ? 'day' : hour >= 17 && hour < 19 ? 'dusk' : 'night' };
}
export function advanceClock(s, dt) {
  s.clock ??= { tick: Math.round(s.time * TICKS_PER_SECOND) };
  s.clock.tick += Math.round(dt * TICKS_PER_SECOND);
  s.time = s.clock.tick / TICKS_PER_SECOND;
}
export function streamRandom(s, name) {
  s.randomStreams ??= { weather: (s.seed ^ 0x45d9f3b) >>> 0, ecology: (s.seed ^ 0x713e12) >>> 0, marine: (s.seed ^ 0x981efd) >>> 0 };
  s.randomStreams[name] = (Math.imul(s.randomStreams[name], 1664525) + 1013904223) >>> 0;
  return s.randomStreams[name] / 4294967296;
}
