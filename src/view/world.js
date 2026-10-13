import { mapBiomes } from '../core/maps.js';
import { createJourneyScenery } from './journey-scenery.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { NEST, BIOMES, SPECIES } from '../core/config.js';
import { terrainFor } from '../core/terrain.js';
import { loadAssets, instanceAsset } from './assets.js';
import { createLandscape } from './landscape.js';
import { createCreature } from './creature.js';
import { dayInfo } from '../core/simulation.js';
import { CreatureGestures } from './gestures.js';
import { createAtmosphere } from './atmosphere.js';
import { createHabitat, habitatSignature } from './habitat.js';
import { habitatStage } from '../core/habitat.js';
import { waterHeightAt } from '../core/water.js';
import { seaLevel } from '../core/weather.js';
import { actionFeedback } from '../core/interaction-feedback.js';
import { createSurvivalScenery, coastAsset } from './survival-scenery.js';

export async function createWorld(canvas,state,{onPick,onProgress,previewHost}){
  const { heightAt }=terrainFor(state);
  const BIOMES=mapBiomes(state);
  const assets=await loadAssets(onProgress,state);
  const renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
  const scene=new THREE.Scene();scene.background=new THREE.Color('#b2d2c4');scene.fog=new THREE.Fog('#b2d2c4',52,125);
  const camera=new THREE.PerspectiveCamera(42,innerWidth/innerHeight,.1,250);
  camera.position.set(state.player.x+16,23,state.player.z+22);
  const controls=new OrbitControls(camera,canvas);controls.target.set(state.player.x,1.5,state.player.z);
  controls.enableDamping=true;controls.dampingFactor=.10;controls.minDistance=13;controls.maxDistance=70;
  controls.minPolarAngle=.20;controls.maxPolarAngle=1.22;
  controls.mouseButtons={LEFT:null,MIDDLE:THREE.MOUSE.PAN,RIGHT:THREE.MOUSE.ROTATE};
  controls.touches={ONE:null,TWO:THREE.TOUCH.DOLLY_ROTATE};controls.enablePan=true;controls.panSpeed=.6;
  const ambient=new THREE.HemisphereLight('#f1f0d1','#6a8261',2.1);scene.add(ambient);
  const sun=new THREE.DirectionalLight('#fff0cf',3.0);sun.position.set(22,40,14);sun.castShadow=true;
  const warmLight=new THREE.Color('#fff0cf'),rainLight=new THREE.Color('#c6dbe2');
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-32,right:32,top:32,bottom:-32,near:1,far:100});
  sun.shadow.bias=-.0005;sun.shadow.normalBias=.035;scene.add(sun);scene.add(sun.target);
  const landscape=createLandscape(scene,assets,state);
  const atmosphere=createAtmosphere(scene,state);
  const scenery=createJourneyScenery(scene,state);
  const survivalScenery=createSurvivalScenery(scene,state);
  const actors=new Map(),hitboxes=new Map();
  const hitGeo=new THREE.SphereGeometry(1.15,8,6),hitMat=new THREE.MeshBasicMaterial({visible:false});
  const pickables=[];
  function ensureActors(){
    const liveIds=new Set([state.player,...state.agents].map(a=>a.id));
    for(const [id,actor] of actors)if(!liveIds.has(id)){scene.remove(actor.root);actor.dispose();actors.delete(id);const hit=hitboxes.get(id);scene.remove(hit);const i=pickables.indexOf(hit);if(i>=0)pickables.splice(i,1);hitboxes.delete(id);}
    for(const a of [state.player,...state.agents]){
      if(actors.has(a.id))continue;
      const assetName=SPECIES[a.species]?.asset||'sprig';
      if(!assets[assetName])throw new Error(`Missing species model: ${assetName}; loaded: ${Object.keys(assets).join(', ')}`);
      const actor=createCreature(assets[assetName],a.kind,a.species);scene.add(actor.root);actors.set(a.id,actor);
      const hit=new THREE.Mesh(hitGeo,hitMat);hit.userData={type:a.kind==='player'?'player':a.kind==='companion'?'companion':'enemy',id:a.id};scene.add(hit);hitboxes.set(a.id,hit);pickables.push(hit);
    }
  }
  ensureActors();
  const resourceBatches=[];
  for(const [kind,asset,coast] of [['food','berry'],['material','stone'],['relic','relic'],['food',null,'emergency'],['food',null,'tidal']]){
    const items=state.resources.filter(r=>r.kind===kind&&(coast?r.coast===coast:!r.coast));
    const prototype=coast?coastAsset(coast==='tidal'):assets[asset];
    const batch=instanceAsset(prototype,items,scene,{dynamic:true});resourceBatches.push({batch,items});
    for(const mesh of batch.meshes){mesh.userData={type:'resource',items};pickables.push(mesh);}
  }
  const buildings=new Map(),carcasses=new Map();
  const ringGeo=new THREE.RingGeometry(1.25,1.32,48);ringGeo.rotateX(-Math.PI/2);
  const selectedRing=new THREE.Mesh(ringGeo,new THREE.MeshBasicMaterial({color:'#fff1b2',transparent:true,opacity:.94,side:THREE.DoubleSide,depthWrite:false}));scene.add(selectedRing);
  const goalRing=new THREE.Mesh(new THREE.RingGeometry(.34,.40,32).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({color:'#fff1b2',transparent:true,opacity:.9,depthWrite:false}));scene.add(goalRing);goalRing.visible=false;
  const routeLine=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineDashedMaterial({color:'#f1e7aa',dashSize:.38,gapSize:.26,transparent:true,opacity:.6}));scene.add(routeLine);
  const labelLayer=document.getElementById('world-labels');
  const activity=document.getElementById('action-feedback'),activityLabel=document.getElementById('action-feedback-label'),activityValue=document.getElementById('action-feedback-value'),activityProgress=document.getElementById('action-feedback-progress'),activityBar=document.getElementById('action-feedback-bar');
  const nestLabel=document.createElement('button');nestLabel.className='world-label home-label';nestLabel.innerHTML='<span class="label-dot"></span> 初生之巢 <small>家园</small>';labelLayer.append(nestLabel);
  nestLabel.addEventListener('click',()=>onPick({type:'home',entity:NEST}));
  const biomeLabels=BIOMES.filter(b=>b.id!=='meadow').map(b=>{
    const el=document.createElement('div');el.className='world-label biome-label';el.innerHTML=`<span>◇</span> ${b.name}`;labelLayer.append(el);return {el,b};
  });
  const vec=new THREE.Vector3();
  function positionLabel(el,x,y,z){
    vec.set(x,y,z).project(camera);
    const visible=vec.z<1&&Math.abs(vec.x)<.94&&Math.abs(vec.y)<.83;
    el.hidden=!visible;
    if(visible)el.style.transform=`translate(-50%, -100%) translate(${(vec.x*.5+.5)*canvas.clientWidth}px,${(-vec.y*.5+.5)*canvas.clientHeight}px)`;
  }
  let follow=true,manualUntil=0,lastRoute='',previewParts=null;
  controls.addEventListener('start',()=>{manualUntil=performance.now()+5000;});
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),gestures=new CreatureGestures(),pointers=new Set();let pressTimer=null;
  const seaPlane=new THREE.Plane(new THREE.Vector3(0,1,0)),seaHit=new THREE.Vector3();
  function hitAt(x,y){
    const rect=canvas.getBoundingClientRect();pointer.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(pickables,false);
    for(const hit of hits){
      const data=hit.object.userData;
      const entity=data.items?data.items[hit.instanceId??0]:[state.player,...state.agents].find(a=>a.id===data.id);
      if(!entity||entity.hp===0||(entity.amount!==undefined&&entity.amount<1))continue;
      if(data.type==='player')continue;
      return {type:data.type,entity};
    }
    const terrain=raycaster.intersectObject(landscape.ground,false)[0];
    // Pick the visible water surface, not the submerged seabed several metres behind the pointer.
    seaPlane.constant=-seaLevel(state);
    const onSea=raycaster.ray.intersectPlane(seaPlane,seaHit);
    if(onSea&&heightAt(seaHit.x,seaHit.z)<seaHit.y&&(!terrain||raycaster.ray.origin.distanceTo(seaHit)<terrain.distance))
      return {type:'ground',entity:{x:seaHit.x,z:seaHit.z}};
    return terrain?{type:'ground',entity:{x:terrain.point.x,z:terrain.point.z}}:null;
  }
  function cancelPress(){clearTimeout(pressTimer);pressTimer=null;gestures.cancel();}
  canvas.addEventListener('pointerdown',e=>{
    if(e.button!==0){cancelPress();return;}
    pointers.add(e.pointerId);if(pointers.size>1){cancelPress();return;}
    gestures.begin(hitAt(e.clientX,e.clientY),e.clientX,e.clientY,performance.now());
    canvas.setPointerCapture?.(e.pointerId);
    pressTimer=setTimeout(()=>{const action=gestures.longPress(performance.now());if(action)onPick(action);},570);
  });
  canvas.addEventListener('pointermove',e=>{gestures.move(e.clientX,e.clientY);if(gestures.down?.moved)clearTimeout(pressTimer);});
  canvas.addEventListener('pointerup',e=>{
    if(e.button!==0)return;
    pointers.delete(e.pointerId);clearTimeout(pressTimer);
    if(pointers.size){cancelPress();return;}
    const action=gestures.finish(hitAt(e.clientX,e.clientY),performance.now());if(action)onPick(action);
  });
  canvas.addEventListener('pointercancel',e=>{pointers.delete(e.pointerId);cancelPress();});
  canvas.addEventListener('lostpointercapture',e=>{pointers.delete(e.pointerId);cancelPress();});
  canvas.addEventListener('dblclick',e=>e.preventDefault());
  canvas.addEventListener('contextmenu',e=>e.preventDefault());

  // A small second renderer gives the species card and editor a true live 3D preview.
  const previewRenderer=new THREE.WebGLRenderer({alpha:true,antialias:true});previewRenderer.setPixelRatio(Math.min(devicePixelRatio,1.5));previewRenderer.toneMapping=THREE.ACESFilmicToneMapping;previewRenderer.toneMappingExposure=1.4;
  previewRenderer.setClearColor(0x000000,0);previewHost.append(previewRenderer.domElement);
  const previewScene=new THREE.Scene();previewScene.add(new THREE.HemisphereLight('#fff9dc','#8ea79b',3));
  const key=new THREE.DirectionalLight('#fff2cf',3);key.position.set(3,6,5);previewScene.add(key);
  const rim=new THREE.DirectionalLight('#b1ded5',2);rim.position.set(-4,2,-3);previewScene.add(rim);
  const previewCamera=new THREE.PerspectiveCamera(34,1,.1,30);previewCamera.position.set(3.5,2.0,4.8);previewCamera.lookAt(0,1,0);
  const preview=createCreature(assets.sprig,'player');previewScene.add(preview.root);
  let previewWidth=0,previewHeight=0;
  const initialPlayer=new THREE.Vector3(state.player.x,1,state.player.z);
  function resize(){
    renderer.setSize(canvas.clientWidth,canvas.clientHeight,false);camera.aspect=canvas.clientWidth/canvas.clientHeight;camera.updateProjectionMatrix();
  }
  resize();const ro=new ResizeObserver(resize);ro.observe(canvas.parentElement);
  function tick(dt,realTime){
    ensureActors();const p=state.player;
    if(follow&&performance.now()>manualUntil){
      const target=new THREE.Vector3(p.x,Math.max(heightAt(p.x,p.z),waterHeightAt(p.x,p.z,state.time,state))+1,p.z),offset=target.clone().sub(controls.target).multiplyScalar(Math.min(1,dt*3));
      controls.target.add(offset);camera.position.add(offset);
    }
    controls.update();
    const hour=dayInfo(state).hour,daylight=Math.max(.30,Math.sin((hour-6)/24*Math.PI*2)*.6+.55);
    const storm=state.weather==='squall',rain=state.weather==='rain',lightBlend=Math.min(1,dt/2);
    sun.intensity+=(2.8*daylight*(storm?.55:state.weather==='clear'?1:.75)-sun.intensity)*lightBlend;
    ambient.intensity+=((1.6+daylight*.6)*(storm?.68:rain?.85:1)-ambient.intensity)*lightBlend;
    sun.color.lerp(storm||rain?rainLight:warmLight,lightBlend);
    sun.position.set(p.x+22,42,p.z+14);sun.target.position.set(p.x,0,p.z);
    landscape.update(state.time,daylight);
    atmosphere.update(dt,daylight);scenery.update(daylight);survivalScenery.update();
    for(const a of [p,...state.agents]){
      actors.get(a.id).update(a,state.time,state.paused?0:dt*state.speed,state.parts,state.appearance,state);
      const hit=hitboxes.get(a.id);hit.position.set(a.x,Math.max(waterHeightAt(a.x,a.z,state.time,state),heightAt(a.x,a.z))+(SPECIES[a.species]?.fly?1.9:.8),a.z);
    }
    for(const {batch,items} of resourceBatches)batch.update(r=>({x:r.x,y:r.kind==='relic'?Math.max(.12,heightAt(r.x,r.z)):heightAt(r.x,r.z),z:r.z,scale:r.amount<1?.12:r.kind==='relic'?1:.65+.35*r.amount/r.max,heading:r.x*.4}));
    for(const b of state.buildings){
      let visual=buildings.get(b.id);
      if(!visual||visual.signature!==habitatSignature(b,state)){
        visual?.dispose();visual=createHabitat(b,state,assets);buildings.set(b.id,visual);scene.add(visual.root);
      }
      visual.update(b.progress);
    }
    for(const [id,visual] of buildings)if(!state.buildings.some(b=>b.id===id)){visual.dispose();buildings.delete(id);}
    for(const r of state.resources.filter(r=>r.carcass)){
      if(!carcasses.has(r.id)){
        const mesh=new THREE.Mesh(new THREE.SphereGeometry(.4,12,8),new THREE.MeshStandardMaterial({color:'#cf9371'}));mesh.position.set(r.x,heightAt(r.x,r.z)+.25,r.z);mesh.scale.y=.6;mesh.userData={type:'resource',items:[r]};scene.add(mesh);pickables.push(mesh);carcasses.set(r.id,mesh);
      }
    }
    for(const [id,mesh] of carcasses)if(!state.resources.some(r=>r.id===id)){scene.remove(mesh);pickables.splice(pickables.indexOf(mesh),1);mesh.geometry.dispose();mesh.material.dispose();carcasses.delete(id);}
    const selected=state.selected||p;
    const markerHeight=(x,z)=>Math.max(heightAt(x,z),waterHeightAt(x,z,state.time,state));
    selectedRing.position.set(selected.x,markerHeight(selected.x,selected.z)+.08,selected.z);
    selectedRing.rotation.y=state.time*.25;
    const route=p.path||[],sig=route.map(n=>`${n.x},${n.z}`).join(';');
    if(route.length){const end=route.at(-1);goalRing.position.set(end.x,markerHeight(end.x,end.z)+.06,end.z);goalRing.visible=true;}else goalRing.visible=false;
    if(sig!==lastRoute||route.length){
      lastRoute=sig;routeLine.geometry.dispose();
      routeLine.geometry=new THREE.BufferGeometry().setFromPoints(route.length?[p,...route].map(n=>new THREE.Vector3(n.x,markerHeight(n.x,n.z)+.10,n.z)):[]);routeLine.computeLineDistances();routeLine.visible=route.length>0;
    }
    const habitat=habitatStage(state);
    if(nestLabel.dataset.level!==String(habitat.level)){nestLabel.dataset.level=String(habitat.level);nestLabel.innerHTML=`<span class="label-dot"></span> ${state.journey.active?'远征营地':state.journey.era?'后裔之巢':'初生之巢'} <small>${habitat.name}</small>`;}
    positionLabel(nestLabel,NEST.x,heightAt(NEST.x,NEST.z)+(habitat.level===3?3.9:3.1),NEST.z);
    for(const {el,b} of biomeLabels)positionLabel(el,b.x,heightAt(b.x,b.z)+3.5,b.z);
    const feedback=actionFeedback(state);
    activity.hidden=!feedback||!!document.querySelector('dialog[open]');
    if(!activity.hidden){
      let anchor=feedback.entity;
      vec.set(anchor.x,markerHeight(anchor.x,anchor.z)+2,anchor.z).project(camera);
      if(vec.z>=1||Math.abs(vec.x)>.82||Math.abs(vec.y)>.72){anchor=p;vec.set(p.x,markerHeight(p.x,p.z)+2,p.z).project(camera);}
      const x=THREE.MathUtils.clamp((vec.x*.5+.5)*canvas.clientWidth,96,canvas.clientWidth-96);
      const y=THREE.MathUtils.clamp((-vec.y*.5+.5)*canvas.clientHeight,140,canvas.clientHeight-(document.body.classList.contains('has-guide')?240:170));
      activity.style.transform=`translate(-50%, -100%) translate(${x}px,${y}px)`;activity.dataset.kind=feedback.kind;
      const label=(state.paused?'暂停 · ':'')+feedback.label;
      if(activityLabel.textContent!==label)activityLabel.textContent=label;
      activityProgress.hidden=feedback.value===null;
      const value=feedback.value===null?'':feedback.kind==='hunt'?feedback.valueText.replace('生命 ',''):`${Math.floor(feedback.value)}%`;
      if(activityValue.textContent!==value)activityValue.textContent=value;
      if(feedback.value!==null){
        activityBar.style.width=`${feedback.value}%`;activityProgress.setAttribute('aria-valuenow',String(Math.floor(feedback.value)));
        activityProgress.setAttribute('aria-label',feedback.kind==='hunt'?'猎物生命':'本次行动进度');
        activityProgress.setAttribute('aria-valuetext',feedback.kind==='hunt'?feedback.valueText:`${label} ${value}`);
      }
    }
    renderer.render(scene,camera);
    const host=previewRenderer.domElement.parentElement;
    if(host&&host.clientWidth&&host.clientHeight){
      if(host.clientWidth!==previewWidth||host.clientHeight!==previewHeight){
        previewWidth=host.clientWidth;previewHeight=host.clientHeight;previewRenderer.setSize(previewWidth,previewHeight,false);previewCamera.aspect=previewWidth/previewHeight;previewCamera.updateProjectionMatrix();
      }
      preview.update({...p,x:0,z:0,heading:Math.sin(realTime*.25)*.18,moveSpeed:0,behavior:'idle',hp:100},realTime,dt,previewParts||state.parts,state.appearance);preview.root.position.set(0,-.04,0);previewRenderer.render(previewScene,previewCamera);
    }
  }
  return {
    tick,renderer,scene,actors,camera,
    cinematic(progress,reduced){
      follow=false;const y=1.5+Math.sin(progress*Math.PI)*6,distance=reduced?34:24+Math.sin(progress*Math.PI)*29,angle=.65+(reduced?0:progress*.45);
      controls.target.set(NEST.x,y,NEST.z);camera.position.set(NEST.x+Math.sin(angle)*distance,18+Math.sin(progress*Math.PI)*27,NEST.z+Math.cos(angle)*distance);controls.update();
      const daylight=reduced?.85:.5+.5*Math.cos(progress*Math.PI*6);sun.intensity=.35+daylight*2.5;ambient.intensity=.65+daylight*1.3;scene.background.setRGB(.18+daylight*.48,.26+daylight*.5,.28+daylight*.4);landscape.update(state.time+progress*1000,daylight);landscape.morph?.(Math.max(0,(progress-.28)/.72));renderer.render(scene,camera);
    },
    cameraDirection(){const v=new THREE.Vector3();camera.getWorldDirection(v);v.y=0;v.normalize();return {x:v.x,z:v.z};},
    focusHome(){follow=false;controls.target.set(NEST.x,1.5,NEST.z);camera.position.set(NEST.x+20,29,NEST.z+27);controls.update();},
    focusPoint(p){follow=false;const y=heightAt(p.x,p.z);controls.target.set(p.x,y+.5,p.z);camera.position.set(p.x+10,y+18,p.z+16);controls.update();},
    focusPlayer(){follow=true;manualUntil=0;},
    focusReward(id){const group=scene.getObjectByName(`Reward_${id}`);if(!group)return;const p=group.position;follow=false;controls.target.set(p.x,p.y+.5,p.z);camera.position.set(p.x+8,p.y+14,p.z+13);controls.update();},
    zoom(mult){const off=camera.position.clone().sub(controls.target);off.multiplyScalar(mult).clampLength(13,70);camera.position.copy(controls.target).add(off);},
    showPreview(host,parts=null){host.append(previewRenderer.domElement);previewParts=parts;},
    previewParts(parts){previewParts=parts;},
    dispose(){ro.disconnect();controls.dispose();atmosphere.dispose();scenery.dispose();survivalScenery.dispose();landscape.dispose();for(const visual of buildings.values())visual.dispose();preview.dispose();renderer.dispose();previewRenderer.dispose();for(const actor of actors.values())actor.dispose();},
  };
}
