import { BIOMES, NEST } from './config.js';

export const MAP_IDS = ['home','expedition','rift'];
export const SAMPLE_POINTS = [{x:-26,z:-11},{x:26,z:-23},{x:-26,z:25}];
export const ROADS = [[NEST,{x:5,z:-11}],[{x:5,z:-11},{x:-26,z:-11}],[{x:-26,z:-11},{x:-26,z:25}], [{x:5,z:-11},{x:26,z:-11}],[{x:26,z:-11},{x:26,z:-23}]];
export const mapIdOf = context => context?.mapId || 'home';
export function mapBiomes(context){
  const id=mapIdOf(context);if(id==='home')return BIOMES;
  const names=id==='expedition'?['远征营地','潮生苇湾','荧光根林','风蚀石脊']:['后裔巢地','裂潮湿地','千年根林','断层高地'];
  return BIOMES.map((b,i)=>({...b,name:names[i],description:['沿着高地安顿下来，准备下一段探索。','潮水留下近路，也吸引了水陆之间的生命。','粗大的根系与发光植物交错生长。','岩层被风雨磨开，新的猎食者在这里巡行。'][i]}));
}
export function distanceToRoad(x,z){
  return Math.min(...ROADS.map(([a,b])=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz)));return Math.hypot(x-a.x-t*dx,z-a.z-t*dz);}));
}
