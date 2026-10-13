export const SATIETY_SECONDS=240;
export const JUVENILE_SECONDS=120;
export const AUTO_BIRTH_INTERVAL=120;
export const CRISIS_ENTER=.15;
export const CRISIS_EXIT=.30;
export const NATIVE_COUNTS={
  home:{mossback:5,reedbeak:4,emberfang:3,glowbug:4},
  expedition:{resinshell:3,fernback:2,spearbeak:4,riftstalker:2,stonehorn:1,spinedillo:1,stormlantern:2,moonray:2,tideblade:1,mireclaw:1},
  rift:{resinshell:5,spearbeak:4,riftstalker:2,stonehorn:2,stormlantern:4,tideblade:2},
};
export const isJuvenile=(s,a)=>a.juvenileUntil>s.time;
export const isResident=a=>['grazer','predator'].includes(a.kind)&&!a.dominated&&!['marine','event'].includes(a.origin);
export function initFood(s){
  const c=s.colony;
  c.foodPolicy??='normal';c.breedingAllowed??=true;c.populationLimit??=10;
  c.nextAutoHatchAt??=s.time+AUTO_BIRTH_INTERVAL;c.seedStock??=0;c.soilLevel??=0;c.nursery??={};
  s.survival??={version:1,shortageSeconds:0,level:'fed',foodSpent:0,energyFoodSpent:0,guideFood:false,guideEcology:false};
  for(const a of [s.player,...s.agents]){a.satiety??=100;a.juvenileUntil??=0;}
}
export function initHabitat(s,reset=false){
  if(!reset&&s.habitatHealth)return;
  s.habitatHealth={version:1,baseline:{...NATIVE_COUNTS[s.mapId||'home']},breeding:{},critical:false,stress:0,recovery:0,level:'healthy',
    extinct:[],protected:[],reserveFruit:false,immigrationAt:s.time+300,incoming:null};
}
