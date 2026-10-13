import { BIOMES, WORLD_RADIUS, SEA_RADIUS, NEST } from './config.js';
import { mapIdOf, mapBiomes, distanceToRoad } from './maps.js';
import { clamp, dist, noise, random } from './math.js';

export function edgeAt(x, z, context=null) {
  const a=Math.atan2(z,x);
  return WORLD_RADIUS + Math.sin(a*3+(mapIdOf(context)==='home'?.2:1.4))*3.8 + Math.cos(a*5)*2.4;
}
export function heightAt(x, z, context=null) {
  const r=Math.hypot(x,z), edge=edgeAt(x,z,context);
  const base=1.7 + (noise(x*.07,z*.07)-.5)*2.4 + (noise(x*.22,z*.22)-.5)*.45;
  const hill=3.7*Math.exp(-((x-23)**2+(z+21)**2)/220);
  const pond=3.7*Math.exp(-((x+19)**2/84+(z-10)**2/115));
  const shore=clamp((edge-r)/7,0,1);
  const original=(base+hill-pond)*shore - (1-shore)*1.9;
  const id=mapIdOf(context);if(id==='home')return original;
  const core=Math.hypot(x-NEST.x,z-NEST.z),blend=clamp((core-17)/7,0,1);
  const channel=3.9*Math.exp(-((x+15+Math.sin(z*.11)*3)**2)/24);
  const broken=(base+hill*.8-pond*.35-channel)*shore-(1-shore)*1.9;
  let h=original*(1-blend)+broken*blend;
  if(distanceToRoad(x,z)<2.5)h=Math.max(h,1.05+.14*Math.sin(z*.2+x*.12));
  if(id==='expedition'&&core>24)h+=Math.sin(x*.16)*.18;
  return h;
}
export function biomeAt(x,z,context=null) {
  let best=BIOMES[0], d=Infinity;
  for (const b of mapBiomes(context)) { const n=dist({x,z},b); if(n<d) { best=b;d=n; } }
  return best;
}
export function walkable(x,z,swim=false,nav=null) {
  // Fins unlock the same coastal water used by marine visitors, for both paths and direct movement.
  if (!Number.isFinite(x+z) || Math.hypot(x,z)>((swim||nav?.marine)?SEA_RADIUS:edgeAt(x,z,nav)-3.8)) return false;
  return heightAt(x,z,nav) > (swim ? -3.4 : Number.isFinite(nav?.level)?nav.level-.5:-.32) && !treesFor(nav).some(t=>Math.hypot(t.x-x,t.z-z)<.72*t.scale);
}

// Shared trunk obstacles: visual decoration and navigation use the same positions.
const treeCache=new Map();
export function treesFor(context=null){
  const id=mapIdOf(context);if(treeCache.has(id))return treeCache.get(id);
  const rng=random(id==='home'?841:1941),trees=[];
  for(let i=0;i<90;i++){
    const x=(rng()-.5)*86,z=(rng()-.5)*86;
    if(heightAt(x,z,context)<.7||Math.hypot(x,z)>edgeAt(x,z,context)-7||dist({x,z},NEST)<12||trees.some(t=>dist(t,{x,z})<3)||id!=='home'&&distanceToRoad(x,z)<3.5)continue;
    trees.push({x,z,scale:.85+rng()*.7,heading:rng()*Math.PI*2});
  }
  treeCache.set(id,trees);return trees;
}
export const TREES=treesFor();
export function terrainFor(context){
  return {heightAt:(x,z)=>heightAt(x,z,context),edgeAt:(x,z)=>edgeAt(x,z,context),biomeAt:(x,z)=>biomeAt(x,z,context),
    walkable:(x,z,swim=false,nav=null)=>walkable(x,z,swim,{...nav,mapId:mapIdOf(context)}),
    findPath:(a,b,swim=false,nav=null)=>findPath(a,b,swim,{...nav,mapId:mapIdOf(context)}),TREES:treesFor(context)};
}

// Cached navigation grids share the exact height function used to render the island.
// A* prevents click-to-move and workers from getting stuck against the shoreline.
const CELL=1.5, HALF=40, WIDTH=HALF*2+1;
const grids=new Map();
const key=(x,z)=>z*WIDTH+x;
const coord=(v)=>clamp(Math.round(v/CELL)+HALF,0,WIDTH-1);
const position=(i)=>({x:(i%WIDTH-HALF)*CELL,z:(Math.floor(i/WIDTH)-HALF)*CELL});
function grid(swim,nav=null) {
  const cacheKey=`${mapIdOf(nav)}|${swim}|${nav?.marine||false}|${nav?.level??'legacy'}`;
  if (!grids.has(cacheKey)) {
    const g=new Uint8Array(WIDTH*WIDTH);
    for(let i=0;i<g.length;i++){const p=position(i);g[i]=walkable(p.x,p.z,swim,nav)?1:0;}
    if(grids.size>=16)grids.delete(grids.keys().next().value);
    grids.set(cacheKey,g);
  }
  return grids.get(cacheKey);
}
function nearestCell(p,g,swim,nav) {
  const x=coord(p.x),z=coord(p.z);
  for(let r=0;r<5;r++) for(let dz=-r;dz<=r;dz++) for(let dx=-r;dx<=r;dx++) {
    const xx=x+dx,zz=z+dz;
    if(xx<0||xx>=WIDTH||zz<0||zz>=WIDTH)continue;
    const i=key(xx,zz); if(g[i]&&straight(p,position(i),swim,nav))return i;
  }
  return -1;
}
function straight(a,b,swim,nav=null) {
  const dx=b.x-a.x,dz=b.z-a.z,length2=dx*dx+dz*dz;
  // Test the whole trunk intersection, including the first grid connector.
  // Point-only and diagonal-cell tests miss narrow cuts across a circular trunk.
  for(const tree of treesFor(nav)){
    const t=length2?clamp(((tree.x-a.x)*dx+(tree.z-a.z)*dz)/length2,0,1):0;
    if(Math.hypot(a.x+dx*t-tree.x,a.z+dz*t-tree.z)<.72*tree.scale)return false;
  }
  const n=Math.ceil(dist(a,b)/.3);
  for(let i=1;i<=n;i++)if(!walkable(a.x+(b.x-a.x)*i/n,a.z+(b.z-a.z)*i/n,swim,nav))return false;
  return true;
}
export function findPath(start, target, swim=false,nav=null) {
  if(!walkable(target.x,target.z,swim,nav))return null;
  if(straight(start,target,swim,nav))return [{x:target.x,z:target.z}];
  const g=grid(swim,nav),s=nearestCell(start,g,swim,nav),goal=nearestCell(target,g,swim,nav);
  if(s<0||goal<0)return null;
  const open=[s],closed=new Set(),scores=new Map([[s,0]]),parents=new Map();
  const h=i=>dist(position(i),position(goal));
  let iterations=0;
  while(open.length&&iterations++<5500) {
    let best=0; for(let j=1;j<open.length;j++)if(scores.get(open[j])+h(open[j])<scores.get(open[best])+h(open[best]))best=j;
    const cur=open.splice(best,1)[0];
    if(cur===goal) {
      const path=[];let c=cur;while(c!==s){path.push(position(c));c=parents.get(c);}
      path.reverse();if(dist(start,position(s))>.02)path.unshift(position(s));path.push({x:target.x,z:target.z});
      const reduced=[];let from=start;
      for(let i=0;i<path.length;){let end=i;while(end+1<path.length&&straight(from,path[end+1],swim,nav))end++;reduced.push(path[end]);from=path[end];i=end+1;}
      return reduced;
    }
    closed.add(cur);const x=cur%WIDTH,z=Math.floor(cur/WIDTH);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const xx=x+dx,zz=z+dz;if(xx<0||xx>=WIDTH||zz<0||zz>=WIDTH)continue;
      const n=key(xx,zz);if(!g[n]||closed.has(n))continue;
      if(dx&&dz&&(!g[key(x+dx,z)]||!g[key(x,z+dz)]))continue;
      if(!straight(position(cur),position(n),swim,nav))continue;
      const score=scores.get(cur)+Math.hypot(dx,dz)*CELL;
      if(score<(scores.get(n)??Infinity)){scores.set(n,score);parents.set(n,cur);if(!open.includes(n))open.push(n);}
    }
  }
  return null;
}
