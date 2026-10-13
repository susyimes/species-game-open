import { FOOD_PER_MEMBER_SECOND, speciesStats } from './config.js';
import { environment } from './weather.js';
import { clamp } from './math.js';
import { emit, disruptStability } from './events.js';
import { SATIETY_SECONDS, JUVENILE_SECONDS, AUTO_BIRTH_INTERVAL, initFood, isJuvenile } from './survival-config.js';

export const family=s=>[s.player,...s.agents.filter(a=>a.kind==='companion'&&a.hp>0)];
export function hungerFactor(a){const value=a.satiety??100;return value>=70?1:value>=40?.85:value>=15?.65:.35;}
export function recoveryFactor(s,a){return hungerFactor(a)*(s.colony.foodPolicy==='ration'?.7:1);}
export function foodMultiplier(s){
  const mass=speciesStats(s.parts,s.style).bodySize||1;
  return mass*environment(s).foodDemand;
}
export function memberDemand(s,a){return FOOD_PER_MEMBER_SECOND*foodMultiplier(s)*(isJuvenile(s,a)?.5:1);}
export function foodOutlook(s){
  const people=family(s),average=people.reduce((sum,a)=>sum+(a.satiety??100),0)/people.length;
  const policy=s.colony.foodPolicy==='ration'?.65:1;
  const demand=people.reduce((sum,a)=>sum+memberDemand(s,a),0)*60;
  const gardens=s.buildings.filter(b=>b.kind==='garden'&&b.progress===1).length;
  const income=(s.journey?.active?0:gardens*(5+(s.colony.soilLevel||0)*.75))*environment(s).garden*(1-.3*(s.habitatHealth?.stress||0));
  const maintenance=demand*policy,net=income-maintenance;
  const refilling=policy===1?people.filter(a=>(a.satiety??100)<99).reduce((sum,a)=>sum+memberDemand(s,a)*SATIETY_SECONDS/100*2*60,0):0;
  const reserveMinutes=net<-.001?s.colony.food/-net:null;
  return {average,juveniles:people.filter(a=>isJuvenile(s,a)).length,adults:people.filter(a=>!isJuvenile(s,a)).length,
    income,demand,maintenance,net,reserveMinutes,refilling,pressure:s.colony.food<demand*3||average<70};
}
export function hatchChoice(s,automatic=false){
  if(s.journey?.active)return {ok:false,reason:'远征营地不孵育新成员。'};
  if(s.colony.egg)return {ok:false,reason:'巢中已有一枚卵。'};
  const people=family(s).length,limit=Math.min(s.colony.capacity,s.colony.populationLimit??10);
  if(people>=limit)return {ok:false,reason:people>=s.colony.capacity?'先扩充住处。':'已达到设定的人口上限。'};
  if(s.colony.food<18)return {ok:false,reason:'孵育需要 18 食物。'};
  if(automatic){
    if(!s.colony.breedingAllowed)return {ok:false,reason:'自然繁殖已暂停。'};
    if(s.time<(s.colony.nextAutoHatchAt||0))return {ok:false,reason:'族群正在休养，稍后再准备下一枚卵。'};
    const outlook=foodOutlook(s);
    if(outlook.average<70||s.survival?.shortageSeconds>0)return {ok:false,reason:'先让族群吃饱，再养育幼体。'};
    // Reserve against gross adult demand, so growth does not gamble on future harvests.
    if(s.colony.food-18<(people+1)*FOOD_PER_MEMBER_SECOND*foodMultiplier(s)*180)return {ok:false,reason:'支付孵育费用后，还需留足出生后全族三分钟口粮。'};
  }
  return {ok:true};
}
export function startHatching(s,automatic=false){
  const check=hatchChoice(s,automatic);if(!check.ok)return check;
  const duration=30/speciesStats(s.parts,s.style).hatchSpeed;
  s.colony.food-=18;s.colony.egg={remaining:duration,total:duration,automatic};
  s.colony.nextAutoHatchAt=s.time+AUTO_BIRTH_INTERVAL;
  emit(s,'EggStarted',{automatic,food:18},automatic?'族群留足了口粮，一枚新卵正在孵育。':'新卵已安顿。幼体破壳后需要两分钟养育。');return {ok:true};
}
export function configureFood(s,key,value){
  initFood(s);
  if(key==='breedingAllowed'&&typeof value==='boolean'&&!s.journey?.active)s.colony[key]=value;
  else if(key==='populationLimit'&&Number.isInteger(value)&&value>=1&&value<=18&&!s.journey?.active)s.colony[key]=value;
  else if(key==='foodPolicy'&&['normal','ration'].includes(value))s.colony[key]=value;
  else return {ok:false,reason:'这项供食设置暂不可用。'};
  return {ok:true};
}
export function plantSeeds(s){
  if(s.journey?.active)return {ok:false,reason:'带回家园后再补种。'};
  if(!s.colony.seedStock)return {ok:false,reason:'从种苗远征带回耐盐种子后，可以补种。'};
  if(s.colony.soilLevel>=3)return {ok:false,reason:'三轮补种已完成。'};
  if(!s.buildings.some(b=>b.kind==='garden'&&b.progress===1))return {ok:false,reason:'先建成一块浆果圃。'};
  s.colony.seedStock--;s.colony.soilLevel++;
  emit(s,'SeedsPlanted',{level:s.colony.soilLevel},'耐盐种子扎下了根，每块果圃的晴天产量增加 0.75 食物 / 分。');return {ok:true};
}
export function settleFood(s,dt,spawn){
  initFood(s);const c=s.colony,people=family(s),policy=c.foodPolicy==='ration'?.65:1;
  const outlook=foodOutlook(s);c.food=Math.min(c.storage,c.food+outlook.income/60*dt);
  const requests=people.map(a=>{
    const maintenance=memberDemand(s,a)*dt,unit=FOOD_PER_MEMBER_SECOND*(isJuvenile(s,a)?.5:1)*SATIETY_SECONDS/100;
    const catchup=policy===1?Math.min(100-(a.satiety??100),2*dt)*unit:0;
    const energy=a===s.player?Math.max(0,a.energyWanted||0):0;
    return {a,maintenance,unit,meal:maintenance*policy+catchup,energy,energyFood:energy*.003};
  });
  const requested=requests.reduce((sum,r)=>sum+r.meal+r.energyFood,0),spent=Math.min(c.food,requested),fraction=requested>0?spent/requested:1;
  c.food=Math.max(0,c.food-spent);s.survival.foodSpent+=spent;
  for(const r of requests){
    r.a.satiety=clamp(r.a.satiety+(r.meal*fraction-r.maintenance)/r.unit,0,100);
    if(r.energy){
      r.a.stamina=Math.min(speciesStats(s.parts,s.style).stamina,r.a.stamina+r.energy*(.15+.85*fraction));
      s.survival.energyFoodSpent+=r.energyFood*fraction;
    }
    if(r.a.satiety<15){r.a.hp=Math.max(r.a.kind==='player'?10:0,r.a.hp-dt*(r.a.satiety<=0?.3:.08));if(r.a.hp===0)r.a.deathCause='hunger';disruptStability(s,'族群需要食物');}
    if(r.a.kind==='companion'&&r.a.juvenileUntil>0&&s.time>=r.a.juvenileUntil){r.a.juvenileUntil=0;r.a.decision=0;emit(s,'MemberMatured',{entityId:r.a.id},'一位幼体已经成年，开始加入劳动。');}
  }
  s.player.energyWanted=0;
  s.survival.shortageSeconds=fraction<.999?s.survival.shortageSeconds+dt:0;
  const average=people.reduce((sum,a)=>sum+a.satiety,0)/people.length;
  const level=average<15?'famine':average<40?'hungry':average<70?'strained':'fed';
  if(level!==s.survival.level){
    s.survival.level=level;
    emit(s,'FoodDangerChanged',{level},({fed:'族群重新吃饱了。',strained:'大家开始饿了，采些食物带回家。',hungry:'缺粮拖慢了劳动与恢复，先到附近采食，再带回家。',famine:'同伴正在因饥饿失去生命，尽快带回食物。'})[level]);
  }
  if(s.survival.shortageSeconds>=12)s.survival.guideFood=true;
  if(c.egg){
    // Lack of food pauses incubation; already paid eggs and progress remain intact.
    if(average>=40&&fraction>=.999&&(!c.egg.automatic||c.breedingAllowed))c.egg.remaining=Math.max(0,c.egg.remaining-dt);
    if(c.egg.remaining<=0&&people.length<Math.min(c.capacity,c.populationLimit??10)){
      const child=spawn('a'+s.nextId++);child.juvenileUntil=s.time+JUVENILE_SECONDS;child.satiety=80;
      s.agents.push(child);c.egg=null;emit(s,'MemberBorn',{entityId:child.id},'幼体破壳了，食量是成年成员的一半，两分钟后加入劳动。');
    }
  }else if(hatchChoice(s,true).ok)startHatching(s,true);
}
