import * as THREE from 'three';
import { heightAt, biomeAt, edgeAt, TREES } from '../core/terrain.js';
import { random, noise, dist } from '../core/math.js';
import { NEST } from '../core/config.js';
import { instanceAsset } from './assets.js';
import { createWater } from './water.js';

export function createLandscape(scene,assets,state){
  const geometry=new THREE.PlaneGeometry(112,112,160,160);geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position,colors=new Float32Array(positions.count*3),color=new THREE.Color();
  const sand=new THREE.Color('#dccda0'),green=new THREE.Color('#91af60'),grove=new THREE.Color('#759c61'),ridge=new THREE.Color('#b4aa77'),wet=new THREE.Color('#789f77');
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),y=heightAt(x,z);positions.setY(i,y);
    const b=biomeAt(x,z).id;color.copy(b==='grove'?grove:b==='ridge'?ridge:b==='wetland'?wet:green);
    color.lerp(sand,Math.max(0,Math.min(1,(.95-y)*1.1)));
    color.multiplyScalar(.90+noise(x*.27,z*.27)*.20);
    color.toArray(colors,i*3);
  }
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();
  const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.receiveShadow=true;ground.name='Ground';scene.add(ground);
  const water=createWater(scene,state);
  const rng=random(8512);
  const trees=instanceAsset(assets.tree,TREES,scene);
  trees.update(t=>({...t,y:heightAt(t.x,t.z)}));
  const grassGeo=new THREE.BufferGeometry();
  const gpos=[],gcolor=[],base=new THREE.Color();
  for(let i=0;i<2900;i++){
    const x=(rng()-.5)*92,z=(rng()-.5)*92,y=heightAt(x,z);
    if(y<.5||Math.hypot(x,z)>edgeAt(x,z)-6||dist({x,z},NEST)<3.8||state.resources.some(r=>dist(r,{x,z})<1.1))continue;
    const h=.22+rng()*.42,w=.05+rng()*.05,heading=rng()*Math.PI*2;
    base.set(i%7===0?'#d9cf84':i%3===0?'#6d974e':'#9bb565');
    for(let j=0;j<3;j++){
      const a=heading+j*2.1,dx=Math.cos(a)*w,dz=Math.sin(a)*w;
      gpos.push(x-dx,y,z-dz,x+dx,y,z+dz,x+Math.sin(a)*.16,y+h,z+Math.cos(a)*.16);
      for(let k=0;k<3;k++)gcolor.push(base.r,base.g,base.b);
    }
  }
  grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(gpos,3));grassGeo.setAttribute('color',new THREE.Float32BufferAttribute(gcolor,3));grassGeo.computeVertexNormals();
  const grasses=new THREE.Mesh(grassGeo,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1}));grasses.receiveShadow=true;scene.add(grasses);

  const dustGeo=new THREE.BufferGeometry(),dust=[];
  for(let i=0;i<100;i++)dust.push((rng()-.5)*65,2+rng()*7,(rng()-.5)*65);
  dustGeo.setAttribute('position',new THREE.Float32BufferAttribute(dust,3));
  const motes=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#fff1b4',size:.065,transparent:true,opacity:.65,depthWrite:false}));scene.add(motes);
  return {ground,update(time,daylight=1){water.update(time,daylight);motes.rotation.y=time*.003;}};
}
