import * as THREE from 'three';
import { mapBiomes } from '../core/maps.js';
import { heightAt } from '../core/terrain.js';
import { waterHeightAt } from '../core/water.js';
import { immigrationPosition } from '../core/ecosystem.js';
import { RIVAL_SITES } from '../core/rivals.js';

export function coastAsset(tidal=false){
  const root=new THREE.Group(),shell=new THREE.MeshStandardMaterial({color:tidal?'#739d79':'#c6b79a',roughness:.85});
  for(let i=0;i<5;i++){
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(.26,8,6),shell);mesh.scale.set(1.2,.32,1);mesh.position.set(Math.cos(i*2.4)*.48,.08,Math.sin(i*2.4)*.48);mesh.rotation.y=i;root.add(mesh);
    if(tidal){const leaf=new THREE.Mesh(new THREE.ConeGeometry(.13,.9,4),new THREE.MeshStandardMaterial({color:i%2?'#6c9873':'#8eb092',roughness:.8}));leaf.position.set(mesh.position.x,.5,mesh.position.z);leaf.rotation.z=Math.sin(i)*.3;root.add(leaf);}
  }
  return root;
}
export function createSurvivalScenery(scene,state){
  const group=new THREE.Group();group.name='Survival scenery';scene.add(group);
  const beacons=new Map(),mat=new THREE.MeshStandardMaterial({color:'#5d927c',roughness:.8});
  for(const b of mapBiomes(state)){
    const marker=new THREE.Group();marker.name=`Refuge_${b.id}`;
    const pole=new THREE.Mesh(new THREE.CylinderGeometry(.065,.095,1.8,6),new THREE.MeshStandardMaterial({color:'#9b8e64'}));pole.position.y=.9;marker.add(pole);
    const sign=new THREE.Mesh(new THREE.OctahedronGeometry(.33),mat);sign.position.y=1.75;marker.add(sign);
    const ring=new THREE.Mesh(new THREE.RingGeometry(1.4,1.5,40).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:'#83baa0',side:THREE.DoubleSide,transparent:true,opacity:.6,depthWrite:false}));ring.position.y=.04;marker.add(ring);
    marker.position.set(b.x,heightAt(b.x,b.z,state),b.z);group.add(marker);beacons.set(b.id,marker);
  }
  const raft=new THREE.Group();raft.name='Incoming restoration eggs';
  for(let i=0;i<3;i++){
    const branch=new THREE.Mesh(new THREE.CylinderGeometry(.1,.13,2,7),new THREE.MeshStandardMaterial({color:'#947956'}));branch.rotation.z=Math.PI/2;branch.position.z=(i-1)*.35;raft.add(branch);
    const egg=new THREE.Mesh(new THREE.SphereGeometry(.24,10,8),new THREE.MeshStandardMaterial({color:'#d8dfa4'}));egg.scale.y=1.3;egg.position.set((i-1)*.35,.29,0);raft.add(egg);
  }
  group.add(raft);
  const territories=RIVAL_SITES.map((point,i)=>{
    const mark=new THREE.Group();mark.name=`RivalTerritory_${i+1}`;
    const claw=new THREE.MeshStandardMaterial({color:'#a56a4a',roughness:1});
    for(let j=0;j<3;j++){const line=new THREE.Mesh(new THREE.BoxGeometry(.1,.06,1.4),claw);line.position.set((j-1)*.3,.06,0);line.rotation.y=.35;mark.add(line);}
    for(let j=0;j<4;j++){const stone=new THREE.Mesh(new THREE.DodecahedronGeometry(.25),claw);stone.position.set(Math.cos(j*1.57)*1.1,.2,Math.sin(j*1.57)*1.1);mark.add(stone);}
    mark.position.set(point.x,heightAt(point.x,point.z,state),point.z);group.add(mark);return mark;
  });
  const seedlings=new THREE.Group();seedlings.name='Replanted crops';group.add(seedlings);let soil=-1;
  function update(){
    territories.forEach((mark,i)=>{mark.visible=state.mapId==='home'&&(state.habitatHealth?.rivals?.stage||0)>i;});
    for(const [id,beacon] of beacons)beacon.visible=state.habitatHealth?.protected.includes(id);
    const position=immigrationPosition(state);raft.visible=!!position;
    if(position){raft.position.set(position.x,Math.max(heightAt(position.x,position.z,state),waterHeightAt(position.x,position.z,state.time,state))+.1,position.z);raft.rotation.y=state.time*.08;}
    if(soil!==(state.colony.soilLevel||0)){
      soil=state.colony.soilLevel||0;seedlings.traverse(o=>o.geometry?.dispose());seedlings.clear();
      for(let i=0;i<soil*4;i++){const leaf=new THREE.Mesh(new THREE.ConeGeometry(.16,.8,4),mat),x=7+(i%4)*.55,z=12+Math.floor(i/4)*.5;leaf.position.set(x,heightAt(x,z,state)+.35,z);leaf.rotation.z=.2;seedlings.add(leaf);}
    }
  }
  return {update,dispose(){scene.remove(group);const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.isMesh){geometries.add(o.geometry);materials.add(o.material);}});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}};
}
