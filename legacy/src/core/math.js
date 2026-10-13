export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function stateRandom(s) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
export function angleLerp(a, b, t) { return a + Math.atan2(Math.sin(b-a), Math.cos(b-a)) * t; }
export function noise(x, z) {
  const h = (a,b) => { const n = Math.sin(a*127.1+b*311.7)*43758.5453; return n-Math.floor(n); };
  const ix=Math.floor(x), iz=Math.floor(z), fx=x-ix, fz=z-iz;
  const u=fx*fx*(3-2*fx), v=fz*fz*(3-2*fz);
  return lerp(lerp(h(ix,iz),h(ix+1,iz),u),lerp(h(ix,iz+1),h(ix+1,iz+1),u),v);
}
