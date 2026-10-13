import { waterHeightAt } from '../core/water.js';
import * as THREE from 'three';
import { NEST } from '../core/config.js';
import { heightAt } from '../core/terrain.js';

export function createJourneyScenery(scene,state){
  const root=new THREE.Group();root.name='JourneyScenery';scene.add(root);
  const geometries=[],materials=[],markers=[],windups=new Map(),blooms=[];
  function mesh(geometry,color,p,scale=[1,1,1],emissive=false,parent=root){
    geometries.push(geometry);const material=new THREE.MeshStandardMaterial({color,roughness:.65,emissive:emissive?color:0,emissiveIntensity:emissive?.8:0});materials.push(material);
    const m=new THREE.Mesh(geometry,material);m.position.set(...p);m.scale.set(...scale);m.castShadow=true;parent.add(m);return m;
  }
  if(!state.journey.active){
    const centers={glowflower:[NEST.x-13,NEST.z],tidespore:[NEST.x,NEST.z-13],saltseed:[NEST.x+12,NEST.z+5]};
    for(const id of state.journey.rewards){
      const [x,z]=centers[id],y=heightAt(x,z,state),group=new THREE.Group();group.name=`Reward_${id}`;root.add(group);group.position.set(x,y,z);
      mesh(new THREE.CylinderGeometry(2.2,2.4,.18,24),'#647964',[0,.04,0],[1,1,.8],false,group);
      const count=id==='glowflower'?18:id==='tidespore'?9:16;
      for(let i=0;i<count;i++){
        const a=i*2.4,r=.5+(i%4)*.4,xx=Math.cos(a)*r,zz=Math.sin(a)*r,h=.45+(i%3)*.2;
        if(id==='tidespore'){
          mesh(new THREE.DodecahedronGeometry(.42),'#859998',[xx,.26,zz],[1,1.5,1],false,group);
          blooms.push(mesh(new THREE.SphereGeometry(.3,10,6),'#9ae3c3',[xx,.8,zz],[1,.25,1],true,group));
        }else{
          mesh(new THREE.CylinderGeometry(.025,.04,h,5),'#729663',[xx,h/2,zz],[1,1,1],false,group);
          blooms.push(mesh(new THREE.SphereGeometry(id==='glowflower'?.23:.1,8,6),id==='glowflower'?'#c2f9b4':'#d4c696',[xx,h,zz],id==='glowflower'?[1,.7,1]:[.7,3,.7],id==='glowflower',group));
        }
      }
    }
  }
  for(const r of state.resources.filter(r=>r.sampleIndex!==undefined)){
    const marker=mesh(new THREE.TorusGeometry(1.5,.08,6,40),'#e4c877',[r.x,heightAt(r.x,r.z,state)+.12,r.z]);marker.rotation.x=Math.PI/2;markers.push({r,marker});
  }
  const auraGeo=new THREE.RingGeometry(1.7,1.9,48).rotateX(-Math.PI/2),auraMat=new THREE.MeshBasicMaterial({color:'#d8ddb2',transparent:true,opacity:.55,side:THREE.DoubleSide,depthWrite:false});geometries.push(auraGeo);materials.push(auraMat);
  const aura=new THREE.Mesh(auraGeo,auraMat);aura.name='StyleAbilityAura';root.add(aura);
  return {root,update(daylight){
    for(const {r,marker} of markers){marker.visible=r.amount>0;marker.scale.setScalar(1+.04*Math.sin(state.time*2));}
    for(const b of blooms)if(b.material.emissive.getHex())b.material.emissiveIntensity=.2+(1-daylight)*1.5;
    aura.visible=!!state.player.skill&&state.player.skill.until>state.time;
    aura.position.set(state.player.x,Math.max(heightAt(state.player.x,state.player.z,state),waterHeightAt(state.player.x,state.player.z,state.time,state))+.14,state.player.z);
    aura.scale.setScalar(state.style==='guardian'?3.2:1);auraMat.color.set(state.style==='hunter'?'#e0a072':state.style==='tidal'?'#71d0d0':'#dbe4a0');
    for(const a of state.agents){
      if(a.hp<=0||a.dominated||a.pacifiedUntil>state.time||!a.special||a.special.phase!=='windup'){const m=windups.get(a.id);if(m)m.visible=false;continue;}
      let m=windups.get(a.id);if(!m){const g=new THREE.PlaneGeometry(1.2,8).rotateX(-Math.PI/2).translate(0,0,4),mat=new THREE.MeshBasicMaterial({color:'#df815c',transparent:true,opacity:.40,side:THREE.DoubleSide,depthWrite:false});geometries.push(g);materials.push(mat);m=new THREE.Mesh(g,mat);m.name='AttackWarning';root.add(m);windups.set(a.id,m);}
      m.visible=true;m.position.set(a.x,Math.max(heightAt(a.x,a.z,state),waterHeightAt(a.x,a.z,state.time,state))+.17,a.z);m.rotation.y=Math.atan2(a.special.dx,a.special.dz);
    }
  },dispose(){scene.remove(root);for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}
