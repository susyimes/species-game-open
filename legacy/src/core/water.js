import { heightAt } from './terrain.js';

export const WATER_LEVEL=.18;
export function waterHeightAt(x,z,time=0){
  return WATER_LEVEL+.038*Math.sin(x*.58+time*.95)*Math.cos(z*.43-time*.6)+.02*Math.sin((x+z)*.94+time*.72);
}
export function waterDepthAt(x,z,time=0){return Math.max(0,waterHeightAt(x,z,time)-heightAt(x,z));}
export function waterPose({ground,surface,bodyHeight,scale=1,canSwim=false,flying=false}){
  if(flying)return {mode:'air',rootY:Math.max(ground,surface)+1.15,immersion:0};
  const depth=Math.max(0,surface-ground),stanceY=ground-.07;
  const floatingY=surface+.06-bodyHeight*scale;
  const swimming=canSwim&&floatingY>stanceY;
  return {mode:swimming?'swim':depth>.06?'wade':'land',rootY:swimming?floatingY:stanceY,immersion:Math.min(1,depth/(bodyHeight*scale))};
}
