import * as THREE from 'three';
import { heightAt as mapHeightAt, terrainFor } from '../core/terrain.js';
import { random, noise, dist } from '../core/math.js';
import { NEST } from '../core/config.js';
import { instanceAsset } from './assets.js';
import { createWater } from './water.js';
import { environment } from '../core/weather.js';

export function createLandscape(scene,assets,state){
  const { heightAt, biomeAt, edgeAt, TREES }=terrainFor(state);
  const geometry=new THREE.PlaneGeometry(112,112,160,160);geometry.rotateX(-Math.PI/2);
  const positions=geometry.attributes.position,colors=new Float32Array(positions.count*3),color=new THREE.Color();
  const sand=new THREE.Color(state.mapId==='expedition'?'#d3c79e':'#dccda0'),green=new THREE.Color('#91af60'),grove=new THREE.Color('#759c61'),ridge=new THREE.Color('#b4aa77'),wet=new THREE.Color('#789f77');
  for(let i=0;i<positions.count;i++){
    const x=positions.getX(i),z=positions.getZ(i),y=heightAt(x,z);positions.setY(i,y);
    const b=biomeAt(x,z).id;color.copy(b==='grove'?grove:b==='ridge'?ridge:b==='wetland'?wet:green);
    color.lerp(sand,Math.max(0,Math.min(1,(.95-y)*1.1)));
    color.multiplyScalar(.90+noise(x*.27,z*.27)*.20);
    color.toArray(colors,i*3);
  }
  const sourceHeights=Float32Array.from({length:positions.count},(_,i)=>positions.getY(i));
  geometry.setAttribute('color',new THREE.BufferAttribute(colors,3));geometry.computeVertexNormals();
  const ground=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.receiveShadow=true;ground.name='Ground';scene.add(ground);
  // Continue the ocean floor beyond the detailed island mesh, so coastal cameras never expose a square cut-off.
  const seaBed=new THREE.Mesh(new THREE.PlaneGeometry(240,240).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:sand,roughness:1}));
  seaBed.position.y=-1.92;seaBed.receiveShadow=true;seaBed.name='Sea bed';scene.add(seaBed);
  const water=createWater(scene,state);
  const rng=random(8512);
  const trees=instanceAsset(assets.tree,TREES,scene,{dynamic:true});
  trees.update(t=>({...t,y:heightAt(t.x,t.z)}));
  const grassGeo=new THREE.BufferGeometry();
  const gpos=[],gcolor=[],bend=[],base=new THREE.Color();
  for(let i=0;i<2900;i++){
    const x=(rng()-.5)*92,z=(rng()-.5)*92,y=heightAt(x,z);
    if(y<.5||Math.hypot(x,z)>edgeAt(x,z)-6||dist({x,z},NEST)<3.8||state.resources.some(r=>dist(r,{x,z})<1.1))continue;
    const h=.22+rng()*.42,w=.05+rng()*.05,heading=rng()*Math.PI*2;
    base.set(i%7===0?'#d9cf84':i%3===0?'#6d974e':'#9bb565');
    for(let j=0;j<3;j++){
      const a=heading+j*2.1,dx=Math.cos(a)*w,dz=Math.sin(a)*w;
      gpos.push(x-dx,y,z-dz,x+dx,y,z+dz,x+Math.sin(a)*.16,y+h,z+Math.cos(a)*.16);
      bend.push(0,0,1);
      for(let k=0;k<3;k++)gcolor.push(base.r,base.g,base.b);
    }
  }
  grassGeo.setAttribute('position',new THREE.Float32BufferAttribute(gpos,3));grassGeo.setAttribute('color',new THREE.Float32BufferAttribute(gcolor,3));grassGeo.computeVertexNormals();
  grassGeo.setAttribute('bladeBend',new THREE.Float32BufferAttribute(bend,1));
  const wind={time:{value:0},strength:{value:.2}};
  const grassMaterial=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1});
  grassMaterial.onBeforeCompile=shader=>{
    shader.uniforms.uWindTime=wind.time;shader.uniforms.uWindStrength=wind.strength;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute float bladeBend;\nuniform float uWindTime;\nuniform float uWindStrength;');
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfloat sway=sin(position.x*.45+position.z*.32+uWindTime*2.4)*(.025+uWindStrength*.17)*bladeBend;\ntransformed.x+=sway;transformed.z+=sway*.45;');
  };
  const grasses=new THREE.Mesh(grassGeo,grassMaterial);grasses.name='Wind grass';grasses.receiveShadow=true;scene.add(grasses);

  const puddlePositions=[];let puddleCount=0;
  for(let i=0;i<500&&puddleCount<38;i++){
    const x=(rng()-.5)*70,z=(rng()-.5)*70,h=heightAt(x,z);
    if(h<.5||h>2.8||dist({x,z},NEST)<7||TREES.some(t=>dist(t,{x,z})<1.5))continue;
    if([[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>Math.abs(heightAt(x+dx,z+dz)-h)>.16))continue;
    const rx=.55+rng()*.85,rz=.35+rng()*.55,phase=rng()*6.28;
    const point=angle=>{const r=1+.1*Math.sin(angle*3+phase),xx=x+Math.cos(angle)*rx*r,zz=z+Math.sin(angle)*rz*r;return [xx,heightAt(xx,zz)+.025,zz];};
    for(let j=0;j<24;j++)puddlePositions.push(x,h+.025,z,...point(j*Math.PI/12),...point((j+1)*Math.PI/12));
    puddleCount++;
  }
  const puddleGeometry=new THREE.BufferGeometry();puddleGeometry.setAttribute('position',new THREE.Float32BufferAttribute(puddlePositions,3));puddleGeometry.computeVertexNormals();
  const puddleMaterial=new THREE.MeshStandardMaterial({color:'#a1c4c0',metalness:.25,roughness:.17,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const puddles=new THREE.Mesh(puddleGeometry,puddleMaterial);puddles.name='Rain puddles';puddles.userData.patchCount=puddleCount;puddles.receiveShadow=true;puddles.visible=false;scene.add(puddles);

  const dustGeo=new THREE.BufferGeometry(),dust=[];
  for(let i=0;i<100;i++)dust.push((rng()-.5)*65,2+rng()*7,(rng()-.5)*65);
  dustGeo.setAttribute('position',new THREE.Float32BufferAttribute(dust,3));
  const motes=new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#fff1b4',size:.065,transparent:true,opacity:.65,depthWrite:false}));scene.add(motes);
  return {ground,morph(progress){for(let i=0;i<positions.count;i++){const to=mapHeightAt(positions.getX(i),positions.getZ(i),{mapId:'rift'});positions.setY(i,sourceHeights[i]+(to-sourceHeights[i])*progress);}positions.needsUpdate=true;geometry.computeVertexNormals();},update(time,daylight=1){
    const env=environment(state),wetness=env.wetness,gust=1+.2*Math.sin(time*.7)+.12*Math.sin(time*1.9);
    water.update(time,daylight);motes.rotation.y=time*.003;motes.material.opacity=(.25+.4*daylight)*(1-wetness*.8);
    const stress=state.habitatHealth?.stress||0;
    ground.material.color.setRGB((1-wetness*.25)*(1-stress*.05),(1-wetness*.18)*(1-stress*.27),(1-wetness*.10)*(1-stress*.24));ground.material.roughness=1-wetness*.45;
    seaBed.material.color.copy(sand).multiply(ground.material.color);
    grassMaterial.color.setRGB(1-wetness*.10,(1-wetness*.04)*(1-stress*.34),(1-wetness*.08)*(1-stress*.22));
    wind.time.value=time;wind.strength.value=env.wind*gust;
    trees.update(t=>({...t,y:heightAt(t.x,t.z),tiltX:Math.sin(time*1.3+t.x*.2)*env.wind*.032*gust,tiltZ:Math.cos(time*1.1+t.z*.17)*env.wind*.025*gust}));
    puddles.visible=wetness>.2;puddleMaterial.opacity=Math.max(0,(wetness-.2)/.8)*.62;
    puddleMaterial.roughness=.16+.045*Math.sin(time*3.4);
  },dispose(){
    water.dispose();for(const mesh of [ground,seaBed,grasses,motes,puddles,...trees.meshes]){scene.remove(mesh);mesh.geometry.dispose();}
    ground.material.dispose();seaBed.material.dispose();grassMaterial.dispose();motes.material.dispose();puddleMaterial.dispose();
  }};
}
