/** Pointer interpretation is separate from hit-testing and game rules. */
export class CreatureGestures {
  constructor(){this.down=null;}
  begin(target,x,y,time){this.down={target,x,y,time,moved:false,long:false};}
  move(x,y){if(this.down&&Math.hypot(x-this.down.x,y-this.down.y)>10)this.down.moved=true;}
  longPress(time){
    const d=this.down;
    if(!d||d.moved||d.long||time-d.time<550||!['enemy','companion','resource'].includes(d.target?.type))return null;
    d.long=true;return {...d.target,gesture:'long'};
  }
  finish(target,time){
    const held=this.longPress(time);
    const d=this.down;this.down=null;
    if(held)return held;
    if(!d||d.moved||d.long||!target)return null;
    const sameDown=d.target?.type===target.type&&d.target?.entity?.id===target.entity?.id;
    if(!sameDown)return null;
    return {...target,gesture:'single'};
  }
  cancel(){this.down=null;}
}
