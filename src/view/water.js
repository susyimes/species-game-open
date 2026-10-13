import * as THREE from 'three';
import { terrainFor } from '../core/terrain.js';
import { waterDepthAt, WATER_LEVEL } from '../core/water.js';
import { SPECIES } from '../core/config.js';
import { seaLevel, environment } from '../core/weather.js';

export function createWater(scene,state){
  const { heightAt }=terrainFor(state);
  const size=224,heights=new Uint8Array(size*size*4);
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const h=heightAt(x/(size-1)*112-56,z/(size-1)*112-56),i=(z*size+x)*4;
    heights[i]=Math.round(THREE.MathUtils.clamp((h+6)/14,0,1)*255);heights[i+3]=255;
  }
  const depthMap=new THREE.DataTexture(heights,size,size,THREE.RGBAFormat);depthMap.minFilter=depthMap.magFilter=THREE.LinearFilter;depthMap.needsUpdate=true;
  const ripples=Array.from({length:20},()=>new THREE.Vector4(0,0,9,0));
  const uniforms={uTime:{value:0},uDay:{value:1},uDepth:{value:depthMap},uRipples:{value:ripples},uLevel:{value:WATER_LEVEL},uWave:{value:1}};
  const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms,
    vertexShader:`
      uniform float uTime;uniform float uLevel;uniform float uWave;varying vec3 vWorld;
      void main(){
        vec3 p=position;
        p.y=uLevel+uWave*(.038*sin(p.x*.58+uTime*.95)*cos(p.z*.43-uTime*.6)+.02*sin((p.x+p.z)*.94+uTime*.72));
        vWorld=(modelMatrix*vec4(p,1.)).xyz;
        gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.);
      }`,
    fragmentShader:`
      uniform float uTime;uniform float uDay;uniform float uWave;uniform sampler2D uDepth;uniform vec4 uRipples[20];varying vec3 vWorld;
      void main(){
        vec2 p=vWorld.xz;vec2 uv=p/112.+.5;
        float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
        float bed=mix(-1.9,texture2D(uDepth,clamp(uv,0.,1.)).r*14.-6.,inside);
        float depth=max(0.,vWorld.y-bed);
        float dx=.038*.58*cos(p.x*.58+uTime*.95)*cos(p.y*.43-uTime*.6)+.02*.94*cos((p.x+p.y)*.94+uTime*.72);
        float dz=-.038*.43*sin(p.x*.58+uTime*.95)*sin(p.y*.43-uTime*.6)+.02*.94*cos((p.x+p.y)*.94+uTime*.72);
        dx+=sin(p.x*4.6+p.y*2.7+uTime*1.5)*.018;dz+=cos(p.y*4.1-p.x*2.1-uTime*1.1)*.018;
        dx*=uWave;dz*=uWave;
        float wake=0.;
        for(int i=0;i<20;i++){
          float age=uRipples[i].z;if(age>2.8||age<0.)continue;
          vec2 radial=p-uRipples[i].xy;float d=length(radial);float r=.20+age*.72;
          float ring=exp(-pow((d-r)*7.,2.))*(1.-age/2.8)*uRipples[i].w;
          wake+=ring;vec2 slope=normalize(radial+vec2(.001))*ring*.045;dx+=slope.x;dz+=slope.y;
        }
        vec3 normal=normalize(vec3(-dx,1.,-dz));vec3 viewDir=normalize(cameraPosition-vWorld);
        float fresnel=.055+.35*pow(1.-max(dot(normal,viewDir),0.),4.);
        vec3 shallow=vec3(.19,.51,.40),deep=vec3(.025,.20,.235),sky=vec3(.60,.77,.73);
        vec3 tint=mix(shallow,deep,1.-exp(-depth*.75));
        float caustic=pow(max(0.,sin(p.x*3.2+uTime*.8)*sin(p.y*3.5-uTime*.65)),8.)*.18*exp(-depth*.6);
        tint+=vec3(.36,.48,.24)*caustic*uDay;
        vec3 color=mix(tint,sky,fresnel)*(.50+.50*uDay);
        vec3 light=normalize(vec3(.55,1.,.35));
        float shine=pow(max(dot(reflect(-light,normal),viewDir),0.),130.);
        color+=vec3(1.,.94,.73)*shine*.8*uDay;
        float shore=(1.-smoothstep(.02,.40,depth))*(.35+.15*sin(p.x*3.+p.y*2.-uTime*1.2));
        float foam=clamp(shore+wake*.22,0.,.65);
        color=mix(color,vec3(.78,.89,.77),foam);
        float alpha=clamp(.22+(1.-exp(-depth*.8))*.70+foam*.16,.20,.93);
        gl_FragColor=vec4(color,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
  const geometry=new THREE.PlaneGeometry(240,240,144,144);geometry.rotateX(-Math.PI/2);
  const water=new THREE.Mesh(geometry,material);water.renderOrder=2;water.frustumCulled=false;scene.add(water);
  const emitted=new Map(),births=Array(20).fill(-100);let cursor=0;
  return {
    update(time,daylight){
      uniforms.uTime.value=time;uniforms.uDay.value=daylight;
      uniforms.uLevel.value=seaLevel(state,time);uniforms.uWave.value=1+Math.max(0,environment(state).wind-.2);
      for(const a of [state.player,...state.agents]){
        if(SPECIES[a.species]?.fly||a.hp<=0||a.moveSpeed<.3||waterDepthAt(a.x,a.z,time,state)<.05||Math.hypot(a.x-state.player.x,a.z-state.player.z)>32)continue;
        if(time-(emitted.get(a.id)??-100)<.34)continue;
        emitted.set(a.id,time);births[cursor]=time;ripples[cursor].set(a.x,a.z,0,Math.min(1,a.moveSpeed/3));cursor=(cursor+1)%20;
      }
      for(let i=0;i<20;i++)ripples[i].z=time-births[i];
    },
    dispose(){geometry.dispose();material.dispose();depthMap.dispose();},
  };
}
