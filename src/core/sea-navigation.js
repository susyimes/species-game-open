import { NEST } from './config.js';
import { terrainFor, findPath } from './terrain.js';
import { dist } from './math.js';

const routeCache=new Map();
export function seaRoutes(state=null) {
  const id=state?.mapId||'home';if(routeCache.has(id))return routeCache.get(id);
  const {heightAt,edgeAt,findPath,walkable}=terrainFor(state);let routes;
  const candidates=[];
  for (let i=0;i<48;i++) {
    const theta=i*Math.PI/24, c=Math.cos(theta),sn=Math.sin(theta), edge=edgeAt(c*46,sn*46);
    const entry={x:c*56,z:sn*56};
    let land=null;
    for(let r=edge-4;r>=edge-11;r-=.8){const p={x:c*r,z:sn*r};if(heightAt(p.x,p.z)>.55&&walkable(p.x,p.z)&&dist(p,NEST)>=18){land=p;break;}}
    if(!land)continue;
    const foot=findPath(NEST,land,false,{level:.36}),sea=findPath(entry,land,true,{level:.36,marine:true});
    if(!foot||!sea)continue;
    const length=foot.reduce((sum,p,j)=>sum+dist(p,j?foot[j-1]:NEST),0);
    const near={x:entry.x*.86,z:entry.z*.86};
    if(heightAt(near.x,near.z)>.1)continue;
    candidates.push({id:`coast-${i}`,theta,entry,near,land,footLength:length,
      name: c>.6?'东岸':c<-.6?'西岸':sn>0?'南岸':'北岸',trialEligible:length/4.3*2<38});
  }
  // Keep separate coastal sectors, with the most accessible shores first.
  candidates.sort((a,b)=>a.footLength-b.footLength);
  routes=[];
  for(const name of ['南岸','西岸','北岸','东岸']){const r=candidates.find(r=>r.name===name);if(r)routes.push(r);}
  for(const r of candidates)if(routes.length<4&&routes.every(other=>dist(other.land,r.land)>12))routes.push(r);
  routeCache.set(id,routes);return routes;
}
export function seaRoute(id,state=null){return seaRoutes(state).find(r=>r.id===id);}
export function feedingApproach(s,from,target,swim,nav){
  const t=terrainFor(s);
  if(t.findPath(from,target,swim,nav))return target;
  for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,p={x:target.x+Math.cos(angle)*2.6,z:target.z+Math.sin(angle)*2.6};
    if(t.walkable(p.x,p.z,swim,nav)&&t.findPath(from,p,swim,nav))return p;
  }
  return null;
}
export function routeToward(s,a,target){
  const p=findPath(a,target,true,{mapId:s.mapId,level:.5,marine:true,revision:s.tide.navRevision});
  if(!p){a.routeBlockedSinceTick??=s.clock.tick;a.decision=2;return false;}
  a.routeBlockedSinceTick=null;a.path=p;a.pathRevision=s.tide.navRevision;a.decision=2;return true;
}
