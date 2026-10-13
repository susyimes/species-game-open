import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { heightAt } from '../core/terrain.js';
import { habitatStage, habitatReinforced } from '../core/habitat.js';
import { instanceAsset } from './assets.js';

// Merge the small handmade details by material once, keeping the growing settlement inexpensive to draw.
function workshop(){
  const buckets=new Map(),root=new THREE.Group(),dummy=new THREE.Object3D();
  const colors={wood:'#97754d',reed:'#c4a66d',leaf:'#6d9962',tip:'#a4bc75',soil:'#756345',stone:'#b2b398',egg:'#ede0ab',fruit:'#cc8163'};
  function shape(geometry,color,position,scale=[1,1,1],rotation=[0,0,0]){
    dummy.position.set(...position);dummy.scale.set(...scale);dummy.rotation.set(...rotation);dummy.updateMatrix();
    const g=geometry.toNonIndexed();geometry.dispose();g.applyMatrix4(dummy.matrix);
    if(!buckets.has(color))buckets.set(color,[]);buckets.get(color).push(g);
  }
  const oval=(color,p,s,r=[0,0,0])=>shape(new THREE.SphereGeometry(1,10,6),color,p,s,r);
  const box=(color,p,s,r=[0,0,0])=>shape(new THREE.BoxGeometry(1,1,1),color,p,s,r);
  function beam(a,b,radius=.10,color='wood'){
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),direction=end.clone().sub(start);
    const g=new THREE.CylinderGeometry(radius*.82,radius,direction.length(),7);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),direction.normalize()));
    shape(g,color,start.add(end).multiplyScalar(.5).toArray());
  }
  function ring(radius,y,tube=.08,color='reed',x=0){
    shape(new THREE.TorusGeometry(radius,tube,5,28),color,[x,y,0],[1,1,1],[Math.PI/2,0,0]);
  }
  function leaf(p,s,rotation=0){
    oval('leaf',p,s,[0,rotation,.12]);
    beam([p[0],p[1]+s[1],p[2]-s[2]*.8],[p[0],p[1]+s[1],p[2]+s[2]*.8],.025,'tip');
  }
  function finish(){
    for(const [color,geometries] of buckets){
      const mesh=new THREE.Mesh(mergeGeometries(geometries),new THREE.MeshStandardMaterial({color:colors[color],roughness:.82}));
      for(const g of geometries)g.dispose();mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
    }
    return root;
  }
  return {oval,box,beam,ring,leaf,finish};
}

export function habitatSignature(building,state){
  return building.kind==='home'?`home:${habitatStage(state).level}:${habitatReinforced(state)}`:building.kind;
}

export function createHabitat(building,state,assets){
  const root=new THREE.Group(),model=new THREE.Group(),w=workshop();root.add(model);
  const stage=habitatStage(state),home=building.kind==='home';
  const owned=[],features=[],placements=new Map(),assetMeshes=[];
  function asset(name,p=[0,0,0],scale=1){
    if(!placements.has(name))placements.set(name,[]);
    placements.get(name).push({x:p[0],y:p[1],z:p[2],scale});
  }
  if(home){
    asset('nest',[0,0,0],1.1+(stage.level-1)*.12);
    w.oval('soil',[0,-.03,0],[2.55,.10,2.55]);
    // Open-front paving makes the entrance legible without hiding creatures resting at the centre.
    for(let i=0;i<5;i++)w.oval('stone',[(i%2-.5)*.45,.02,1.8+i*.3],[.36,.10,.27]);
    if(stage.level>=2){
      features.push('leaf canopy','branch entrance');
      for(const x of [-1.9,1.9]){
        w.beam([x,0,-1.2],[x*.90,2.55,-1.25],.14);
        w.beam([x,0,1.3],[x*.95,2.0,1.35],.13);
        w.beam([x*.9,2.52,-1.25],[x*.95,2.0,1.35],.11);
      }
      w.beam([-1.8,2.1,1.35],[0,2.75,1.35],.14);w.beam([0,2.75,1.35],[1.8,2.1,1.35],.14);
      for(let i=0;i<5;i++)w.leaf([(i-2)*.85,2.45+Math.sin(i*Math.PI/4)*.35,-.4],[.70,.10,1.65],(i-2)*.12);
      for(const x of [-2.05,2.05])w.oval('tip',[x,.12,-.4],[.42,.20,1.25]);
    }
    if(stage.level>=3){
      features.push('raised crown','woven screens','hanging seed pods');
      for(const x of [-1.85,1.85]){
        for(let j=0;j<3;j++)w.beam([x,.3+j*.25,-1.45],[x,.3+j*.25,.5],.055,'reed');
        for(let j=0;j<5;j++)w.beam([x,.10,-1.4+j*.42],[x,.98,-1.4+j*.42],.045);
        w.oval('fruit',[x,1.77,.95],[.16,.30,.16]);w.beam([x,2.15,.95],[x,1.85,.95],.027,'reed');
      }
      w.beam([0,2.6,-1.0],[0,3.48,-1.0],.13);
      for(let i=0;i<3;i++)w.leaf([(i-1)*.62,3.25+(.2-Math.abs(i-1)*.16),-.85],[.57,.09,1.04],(i-1)*.35);
      for(let i=0;i<6;i++){const a=Math.PI+i*Math.PI/5;w.oval('stone',[Math.cos(a)*2.45,.19,Math.sin(a)*2.4],[.35,.25,.28]);}
    }
    if(habitatReinforced(state)){
      features.push('storm braces');
      for(const x of [-2.0,2.0]){
        w.beam([x*1.25,0,-1.35],[x,1.9,-1.1],.15);
        w.beam([x*1.25,0,1.25],[x,1.75,1.1],.15);
        w.oval('stone',[x*1.25,.12,1.25],[.34,.22,.32]);
      }
    }
  }else if(building.kind==='nest'){
    features.push('nursery awning','eggs');asset('nest',[0,.10,.25],1.12);
    w.oval('soil',[0,0,0],[1.95,.12,1.85]);
    for(const x of [-1.5,1.5]){w.beam([x,0,-.9],[x*.7,2.05,-.9],.12);w.beam([x*.7,2.05,-.9],[x*.6,1.75,.65],.09);}
    for(let i=0;i<3;i++)w.leaf([(i-1)*.84,1.98,-.45],[.65,.10,1.2],(i-1)*.22);
    for(let i=0;i<3;i++)w.oval('egg',[(i-1)*.53,.57,.5],[.26,.40,.26]);
    w.ring(1.65,.22,.09);w.ring(1.67,.40,.07);
  }else if(building.kind==='garden'){
    features.push('raised planting beds','berry rows');
    w.box('soil',[0,.06,0],[3.35,.18,3.4]);
    for(const x of [-1.8,1.8])w.beam([x,.15,-1.8],[x,.15,1.8],.12);
    for(const z of [-1.8,1.8])w.beam([-1.8,.15,z],[1.8,.15,z],.12);
    for(const z of [-1.15,0,1.15])for(const x of [-.85,.85])asset('berry',[x,.13,z],.54);
    for(const z of [-.58,.58])w.box('reed',[0,.18,z],[3.15,.07,.09]);
    w.oval('stone',[1.45,.26,1.55],[.31,.21,.30]);
  }else if(building.kind==='cache'){
    features.push('woven food baskets','leaf cover');
    for(const x of [-.73,.73]){
      w.oval('wood',[x,.55,0],[.60,.58,.65]);
      for(let i=0;i<4;i++)w.ring(.63,.18+i*.26,.042,'reed',x);
      for(let i=0;i<10;i++){const a=i*Math.PI/5;w.beam([x+Math.cos(a)*.6,.12,Math.sin(a)*.6],[x+Math.cos(a)*.6,1.05,Math.sin(a)*.6],.034,'reed');}
      for(let i=0;i<4;i++)w.oval('fruit',[x+Math.cos(i*1.7)*.26,1.12,Math.sin(i*1.7)*.25],[.19,.20,.19]);
    }
    for(const x of [-1.65,1.65])w.beam([x,0,-.85],[x,1.75,-.85],.11);
    w.beam([-1.65,1.75,-.85],[1.65,1.75,-.85],.10);
    for(let i=0;i<4;i++)w.leaf([(i-1.5)*.80,1.73,-.43],[.57,.10,.90],-.12);
    for(let i=0;i<3;i++)w.oval('stone',[(i-1)*.65,.2,1.1],[.34,.25,.27]);
  }
  for(const [name,items] of placements){
    const batch=instanceAsset(assets[name],items,model);batch.update(item=>item);assetMeshes.push(...batch.meshes);
  }
  const details=w.finish();model.add(details);owned.push(details);
  const scaffoldWork=workshop();
  for(const x of [-1.9,1.9])for(const z of [-1.9,1.9])scaffoldWork.beam([x,0,z],[x,.95,z],.065,'reed');
  for(const x of [-1.9,1.9])scaffoldWork.beam([x,.75,-1.9],[x,.75,1.9],.045,'reed');
  const scaffold=scaffoldWork.finish();root.add(scaffold);owned.push(scaffold);
  root.name=`Habitat:${building.id}`;root.userData={kind:building.kind,stage:home?stage.level:null,features};
  root.position.set(building.x,heightAt(building.x,building.z,state),building.z);
  model.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  function update(progress){model.scale.y=.12+.88*progress;scaffold.visible=progress<1;root.userData.progress=progress;}
  update(building.progress);
  return {root,signature:habitatSignature(building,state),update,dispose(){
    root.removeFromParent();for(const mesh of assetMeshes)mesh.geometry.dispose();
    for(const group of owned)group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});
  }};
}
