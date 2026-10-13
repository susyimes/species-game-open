export const CONTRACTS = [
  {id:'glowflower',name:'把星光带回家',sample:'富能花蜜',reward:'荧光花园',description:'优先解决缺粮。调查三簇荧光花，每处花蜜正常带回后提供 8 食物；途中也能采集普通食物提前返航。',event:'squall'},
  {id:'tidespore',name:'潮水里的旧记忆',sample:'归乡卵囊',reward:'潮纹菌石',description:'恢复野生种群。三处卵囊各带回一对，优先寻找家园稀缺的原生物种；留意石脊的猎群。',event:'migration'},
  {id:'saltseed',name:'新岸上的种子',sample:'盐生种荚',reward:'苇叶水庭',description:'改善长期供给。每处样本带回 1 份种苗，回家补种果圃，每轮增加每块 0.75 食物 / 分，最多三轮。',event:'squall'},
];
export const STYLES = [
  {id:'balanced',name:'均衡',skill:'蓄势',description:'保留当前适应，熟悉自己的身体。'},
  {id:'hunter',name:'追猎',skill:'疾扑',description:'移速 +10%、攻击 +15%，耗粮 +12%、体力恢复 -10%。长角与储能尾增大的身体也需要更多食物。'},
  {id:'guardian',name:'守护',skill:'护群',description:'额外减伤 12%、耗粮 -15%、移速 -8%，限量供食时恢复损失较少。护群短暂保护附近同伴。'},
  {id:'tidal',name:'潮行',skill:'顺流',description:'需潮汐侧鳍。游泳速度 +25%、采集 +15%；顺流持续 6 秒。'},
];
export function newJourney(){return {version:1,era:0,serial:0,successes:0,eraSuccesses:0,eraContracts:[],rewards:[],pending:{food:0,material:0},history:[],active:null,home:null,transition:null,firstVictory:null,totalAwayTime:0};}
export const activeExpedition=s=>s.mapId==='expedition'&&!!s.journey?.active;
export function livedSeconds(s){return s.time+(s.journey?.active?s.journey.home?.time||0:0)+(s.lifetimeAwaySeconds??s.journey?.totalAwayTime??0);}
export function styleChoice(s,id){
  if(id!=='balanced')return {ok:false,reason:'只保留身体进化。'};
  if(!STYLES.some(x=>x.id===id))return {ok:false,reason:'未知的流派。'};
  if(id!=='balanced'&&!s.parts.length)return {ok:false,reason:'完成第一次进化后，选择适合自己的流派。'};
  if(id==='tidal'&&!s.parts.includes('fins'))return {ok:false,reason:'先长出潮汐侧鳍，再选择潮行。'};
  if(s.time-(s.player.hitAt??-100)<6||s.time-(s.player.attackAt??-100)<6||s.player.recoverUntil>s.time)return {ok:false,reason:'脱离战斗 6 秒后，可以调整流派。'};
  return {ok:true};
}
export function setStyle(s,id){
  const result=styleChoice(s,id);if(!result.ok)return result;
  s.style=id;s.player.skill=null;return {ok:true};
}
// Keep import compatibility for old snapshots and tools; retired skills have no effects.
export function useSkill(){return {ok:false,reason:'只保留身体进化。'};}
export function skillActive(){return false;}
