/** Pointer interpretation is separate from hit-testing and game rules. */
export class CreatureGestures {
  constructor(){this.down=null;this.lastTap=null;}
  begin(target,x,y,time){this.down={target,x,y,time,moved:false,long:false};}
  move(x,y){if(this.down&&Math.hypot(x-this.down.x,y-this.down.y)>10)this.down.moved=true;}
  longPress(time){
    const d=this.down;
    if(!d||d.moved||d.long||time-d.time<550||!['enemy','companion'].includes(d.target?.type))return null;
    d.long=true;this.lastTap=null;return {...d.target,gesture:'long'};
  }
  finish(target,time){
    const d=this.down;this.down=null;
    if(!d||d.moved||d.long){this.lastTap=null;return null;}
    if(!target){this.lastTap=null;return null;}
    const sameDown=d.target?.type===target.type&&d.target?.entity?.id===target.entity?.id;
    const double=target.type==='enemy'&&sameDown&&this.lastTap?.id===target.entity.id&&time-this.lastTap.time<=330;
    this.lastTap=target.type==='enemy'&&!double?{id:target.entity.id,time}:null;
    return {...target,gesture:double?'double':'single'};
  }
  cancel(){this.down=null;this.lastTap=null;}
}
