import * as THREE from 'three';
import { angleLerp, clamp } from '../core/math.js';
import { heightAt } from '../core/terrain.js';
import { SPECIES, APPEARANCES, speciesStats } from '../core/config.js';
import { waterHeightAt, waterPose } from '../core/water.js';

const PALETTES={player:['#4c9a78','#d4df8a','#224e48','#e79267'],companion:['#69aa85','#d5df92','#356955','#eaaa73'],grazer:['#c7a258','#ede1a0','#7c7043','#dd9670'],predator:['#a86c62','#e1bc85','#663f49','#d8725d']};
export function createCreature(prototype,kind='player',species=null){
  const model=prototype.clone(true),root=new THREE.Group();root.add(model);
  const palette=PALETTES[kind],materials=new Map();
  model.traverse(o=>{
    if(!o.isMesh)return;
    if(!materials.has(o.material.uuid)){
      const mat=o.material.clone();
      if(mat.name.startsWith('Skin'))mat.color.set(palette[0]);
      if(mat.name.startsWith('Belly'))mat.color.set(palette[1]);
      if(mat.name.startsWith('Markings'))mat.color.set(palette[2]);
      if(mat.name.startsWith('Fin'))mat.color.set(palette[3]);
      mat.roughness=Math.max(.42,mat.roughness);materials.set(o.material.uuid,mat);
    }
    o.material=materials.get(o.material.uuid);o.castShadow=true;o.receiveShadow=true;
  });
  const find=name=>{let found=null;model.traverse(o=>{if(o.name.replace(/[._]\d+$/,'')===name||o.name.replace(/[._]\d+$/,'').endsWith('_'+name))found=o;});return found;};
  const body=find('BodyPivot'),head=find('HeadPivot'),tail=find('TailPivot');
  const limbNames=['FL','FR','BL','BR'].filter(n=>find('Leg_'+n));
  const legs=limbNames.map(n=>find('Leg_'+n)),knees=limbNames.map(n=>find('Knee_'+n));
  const partNodes=[];model.traverse(o=>{if(o.name.startsWith('Part_'))partNodes.push(o);});
  const wings=[find('Wing_L'),find('Wing_R')].filter(Boolean),spec=SPECIES[species];
  const claws=[find('Claw_L'),find('Claw_R')].filter(Boolean);
  const bodyY=body.position.y,headRot=head.rotation.x;
  let phase=0,signature='',initialized=false,placed=false,swimBlend=0;
  const baseScale=spec?.scale??(kind==='player'?1.12:kind==='companion'?.84:kind==='predator'?1.25:.93);let scale=baseScale;
  root.scale.setScalar(scale);
  function setParts(list,appearance='fern'){
    const sig=list.join(',')+'|'+appearance;if(sig===signature&&initialized)return;signature=sig;initialized=true;
    for(const obj of partNodes)obj.visible=list.some(id=>obj.name==='Part_'+id||obj.name.startsWith('Part_'+id+'_'));
    if(!spec){
      const colors=APPEARANCES.find(a=>a.id===appearance)||APPEARANCES[0];
      for(const mat of materials.values()){
        if(mat.name.startsWith('Skin'))mat.color.set(colors.color);
        if(mat.name.startsWith('Belly'))mat.color.set(colors.belly);
        if(mat.name.startsWith('Fin'))mat.color.set(colors.accent);
      }
    }
    const long=list.includes('legs');for(const leg of legs)leg.scale.y=long?1.26:1;
    tail.scale.set(1,1,list.includes('tail')?1.4:1);
    body.userData.lift=long?.17:0;
  }
  function update(entity,time,dt,evolutions=[],appearance='fern',state=null){
    const remaining=Math.max(0,(entity.juvenileUntil||0)-(state?.time??time));
    scale=baseScale*(remaining>0?.55+.45*(1-Math.min(1,remaining/120)):1)*(['player','companion'].includes(kind)?speciesStats(evolutions,state?.style).bodySize:1);root.scale.setScalar(scale);
    setParts((kind==='player'||kind==='companion')?evolutions:[],appearance);
    const speed=entity.moveSpeed||0;phase+=speed*dt*2.8;
    const moving=Math.min(1,speed/2.5),eating=entity.behavior==='gather',attacking=['attack','charge'].includes(entity.behavior),winding=['windup','alert'].includes(entity.behavior);
    const ground=heightAt(entity.x,entity.z,state),surface=waterHeightAt(entity.x,entity.z,time,state);
    const pose=waterPose({ground,surface,bodyHeight:bodyY+(body.userData.lift||0),scale,canSwim:spec?!!spec.swim:(kind==='player'||kind==='companion')&&evolutions.includes('fins'),flying:spec?.fly});
    swimBlend+=((pose.mode==='swim'?1:0)-swimBlend)*Math.min(1,dt*5);
    const blend=!placed||Math.hypot(root.position.x-entity.x,root.position.z-entity.z)>8?1:Math.min(1,dt*22);
    root.position.x+=(entity.x-root.position.x)*blend;root.position.z+=(entity.z-root.position.z)*blend;
    const targetY=pose.rootY+(spec?.fly?Math.sin(time*3+entity.x)*.16:0);
    root.position.y+=(targetY-root.position.y)*(!placed?1:Math.min(1,dt*12));
    root.rotation.y=angleLerp(root.rotation.y,entity.heading,placed?Math.min(1,dt*18):1);placed=true;
    body.position.y=bodyY+(body.userData.lift||0)+Math.sin(time*2.2)*.018+Math.abs(Math.sin(phase*2))*.035*moving;
    body.rotation.z=Math.sin(phase)*.035*moving;
    body.rotation.x=(-.05+Math.sin(time*2.5)*.035)*swimBlend;
    for(let i=0;i<legs.length;i++){
      const gait=phase+(legs.length===2?i*Math.PI:i===0||i===3?0:Math.PI);
      const stride=Math.sin(gait)*.19*moving,lift=Math.max(0,Math.cos(gait))*.15*moving;
      const leg=legs[i],c=Math.cos(entity.heading),sn=Math.sin(entity.heading);
      const wx=entity.x+(leg.position.x*c+leg.position.z*sn)*scale,wz=entity.z+(-leg.position.x*sn+leg.position.z*c)*scale;
      const terrainDelta=clamp(heightAt(wx,wz,state)-ground,-.14,.14)/scale;
      const upper=spec?.upper??.30,lower=spec?.lower??.31,total=upper+lower;
      const down=clamp(total-.015-lift-terrainDelta,total*.6,total-.003),distance=clamp(Math.hypot(stride,down),.05,total-.001);
      // Two-bone sagittal IK. A stance foot follows the ground; a swing foot lifts.
      const bend=Math.acos(clamp((distance*distance-upper*upper-lower*lower)/(2*upper*lower),-1,1));
      const hip=Math.atan2(-stride,down)-Math.acos(clamp((upper*upper+distance*distance-lower*lower)/(2*upper*distance),-1,1));
      leg.rotation.x=hip;if(knees[i])knees[i].rotation.x=bend;
      leg.rotation.x+=(.55+Math.sin(time*5+(i%2)*Math.PI)*.33-leg.rotation.x)*swimBlend;
      leg.rotation.z=(leg.position.x<0?-1:1)*.22*swimBlend;
      if(knees[i])knees[i].rotation.x+=(.85+Math.cos(time*5+(i%2)*Math.PI)*.16-knees[i].rotation.x)*swimBlend;
    }
    head.rotation.x=headRot+(winding?.35:eating?.24+Math.sin(time*9)*.14:attacking?Math.sin(time*11)*.17:Math.sin(time*1.5)*.025);
    head.rotation.y=Math.sin(time*.6+entity.x)*.07*(1-moving);
    tail.rotation.y=Math.sin(time*(pose.mode==='swim'?4:2.2)+phase*.3)*(pose.mode==='swim'?.33:.1+.1*moving);
    root.userData.movementMode=pose.mode;
    wings.forEach((wing,i)=>{wing.rotation.z=(i===0?1:-1)*Math.sin(time*(spec?.wingRate??(spec?.fly?35:2)))*(spec?.wingAmplitude??(spec?.fly?.6:.05));});
    claws.forEach((claw,i)=>{claw.rotation.y=(i===0?1:-1)*(attacking?.25+Math.sin(time*11)*.23:winding?.3:Math.sin(time*1.5)*.035);});
    if(entity.hitAt&&time-entity.hitAt<.16)root.position.y+=Math.sin((time-entity.hitAt)*20)*.12;
    root.visible=entity.hp>0;
  }
  function dispose(){for(const m of materials.values())m.dispose();}
  return {root,model,update,setParts,dispose};
}
