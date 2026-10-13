import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export async function loadAssets(progress=()=>{}){
  const loader=new GLTFLoader();const names=['sprig','berry','nest','tree','stone','relic','mossback','reedbeak','emberfang','glowbug'];let loaded=0;
  const entries=await Promise.all(names.map(async name=>{
    const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
    gltf.scene.updateMatrixWorld(true);progress(++loaded/names.length);
    return [name,gltf.scene];
  }));
  const assets=Object.fromEntries(entries);
  for(const name of ['sprig','mossback','reedbeak','emberfang','glowbug'])optimizeCreature(assets[name]);
  return assets;
}
function compatibleGeometry(g){
  const geo=g.clone();
  for(const attr of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(attr))geo.deleteAttribute(attr);
  if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));
  return geo.index?geo.toNonIndexed():geo;
}
function optimizeCreature(root){
  const groups=[];root.traverse(o=>{if(!o.isMesh)groups.push(o);});
  for(const parent of groups){
    const buckets=new Map();
    for(const o of [...parent.children])if(o.isMesh&&!Array.isArray(o.material)){
      o.updateMatrix();const key=o.material.uuid;
      if(!buckets.has(key))buckets.set(key,{material:o.material,geos:[],objects:[]});
      buckets.get(key).geos.push(compatibleGeometry(o.geometry).applyMatrix4(o.matrix));buckets.get(key).objects.push(o);
    }
    for(const b of buckets.values()){
      const geometry=mergeGeometries(b.geos,false);if(!geometry)continue;
      const mesh=new THREE.Mesh(geometry,b.material);mesh.name=b.material.name;
      mesh.castShadow=true;mesh.receiveShadow=true;
      for(const o of b.objects)parent.remove(o);
      for(const g of b.geos)g.dispose();parent.add(mesh);
    }
  }
}
/** Merge each material once; repeat the prototype with GPU instances. */
export function instanceAsset(prototype,items,scene,{dynamic=false}={}){
  prototype.updateMatrixWorld(true);const buckets=new Map();
  prototype.traverse(o=>{if(!o.isMesh)return;
    const key=o.material.uuid;if(!buckets.has(key))buckets.set(key,{material:o.material,geos:[]});
    buckets.get(key).geos.push(compatibleGeometry(o.geometry).applyMatrix4(o.matrixWorld));
  });
  const meshes=[];
  for(const b of buckets.values()){
    const geometry=mergeGeometries(b.geos,false);for(const g of b.geos)g.dispose();
    const mesh=new THREE.InstancedMesh(geometry,b.material,items.length);
    mesh.castShadow=true;mesh.receiveShadow=true;
    if(dynamic)mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);meshes.push(mesh);
  }
  const dummy=new THREE.Object3D();
  function update(getTransform){
    for(let i=0;i<items.length;i++){
      const t=getTransform(items[i],i);dummy.position.set(t.x,t.y,t.z);dummy.rotation.set(0,t.heading||0,0);dummy.scale.setScalar(t.scale??1);dummy.updateMatrix();
      for(const mesh of meshes)mesh.setMatrixAt(i,dummy.matrix);
    }
    for(const mesh of meshes){mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();}
  }
  return {meshes,update};
}
