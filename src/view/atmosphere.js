import * as THREE from 'three';
import { random } from '../core/math.js';
import { environment, seaLevel } from '../core/weather.js';
import { terrainFor } from '../core/terrain.js';

export function createAtmosphere(scene,state){
  const { heightAt }=terrainFor(state);
  const count=innerWidth<600?250:800,rng=random(71382),seed=Array.from({length:count},()=>[rng()*40-20,rng()*16,rng()*40-20]);
  const positions=new Float32Array(count*6),geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const material=new THREE.LineBasicMaterial({color:'#bfd8d1',transparent:true,opacity:0,depthWrite:false});
  const rain=new THREE.LineSegments(geometry,material);rain.frustumCulled=false;scene.add(rain);
  const splashGeometry=new THREE.RingGeometry(.08,.105,12);splashGeometry.rotateX(-Math.PI/2);
  const splashMaterial=new THREE.MeshBasicMaterial({color:'#d8e9df',transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});
  const splashes=new THREE.InstancedMesh(splashGeometry,splashMaterial,48),dummy=new THREE.Object3D();splashes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);splashes.frustumCulled=false;splashes.name='Rain impacts';scene.add(splashes);
  const clear=new THREE.Color('#b2d2c4'),cloud=new THREE.Color('#94ada5'),storm=new THREE.Color('#6f8a88'),target=new THREE.Color();
  let opacity=0;
  return {update(dt,daylight){
    const weather=state.weather,wet=weather==='rain'||weather==='squall',factor=Math.min(1,dt/3),env=environment(state);
    opacity+=(wet?(weather==='squall'?.55:.35)-opacity:-opacity)*factor;material.opacity=opacity;rain.visible=opacity>.005;splashes.visible=rain.visible;splashMaterial.opacity=opacity*.55;
    if(rain.visible){
      for(let i=0;i<count;i++){
        const [x,y,z]=seed[i],at=i*6,fall=16-((y+state.time*(weather==='squall'?13:9))%16);
        const ground=Math.max(heightAt(state.player.x+x,state.player.z+z),seaLevel(state));
        positions[at]=state.player.x+x;positions[at+1]=ground+fall;positions[at+2]=state.player.z+z;
        positions[at+3]=positions[at]+env.wind*.25;positions[at+4]=ground+Math.max(.02,fall-.3-env.wind*.25);positions[at+5]=positions[at+2]+env.wind*.1;
      }
      geometry.attributes.position.needsUpdate=true;
      for(let i=0;i<48;i++){
        const [x,y,z]=seed[i],phase=(state.time*1.8+y)%1;
        dummy.position.set(state.player.x+x,Math.max(heightAt(state.player.x+x,state.player.z+z),seaLevel(state))+.035,state.player.z+z);dummy.scale.setScalar(.4+phase*2.4);dummy.updateMatrix();splashes.setMatrixAt(i,dummy.matrix);
      }
      splashes.instanceMatrix.needsUpdate=true;
    }
    target.copy(weather==='squall'?storm:weather==='clear'?clear:cloud).multiplyScalar(.6+.4*daylight);
    scene.background.lerp(target,factor);scene.fog.color.copy(scene.background);
    const near=weather==='mist'?22:weather==='squall'?32:52,far=weather==='mist'?68:weather==='squall'?88:125;
    scene.fog.near+=(near-scene.fog.near)*factor;scene.fog.far+=(far-scene.fog.far)*factor;
  },dispose(){scene.remove(rain,splashes);geometry.dispose();material.dispose();splashGeometry.dispose();splashMaterial.dispose();}};
}
