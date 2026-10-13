import { FIXED_DT, NEST, DAY_SECONDS, BUILDINGS, QUESTS, SPECIES, speciesStats } from './config.js';
import { clamp, dist, angleLerp, stateRandom } from './math.js';
import { walkable, heightAt, biomeAt, findPath } from './terrain.js';
import { makeAgent, notify, population } from './state.js';
import { SpatialHash } from './spatial.js';
import { waterDepthAt } from './water.js';

export function bagTotal(a){return a.carry.food+a.carry.material;}
export function harvestDuration(a,r){return r.kind==='relic'?3:a.kind==='player'?1.35:2.6;}
function stop(a){a.path=[];a.target=null;a.behavior='idle';a.work=0;}
function route(a,p,swim=false){a.path=findPath(a,p,swim)||[];return a.path.length>0;}
function slide(a,dx,dz,swim){
  if(walkable(a.x+dx,a.z+dz,swim)){a.x+=dx;a.z+=dz;return;}
  if(walkable(a.x+dx,a.z,swim))a.x+=dx;
  if(walkable(a.x,a.z+dz,swim))a.z+=dz;
}
function walk(a,dt,speed,swim=false,vector=null,waterFactor=.8){
  a.moveSpeed=0;
  let dx,dz,d;
  if(vector&&Math.hypot(vector.x,vector.z)>.01){
    dx=vector.x;dz=vector.z;d=Math.hypot(dx,dz);
  }else if(a.path?.length){
    let p=a.path[0];d=dist(a,p);
    if(d<.35){a.path.shift();if(!a.path.length)return;p=a.path[0];d=dist(a,p);}
    dx=p.x-a.x;dz=p.z-a.z;
  }else return;
  if(d<.001)return;
  const depth=waterDepthAt(a.x,a.z),wet=depth>.06;
  const multiplier=!wet?1:depth<.55?Math.max(.65,1-depth*.5):waterFactor;
  const step=Math.min(vector?Infinity:d,speed*dt*multiplier);
  const old={x:a.x,z:a.z};slide(a,dx/d*step,dz/d*step,swim);
  a.moveSpeed=dist(a,old)/dt;a.heading=angleLerp(a.heading,Math.atan2(dx,dz),Math.min(1,dt*10));
}
function deposit(s,a){
  const distance=dist(a,NEST);
  if(distance>3.8)a.depositVisit=null;
  if(distance>3.1)return;
  // A visit ends outside the outer radius, so a footstep at the edge cannot spam notices.
  a.depositVisit??={announced:false};
  const old=bagTotal(a);
  for(const kind of ['food','material']){
    // Economy is continuous, inventory transfers are whole batches. Preserve legacy fractions.
    const room=Math.max(0,Math.floor(s.colony.storage-s.colony[kind]+1e-8));
    const amount=Math.min(a.carry[kind],room);
    s.colony[kind]+=amount;a.carry[kind]-=amount;
  }
  const deposited=old-bagTotal(a);
  if(a.kind!=='player')return;
  if(deposited>1e-8)s.metrics.deposited+=deposited;
  if(old>1e-8&&!a.depositVisit.announced){
    a.depositVisit.announced=true;
    const remaining=bagTotal(a)>1e-8;
    if(deposited>1e-8){
      const label=deposited>=1?`${Math.floor(deposited)} 份收获`:'剩余收获';
      notify(s,`${label}已带回巢穴。${remaining?'仓库已满，其余物资留在背包。':''}`,'resource');
    }else notify(s,'仓库已满，收获暂留背包。营造储藏堆可以增加空间。','resource');
  }
}
function harvest(s,a,r,dt,stats){
  if(!r||r.amount<1){stop(a);return;}
  const cap=a.kind==='player'?stats.carry:stats.workerCarry;
  if(r.kind!=='relic'&&bagTotal(a)>=cap){
    if(a.kind==='player'){notify(s,'背包满了，回巢穴放下这些收获吧。');stop(a);}
    return;
  }
  if(dist(a,r)>2.1)return;
  a.path=[];a.moveSpeed=0;a.behavior='gather';a.heading=angleLerp(a.heading,Math.atan2(r.x-a.x,r.z-a.z),dt*7);
  const wetBonus=biomeAt(a.x,a.z).id==='wetland'?stats.wetHarvest:0;
  a.work+=dt*(a.kind==='player'?1:stats.efficiency)*(r.kind==='relic'?stats.research:stats.harvest+wetBonus);
  const duration=harvestDuration(a,r);
  if(a.work<duration)return;
  a.work=0;
  if(r.kind==='relic'){
    const reward=r.researchCount?8:18;
    r.amount=0;r.researchCount=(r.researchCount||0)+1;r.reawakenAt=s.time+180;s.colony.dna+=reward;
    notify(s,`孢子记忆化为了新的灵感。进化点 +${reward}；3 分钟后会孕育新的孢子。`,'evolve');stop(a);return;
  }
  const amount=Math.min(2,Math.floor(r.amount),cap-bagTotal(a));
  r.amount-=amount;a.carry[r.kind]+=amount;
  if(a.kind==='player'){a.stamina=Math.max(0,a.stamina-2*stats.drain);if(r.kind==='food')s.metrics.gathered+=amount;}
}
function hurt(s,target,amount,attacker){
  if(target.recoverUntil>s.time||target.hp<=0)return false;
  const friendly=['player','companion'].includes(target.kind);
  target.hp=Math.max(0,target.hp-amount*(friendly?1-speciesStats(s.parts).armor:1));target.hitAt=s.time;
  if(target.kind==='player'&&attacker.kind==='predator'){
    if(s.time-(target.lastDangerAt??-100)>8)notify(s,`${SPECIES[attacker.species]?.name||'猎食者'}正在攻击！按 E 反击，或返巢寻求庇护。`,'danger');
    target.lastDangerAt=s.time;
  }
  if(target.hp>0)return true;
  if(friendly){
    target.hp=target.kind==='player'?50:35;target.x=NEST.x+1.7;target.z=NEST.z+1.7;
    target.recoverUntil=s.time+(target.kind==='player'?5:18);stop(target);
    if(target.kind==='player'){
      target.carry.food=Math.floor(target.carry.food*.65);target.carry.material=Math.floor(target.carry.material*.65);
      notify(s,'同伴把你带回了巢穴。部分背包物品遗落在了路上。','danger');
    }else notify(s,'一位同伴受伤了，正在巢边休养。','danger');
  }else{
    target.homeX??=target.x;target.homeZ??=target.z;
    target.respawnAt=s.time+150;
    if(attacker.kind==='player'||attacker.kind==='companion'){
      s.colony.dna+=target.kind==='predator'?6:3;s.metrics.kills++;
      const carcass={id:'r'+s.nextId++,kind:'food',x:target.x,z:target.z,amount:8,max:8,regen:0,carcass:true};
      s.resources.push(carcass);
      if(s.selected?.id===target.id)s.selected=carcass;
      notify(s,target.kind==='predator'?'猎食者倒下了。附近留下了可以收集的食物。':'捕猎成功，留下了可以带回巢穴的食物。','resource');
    }
  }
  return true;
}
function attack(s,a,target,dt,damage){
  if(!target||target.hp<=0){stop(a);return;}
  if(dist(a,target)>2.05)return;
  a.behavior='attack';a.path=[];a.heading=angleLerp(a.heading,Math.atan2(target.x-a.x,target.z-a.z),dt*8);
  if(a.cooldown<=0){
    const attackerStats=['player','companion'].includes(a.kind)?speciesStats(s.parts):null;
    const defenderStats=['player','companion'].includes(target.kind)?speciesStats(s.parts):null;
    const landed=hurt(s,target,damage,a);a.cooldown=attackerStats?.attackInterval??.85;a.attackAt=s.time;
    if(landed&&attackerStats?.poison&&target.hp>0){target.poisonUntil=s.time+4;target.poisonDps=attackerStats.poison;target.poisonSource=a.id;}
    if(landed&&defenderStats?.thorns&&a.hp>0)hurt(s,a,defenderStats.thorns,target);
  }
}
function playerStep(s,dt,input,stats){
  const p=s.player,moving=Math.hypot(input.x||0,input.z||0)>.01;
  p.cooldown=Math.max(0,p.cooldown-dt);
  if(moving){stop(p);p.behavior='walk';}
  const sprint=input.sprint&&p.stamina>3&&(moving||p.path.length);
  walk(p,dt,stats.speed*(sprint?1.65:1),stats.swim,moving?input:null,stats.swimSpeed);
  if(sprint&&p.moveSpeed>0)p.stamina=Math.max(0,p.stamina-dt*12*stats.drain);
  else if(p.behavior!=='gather')p.stamina=Math.min(stats.stamina,p.stamina+dt*8*stats.staminaRegen);
  if(p.target){
    if(p.target.type==='resource'){
      const r=s.resources.find(r=>r.id===p.target.id);
      harvest(s,p,r,dt,stats);
      if(r&&r.amount>0&&!p.path.length&&dist(p,r)>2.1)route(p,r,stats.swim);
    }else if(p.target.type==='communicate'||p.target.type==='dominate'){
      const target=s.agents.find(a=>a.id===p.target.id),kind=p.target.type;
      if(!target||target.hp<=0){stop(p);return;}
      if(dist(p,target)>2.6){if(!p.path.length||p.decision<=0){route(p,target,stats.swim);p.decision=.8;}}
      else{
        p.path=[];p.moveSpeed=0;p.behavior=kind;p.work+=dt;
        p.heading=angleLerp(p.heading,Math.atan2(target.x-p.x,target.z-p.z),dt*6);
        if(p.work>=2.5){
          const cost=kind==='communicate'?8:20;
          if(p.stamina<cost){notify(s,'体力不足，先休息一下。');stop(p);return;}
          if(kind==='dominate'&&(target.trust||0)<60&&target.hp>(SPECIES[target.species]?.hp||100)*.4){notify(s,'对方还不愿臣服：需要 60 亲近或更低的生命。');stop(p);return;}
          p.stamina-=cost;
          if(kind==='communicate'){target.trust=Math.min(100,(target.trust||0)+35);target.pacifiedUntil=s.time+90;notify(s,`${SPECIES[target.species]?.name||'对方'}回应了你。亲近 ${target.trust} / 100。`,'social');}
          else {target.dominated=true;target.path=[];target.decision=0;notify(s,`${SPECIES[target.species]?.name||'对方'}接受了你的统治，开始跟随。`,'social');}
          stop(p);
        }
      }
    }else if(p.target.type==='enemy'){
      const target=s.agents.find(a=>a.id===p.target.id);
      if(target&&target.hp>0&&dist(p,target)>2){if(!p.path.length||p.decision<=0){route(p,target,stats.swim);p.decision=.8;}}
      attack(s,p,target,dt,stats.attack);
    }
  }
  p.decision-=dt;deposit(s,p);
  if(dist(p,NEST)<4)p.hp=Math.min(100,p.hp+dt*5);
  else if(stats.regen&&s.time-(p.hitAt??-100)>6)p.hp=Math.min(100,p.hp+dt*stats.regen);
  const biome=biomeAt(p.x,p.z);
  if(!s.discovered.includes(biome.id)){
    s.discovered.push(biome.id);s.metrics.discovered=s.discovered.length;s.colony.dna+=8;
    notify(s,`发现了${biome.name}。进化点 +8`,'discovery');
  }
}
function chooseResource(s,a){
  const demand=s.colony.material<s.colony.food*.75?'material':'food';
  const claims=new Map();
  for(const other of s.agents)if(other.target?.type==='resource')claims.set(other.target.id,(claims.get(other.target.id)||0)+1);
  return s.resources.filter(r=>r.amount>=2&&r.kind!=='relic'&&!r.carcass&&dist(r,NEST)<22&&walkable(r.x,r.z,speciesStats(s.parts).swim))
    .map(r=>({r,score:dist(a,r)+(r.kind===demand?0:8)+(claims.get(r.id)||0)*12}))
    .sort((a,b)=>a.score-b.score)[0]?.r;
}
function companionStep(s,a,dt,stats){
  a.cooldown=Math.max(0,a.cooldown-dt);a.decision-=dt;
  if(a.recoverUntil>s.time){a.behavior='rest';a.moveSpeed=0;return;}
  const danger=s.agents.find(e=>e.kind==='predator'&&!e.dominated&&!(e.pacifiedUntil>s.time)&&e.hp>0&&dist(e,a)<7);
  if(danger&&a.job==='guard'){
    if(a.decision<=0){route(a,danger,stats.swim);a.decision=.8;}
    walk(a,dt,stats.speed*.85,stats.swim,null,stats.swimSpeed);attack(s,a,danger,dt,stats.attack*.55);return;
  }
  if(danger&&dist(a,NEST)>4&&a.job!=='guard'){
    if(a.decision<=0){route(a,NEST,stats.swim);a.decision=1.5;}
    a.behavior='flee';walk(a,dt,stats.speed*1.2,stats.swim,null,stats.swimSpeed);return;
  }
  deposit(s,a);
  if(dist(a,NEST)<4)a.hp=Math.min(100,a.hp+dt*3);
  if(a.manualFollow){
    a.behavior='follow';
    if(dist(a,s.player)>3&&a.decision<=0){route(a,s.player,stats.swim);a.decision=.65;}
    if(dist(a,s.player)<2.2)a.path=[];
    walk(a,dt,stats.speed*.92,stats.swim,null,stats.swimSpeed);return;
  }
  const mustBuild=a.job==='build'&&s.buildings.some(b=>b.progress<1);
  if(!mustBuild&&bagTotal(a)>0&&(bagTotal(a)>=stats.workerCarry||a.target?.type==='home')){
    if(dist(a,NEST)<3&&['food','material'].every(k=>a.carry[k]<.01||s.colony[k]>=s.colony.storage-.1)){a.path=[];a.moveSpeed=0;a.behavior='rest';return;}
    a.target={type:'home'};a.behavior='return';if(a.decision<=0){route(a,NEST,stats.swim);a.decision=3;}
    walk(a,dt,stats.speed*.65,stats.swim,null,stats.swimSpeed);return;
  }
  if(a.target?.type==='home'&&bagTotal(a)===0){stop(a);a.decision=0;}
  if(a.job==='build'){
    const site=s.buildings.find(b=>b.progress<1);
    if(site){
      a.behavior='build';
      if(dist(a,site)>2){if(a.decision<=0){route(a,site,stats.swim);a.decision=3;}walk(a,dt,stats.speed*.7,stats.swim,null,stats.swimSpeed);}
      else {
        a.path=[];a.moveSpeed=0;const spec=BUILDINGS.find(b=>b.id===site.kind);
        site.progress=Math.min(1,site.progress+dt*stats.efficiency/spec.work);
        if(site.progress===1){
          if(site.kind==='nest')s.colony.capacity+=4;
          if(site.kind==='cache')s.colony.storage+=60;
          s.metrics.built++;notify(s,`${spec.name}建好了。${spec.effect}。`,'build');
        }
      }
      return;
    }
  }
  if(a.job==='guard'){
    const following=a.ralliedUntil>s.time,focus=following?s.player:NEST;
    if(a.decision<=0){
      const theta=stateRandom(s)*Math.PI*2;
      route(a,{x:focus.x+Math.cos(theta)*3.4,z:focus.z+Math.sin(theta)*3.4},stats.swim);
      a.decision=2+stateRandom(s)*2;
    }
    a.behavior=following?'follow':'guard';walk(a,dt,stats.speed*.8,stats.swim,null,stats.swimSpeed);return;
  }
  if(a.decision<=0&&(!a.target||!s.resources.some(r=>r.id===a.target.id&&r.amount>=1))){
    const r=chooseResource(s,a);
    if(r&&route(a,r,stats.swim)){a.target={type:'resource',id:r.id};a.work=0;}
    else if(bagTotal(a)>0){a.target={type:'home'};route(a,NEST,stats.swim);}
    a.decision=1.2+stateRandom(s);
  }
  const r=s.resources.find(r=>r.id===a.target?.id);
  if(r){a.behavior='forage';walk(a,dt,stats.speed*.62,stats.swim,null,stats.swimSpeed);harvest(s,a,r,dt,stats);}
  else {a.moveSpeed=0;a.behavior='idle';}
}
function wildStep(s,a,dt){
  const spec=SPECIES[a.species]||{},swim=!!spec.swim;
  if(a.hp<=0){
    if(s.time>=a.respawnAt){a.hp=spec.hp??(a.kind==='predator'?48:35);a.x=a.homeX;a.z=a.homeZ;stop(a);}
    return;
  }
  if(a.homeX===undefined){a.homeX=a.x;a.homeZ=a.z;}
  a.decision-=dt;a.cooldown=Math.max(0,a.cooldown-dt);
  if(a.dominated){
    a.behavior='follow';if(dist(a,s.player)>3.5&&a.decision<=0){route(a,s.player,swim);a.decision=.8;}
    if(dist(a,s.player)<2.8)a.path=[];walk(a,dt,Math.max(2.5,spec.speed||2),swim);return;
  }
  const listening=s.player.target?.id===a.id&&['communicate','dominate'].includes(s.player.target.type)&&dist(a,s.player)<5;
  if(listening){a.path=[];a.moveSpeed=0;a.behavior='curious';a.heading=angleLerp(a.heading,Math.atan2(s.player.x-a.x,s.player.z-a.z),dt*4);return;}
  let target=null;
  if(a.kind==='predator'){
    const candidates=[s.player,...s.agents].filter(b=>b!==a&&b.kind!=='predator'&&b.hp>0&&dist(b,NEST)>8&&dist(b,a)<8&&(!(a.pacifiedUntil>s.time)||!['player','companion'].includes(b.kind)));
    target=candidates.sort((x,y)=>dist(x,a)-dist(y,a))[0];
    if(target){if(a.decision<=0){route(a,target,swim);a.decision=.9;}walk(a,dt,spec.speed||3.6,swim);attack(s,a,target,dt,spec.attack||7);return;}
  }else{
    const danger=[...((a.trust||0)>0?[]:[s.player]),...s.agents.filter(b=>b.kind==='predator'&&!b.dominated&&b.hp>0)].find(b=>dist(a,b)<5);
    if(danger&&a.decision<=0){
      const dx=a.x-danger.x,dz=a.z-danger.z,d=Math.hypot(dx,dz)||1;
      route(a,{x:a.x+dx/d*6,z:a.z+dz/d*6},swim);a.decision=1;a.behavior='flee';
    }
  }
  if(a.decision<=0){
    const theta=stateRandom(s)*Math.PI*2,r=3+stateRandom(s)*7;
    route(a,{x:a.homeX+Math.cos(theta)*r,z:a.homeZ+Math.sin(theta)*r},swim);a.decision=4+stateRandom(s)*5;a.behavior='roam';
  }
  walk(a,dt,a.behavior==='flee'?(spec.flee||4.1):(spec.speed||1.2),swim,null,spec.fly?1:.9);
}
function economy(s,dt){
  const n=population(s),gardens=s.buildings.filter(b=>b.kind==='garden'&&b.progress===1).length;
  const income=gardens*5/60;
  s.colony.food=clamp(s.colony.food+(income-n*.018)*dt,0,s.colony.storage);
  if(s.colony.food<.01){
    s.colony.starve+=dt;
    if(s.colony.starve>30){notify(s,'巢里的食物用尽了。同伴开始疲惫，需要尽快补充。','danger');s.colony.starve=0;}
    for(const a of s.agents.filter(a=>a.kind==='companion'))a.hp=Math.max(20,a.hp-dt*.15);
  }else s.colony.starve=0;
  if(s.colony.egg){
    s.colony.egg.remaining-=dt;
    if(s.colony.egg.remaining<=0){
      // Capacity is checked again at completion, not only when placing the egg.
      if(population(s)<s.colony.capacity){
        const id='a'+s.nextId++;
        s.agents.push(makeAgent(id,'companion',NEST.x+2,NEST.z+1));
        notify(s,'新的小生命破壳了！它会和同伴一起采集。','birth');
      }
      s.colony.egg=null;
    }
  }
  for(const r of s.resources){
    if(r.kind==='relic'){if(r.amount===0&&r.reawakenAt&&s.time>=r.reawakenAt)r.amount=1;continue;}
    if(r.carcass)continue;
    const regen=r.kind==='food'?.021*(s.weather==='rain'?1.6:1):.006;
    r.amount=Math.min(r.max,r.amount+regen*dt);
  }
  s.resources=s.resources.filter(r=>!r.carcass||r.amount>=1);
  s.metrics.population=population(s);
  if(s.time>s.weatherAt){s.weather=s.weather==='rain'?'clear':stateRandom(s)<.4?'rain':'clear';s.weatherAt=s.time+80+stateRandom(s)*100;}
}
function separate(s,stats){
  const entities=[s.player,...s.agents.filter(a=>a.hp>0)],grid=new SpatialHash(2.5);
  for(const a of entities)grid.insert(a);
  const seen=new Set();
  for(const a of entities)for(const b of grid.nearby(a.x,a.z,1.3)){
    if(a===b)continue;
    const k=[a.id,b.id].sort().join(':');if(seen.has(k))continue;seen.add(k);
    let dx=a.x-b.x,dz=a.z-b.z,d=Math.hypot(dx,dz);
    if(d>=.94)continue;
    if(d<.001){dx=.05;dz=.03;d=Math.hypot(dx,dz);}
    const strength=(.94-d)*.28;
    const aSwim=(['player','companion'].includes(a.kind)&&stats.swim)||!!SPECIES[a.species]?.swim,bSwim=(['player','companion'].includes(b.kind)&&stats.swim)||!!SPECIES[b.species]?.swim;
    if(a.kind!=='player')slide(a,dx/d*strength,dz/d*strength,aSwim);
    if(b.kind!=='player')slide(b,-dx/d*strength,-dz/d*strength,bSwim);
  }
}
function quests(s){
  const q=QUESTS[s.quest];
  if(q&&(s.metrics[q.metric]||0)>=q.target){
    s.colony.dna+=q.reward;s.completed.push(q.id);s.quest++;
    notify(s,`旅程完成：${q.title}。进化点 +${q.reward}`,'quest');
  }
}
/** Fixed-step, deterministic gameplay. Rendering never creates resources or population. */
export function step(s,dt=FIXED_DT,input={}){
  if(s.paused||!s.started)return;
  dt=clamp(dt,0,.1);if(dt===0)return;
  s.time+=dt;const stats=speciesStats(s.parts);
  for(const a of [s.player,...s.agents])if(a.hp>0&&a.poisonUntil>s.time){const source=[s.player,...s.agents].find(b=>b.id===a.poisonSource);if(source)hurt(s,a,a.poisonDps*dt,source);}
  playerStep(s,dt,input,stats);
  for(const a of s.agents){a.age+=dt;if(a.kind==='companion')companionStep(s,a,dt,stats);else wildStep(s,a,dt);}
  separate(s,stats);economy(s,dt);quests(s);
}
export function dayInfo(s){
  const total=8+s.time/DAY_SECONDS*24;
  return {day:Math.floor(total/24)+1,hour:total%24};
}
