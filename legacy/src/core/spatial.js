/** Rebuilt once per simulation step. Local separation has a bounded neighbourhood. */
export class SpatialHash {
  constructor(size=3){this.size=size;this.cells=new Map();}
  key(x,z){return `${Math.floor(x/this.size)},${Math.floor(z/this.size)}`;}
  insert(entity){const key=this.key(entity.x,entity.z);if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(entity);}
  nearby(x,z,radius=3){
    const found=[];
    for(let xx=Math.floor((x-radius)/this.size);xx<=Math.floor((x+radius)/this.size);xx++)
      for(let zz=Math.floor((z-radius)/this.size);zz<=Math.floor((z+radius)/this.size);zz++)
        for(const e of this.cells.get(`${xx},${zz}`)||[])found.push(e);
    return found;
  }
}
