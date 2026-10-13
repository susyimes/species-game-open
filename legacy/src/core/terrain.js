import { BIOMES, WORLD_RADIUS } from './config.js';
import { clamp, dist, noise, random } from './math.js';

export function edgeAt(x, z) {
  const a=Math.atan2(z,x);
  return WORLD_RADIUS + Math.sin(a*3+.2)*3.8 + Math.cos(a*5)*2.4;
}
export function heightAt(x, z) {
  const r=Math.hypot(x,z), edge=edgeAt(x,z);
  const base=1.7 + (noise(x*.07,z*.07)-.5)*2.4 + (noise(x*.22,z*.22)-.5)*.45;
  const hill=3.7*Math.exp(-((x-23)**2+(z+21)**2)/220);
  const pond=3.7*Math.exp(-((x+19)**2/84+(z-10)**2/115));
  const shore=clamp((edge-r)/7,0,1);
  return (base+hill-pond)*shore - (1-shore)*1.9;
}
export function biomeAt(x,z) {
  let best=BIOMES[0], d=Infinity;
  for (const b of BIOMES) { const n=dist({x,z},b); if(n<d) { best=b;d=n; } }
  return best;
}
export function walkable(x,z,swim=false) {
  if (!Number.isFinite(x+z) || Math.hypot(x,z)>edgeAt(x,z)-3.8) return false;
  return heightAt(x,z) > (swim ? -3.4 : -.32) && !TREES.some(t=>Math.hypot(t.x-x,t.z-z)<.72*t.scale);
}

// Shared trunk obstacles: visual decoration and navigation use the same positions.
export const TREES=(()=>{
  const rng=random(841),trees=[];
  for(let i=0;i<90;i++){
    const x=(rng()-.5)*86,z=(rng()-.5)*86;
    if(heightAt(x,z)<.7||Math.hypot(x,z)>edgeAt(x,z)-7||dist({x,z},{x:5,z:9})<12||trees.some(t=>dist(t,{x,z})<3))continue;
    trees.push({x,z,scale:.85+rng()*.7,heading:rng()*Math.PI*2});
  }
  return trees;
})();

// Cached navigation grids share the exact height function used to render the island.
// A* prevents click-to-move and workers from getting stuck against the shoreline.
const CELL=1.5, HALF=36, WIDTH=HALF*2+1;
const grids=new Map();
const key=(x,z)=>z*WIDTH+x;
const coord=(v)=>clamp(Math.round(v/CELL)+HALF,0,WIDTH-1);
const position=(i)=>({x:(i%WIDTH-HALF)*CELL,z:(Math.floor(i/WIDTH)-HALF)*CELL});
function grid(swim) {
  if (!grids.has(swim)) {
    const g=new Uint8Array(WIDTH*WIDTH);
    for(let i=0;i<g.length;i++){const p=position(i);g[i]=walkable(p.x,p.z,swim)?1:0;}
    grids.set(swim,g);
  }
  return grids.get(swim);
}
function nearestCell(p,g) {
  const x=coord(p.x),z=coord(p.z);
  for(let r=0;r<5;r++) for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++) {
    const xx=x+dx,zz=z+dz;
    if(xx<0||xx>=WIDTH||zz<0||zz>=WIDTH)continue;
    const i=key(xx,zz); if(g[i])return i;
  }
  return -1;
}
function straight(a,b,swim) {
  const n=Math.ceil(dist(a,b)/.6);
  for(let i=1;i<=n;i++)if(!walkable(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,swim))return false;
  return true;
}
export function findPath(start, target, swim=false) {
  if(!walkable(target.x,target.z,swim))return null;
  if(straight(start,target,swim))return [{x:target.x,z:target.z}];
  const g=grid(swim),s=nearestCell(start,g),goal=nearestCell(target,g);
  if(s<0||goal<0)return null;
  const open=[s],closed=new Set(),scores=new Map([[s,0]]),parents=new Map();
  const h=i=>dist(position(i),position(goal));
  let iterations=0;
  while(open.length&&iterations++<5500) {
    let best=0; for(let j=1;j<open.length;j++)if(scores.get(open[j])+h(open[j])<scores.get(open[best])+h(open[best]))best=j;
    const cur=open.splice(best,1)[0];
    if(cur===goal) {
      const path=[];let c=cur;while(c!==s){path.push(position(c));c=parents.get(c);}
      path.reverse();path.push({x:target.x,z:target.z});
      const reduced=[];let from=start;
      for(let i=0;i<path.length;){let end=i;while(end+1<path.length&&straight(from,path[end+1],swim))end++;reduced.push(path[end]);from=path[end];i=end+1;}
      return reduced;
    }
    closed.add(cur);const x=cur%WIDTH,z=Math.floor(cur/WIDTH);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const xx=x+dx,zz=z+dz;if(xx<0||xx>=WIDTH||zz<0||zz>=WIDTH)continue;
      const n=key(xx,zz);if(!g[n]||closed.has(n))continue;
      if(dx&&dz&&(!g[key(x+dx,z)]||!g[key(x,z+dz)]))continue;
      const score=scores.get(cur)+Math.hypot(dx,dz)*CELL;
      if(score<(scores.get(n)??Infinity)){scores.set(n,score);parents.set(n,cur);if(!open.includes(n))open.push(n);}
    }
  }
  return null;
}
