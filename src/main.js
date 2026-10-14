import { t as msg, tr, getLocale, onLocaleChange, refreshLocalizedLabels } from "./i18n.js";
import { planDeparture, planReturn, planMillennium, planNextEra } from './core/journey.js';
import './style.css';
import { FIXED_DT, NEST, LEGACY_SAVE_KEY, speciesStats } from './core/config.js';
import { serialize, deserialize, migrateLegacy } from './core/persistence.js';
import { WorldStore, newIdentity } from './core/persistence-v3.js';
import { createState, notify, nearbyContext } from './core/state.js';
import { step } from './core/simulation.js';
import * as actions from './core/actions.js';
import { startCreatureAction } from './core/creature-interactions.js';
import { directAction } from './core/direct-actions.js';
import { actionNotice } from './core/interaction-feedback.js';
import { createWorld } from './view/world.js';
import { mountUI } from './ui/interface.js';
import { startTrial, reinforceNest } from './core/chapter.js';
import { seaRoutes } from './core/sea-navigation.js';
import { createAgentClient } from './agent/client.js';
import { configureFood, plantSeeds } from './core/food.js';
import { configureHabitat, releaseYoung, edibleAmount } from './core/ecosystem.js';
import { terrainFor } from './core/terrain.js';
import { createGameAudio } from './audio/game-audio.js';

function refreshShell(){refreshLocalizedLabels(document);document.title=msg('种息 · 初生之岛');document.querySelector('meta[name="description"]').content=msg('操控小芽探索异星岛屿，进化身体，与同伴建立小小家园。');}
refreshShell();onLocaleChange(refreshShell);
function bootChoice(message,options){
  document.getElementById('loading-status').textContent=tr(message);
  const choices=document.createElement('div');choices.className='boot-options';document.getElementById('loading-status').after(choices);
  return new Promise(resolve=>{for(const [id,label] of options){const button=document.createElement('button');button.textContent=label;button.dataset.boot=id;button.onclick=()=>{choices.remove();resolve(id);};choices.append(button);}});
}
let store;
try{store=await WorldStore.open({resumeDocument:true});}catch{
  const choice=await bootChoice(msg("浏览器暂时无法打开旅程存储。请允许此站点保存数据后重试，或进入原版。"),[['retry',msg("重新加载")],['legacy',msg("进入原版")]]);
  if(choice==='legacy')location.href=`${tr(import.meta.env.BASE_URL)}legacy/`;else location.reload();
  await new Promise(()=>{});
}
const record=await store.latest();let state=record?await store.readVerified(record):null;
if(record&&!state){
  const recover=await store.recoverPrevious(record);
  const choice=await bootChoice(msg("这份旅程未能完整读取，原记录仍然保留。"),recover?[['recover',msg("恢复上一份检查点")],['new',msg("备份后重新启程")]]:[['new',msg("备份后重新启程")]]);
  await store.backup(record.raw,'unreadable');state=choice==='recover'?recover:createState();state.saveId=newIdentity();
}
if(!state){
  let legacy=null;try{legacy=localStorage.getItem(LEGACY_SAVE_KEY);}catch{}
  if(legacy){
    const choice=await bootChoice(msg("发现原版旅程。新版增加潮汐来客和初岛目标，升级前会保留原档。"),[['upgrade',msg("升级并继续")],['legacy',msg("继续原版")],['new',msg("开始新版旅程")]]);
    if(choice==='legacy'){location.href=`${tr(import.meta.env.BASE_URL)}legacy/`;await new Promise(()=>{});}
    if(choice==='upgrade'){await store.backup(legacy,'v2');state=migrateLegacy(legacy);if(!state){await bootChoice(msg("原存档暂时不能升级，请继续原版或导出备份。"),[['legacy',msg("继续原版")]]);location.href=`${tr(import.meta.env.BASE_URL)}legacy/`;await new Promise(()=>{});}}
  }
  state??=createState();state.saveId=newIdentity();
}
state.saveId??=record?.id||newIdentity();
try{await store.acquire(state.saveId);}catch{
  await bootChoice(msg("这份旅程正在另一个页面运行。关闭那个页面后可以重新加载。"),[['retry',msg("重新加载")]]);location.reload();await new Promise(()=>{});
}
document.getElementById('loading-status').textContent=state.journey.active?msg("正在靠近潮生岛…"):state.journey.era?msg("正在唤醒裂潮家园…"):msg("正在唤醒初生之岛…");
seaRoutes(state);
let world,ui,sound,agentClient,modal=false,manualPause=false,lostOwnership=false,replacingSave=false,last=performance.now(),acc=0,lastUI=0,lastSave=0,shownVictory=false;
let saveQueue=Promise.resolve(true),visibilityWork=Promise.resolve();
const keys=new Set();
function report(result){if(result&&!result.ok)notify(state,result.reason,'info');return result;}
function reportAction(result){if(result&&!result.ok)actionNotice(state,result.reason);return result;}
let saveStatus='✓ 已存档';onLocaleChange(()=>{const el=document.getElementById('save-status');if(el)el.textContent=msg(saveStatus);});
function storeSave(){
  if(replacingSave||lostOwnership)return Promise.resolve(false);
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    try{await store.save(state);saveStatus="✓ 已存档";document.getElementById('save-status').textContent=msg(saveStatus);return true;}
    catch{saveStatus="保存失败 · 请导出";document.getElementById('save-status').textContent=msg(saveStatus);return false;}
  });return saveQueue;
}
function home(){ui?.acknowledgeGuide('home');world?.focusPlayer();return directAction(state,{type:'home',entity:NEST});}
function pick(pick){
  if(!state.started||modal)return;
  const {type,entity,gesture='single'}=pick;
  if(gesture==='long'){ui.openTargetMenu({type,id:entity.id});return;}
  world?.focusPlayer();
  if(type==='home')reportAction(home());else reportAction(directAction(state,{type,entity}));
  ui.update(true);
}
function selectedAction(){
  const t=terrainFor(state),swim=speciesStats(state.parts).swim,p=state.player;
  const r=state.resources.filter(r=>r.kind==='food'&&edibleAmount(state,r)>=1).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z)).find(r=>t.findPath(p,r,swim,p.nav));
  if(r)pick({type:'resource',entity:r});else actionNotice(state,"附近暂时没有可采集的食物，沿海岸找找。");
}
function recomputePause(){state.paused=manualPause||modal||document.hidden||lostOwnership||replacingSave||!!state.journey?.transition;keys.clear();acc=0;last=performance.now();sound?.update();}
async function replaceGame(next){
  await storeSave();await store.backup(serialize(state),'before-replace');
  replacingSave=true;recomputePause();agentClient?.stop();
  next.provenance={sourceSaveId:next.saveId||null,importedAt:Date.now()};next.saveId=newIdentity();await store.release();await store.acquire(next.saveId);await store.save(next);location.reload();
}
async function travel(createCandidate,panel='journey'){
  if(replacingSave||lostOwnership)return false;
  const candidate=createCandidate();if(!candidate.ok){notify(state,candidate.reason,'info');ui?.update(true);return false;}
  ui?.close();replacingSave=true;recomputePause();agentClient?.stop();
  try{
    await saveQueue;
    const checked=deserialize(serialize(candidate.state));if(!checked)throw new Error("下一段旅程的记录没有通过校验。");
    await store.save(state);await store.save(checked);
    try{if(panel)sessionStorage.setItem('zhongxi-arrival-panel',panel);}catch{}
    location.reload();return true;
  }catch(error){
    replacingSave=false;recomputePause();agentClient=createAgentClient(state);void agentClient.start();
    notify(state,"旅程暂未切换，家园仍然保留。"+(error.message||"请重试或导出备份。"),'danger');ui?.update(true);return false;
  }
}
const callbacks={
  toggleAudio:()=>sound.toggle(),audioVolume:(key,value)=>sound.volume(key,value),audioSettings:()=>sound.settingsMarkup(),
  message:text=>notify(state,text),modal(value){modal=value;recomputePause();},
  save:storeSave,home,selectedAction,mapMove:p=>pick({type:'ground',entity:p}),
  guideExplore(){const point=[{id:'grove',x:-7,z:-17},{id:'ridge',x:22,z:-20},{id:'wetland',x:-20,z:12}].find(b=>!state.discovered.includes(b.id));if(point)pick({type:'ground',entity:point});},
  depart:(id,emergency=false)=>travel(()=>planDeparture(state,id,emergency)),returnExpedition:reason=>travel(()=>planReturn(state,reason)),
  configureFood:(key,value)=>configureFood(state,key,value),configureHabitat:(key,value)=>configureHabitat(state,key,value),releaseYoung:species=>releaseYoung(state,species),plantSeeds:()=>plantSeeds(state),
  startMillennium:()=>travel(()=>planMillennium(state),null),finishMillennium:()=>travel(()=>planNextEra(state),'chapter'),
  sample(index){const r=state.resources.find(x=>x.sampleIndex===index);if(r)pick({type:'resource',entity:r});},
  clearTarget(){state.selected=null;ui.update(true);},
  creatureAction(id,action){return startCreatureAction(state,id,action);},
  targetAction(target,action){
    if(target.type==='resource'){
      const entity=state.resources.find(r=>r.id===target.id);
      return entity&&action==='harvest'?reportAction(directAction(state,{type:'resource',entity})):{ok:false,reason:"资源已经离开了。"};
    }
    return reportAction(startCreatureAction(state,target.id,action));
  },
  interact(){const context=nearbyContext(state);return reportAction(context?context.type==='home'?home():directAction(state,context):actions.interact(state));},
  companionJob(job){return actions.commandCompanion(state,state.selected?.id,job);},
  pause(){manualPause=!manualPause;recomputePause();ui.update(true);},
  exportSave(){
    const url=URL.createObjectURL(new Blob([serialize(state)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=msg("种息-第{p0}代.json",{p0:tr(state.generation)});a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },
  async importSave(file){
    const feedback=text=>{document.getElementById('save-feedback').textContent=text;};
    if(file.size>2_000_000){feedback(msg("存档文件太大了。"));return;}
    const raw=await file.text(),next=deserialize(raw)||migrateLegacy(raw);
    if(!next){feedback(msg("这份存档无法读取，当前旅程没有改变。"));return;}
    try{await store.backup(raw,'import');await replaceGame(next);}catch{feedback(msg("保存未能完成，原旅程备份已保留。请导出后重新加载。"));}
  },
  async reset(){try{await replaceGame(createState());}catch{notify(state,"无法备份当前旅程，请先导出存档。",'danger');}},
  startTrial:()=>startTrial(state),reinforceNest:()=>reinforceNest(state),provisions:returning=>actions.provisions(state,returning),
};
for(const id of ['evolve','setAppearance','build','assignJob','hatch','rally'])callbacks[id]=(...args)=>actions[id](state,...args);
sound=createGameAudio(()=>state,()=>world?.actors.get('player')?.root.userData.movementMode,()=>({modal,manualPause,hidden:document.hidden,blocked:lostOwnership||replacingSave}));
ui=mountUI(state,callbacks);
try{
  world=await createWorld(document.getElementById('view'),state,{onPick:pick,onProgress:n=>{document.getElementById('loading-progress').style.width=`${tr(Math.round(n*100))}%`;},previewHost:ui.previewHost});
  if(!(await store.renew())){lostOwnership=true;recomputePause();notify(state,"这份旅程已由另一个页面接管，请重新加载。",'danger');}
  ui.attachWorld(world);document.getElementById('loading').hidden=true;
  if(!state.started)ui.open('welcome');
  try{const arrival=sessionStorage.getItem('zhongxi-arrival-panel');sessionStorage.removeItem('zhongxi-arrival-panel');if(arrival&&state.started&&!state.journey.transition){ui.open(arrival);shownVictory=true;if(arrival==='journey'&&!state.journey.active&&state.journey.history[0]?.reward)world.focusReward(state.journey.history[0].contractId);}}catch{}
  if(state.journey.transition){shownVictory=true;recomputePause();}
  agentClient=createAgentClient(state);if(!lostOwnership)void agentClient.start();void storeSave();
}catch(error){
  console.error(error);document.getElementById('loading-status').textContent=msg("场景没有成功加载。请刷新页面，并检查浏览器是否启用了硬件加速。");
  document.getElementById('loading').classList.add('failed');
  throw error;
}
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,select')||e.target.isContentEditable)return;
  if(state.journey.transition){if(e.code==='Escape'){e.preventDefault();state.journey.transition.progress=1;eraCommitTried=false;}return;}
  if(modal)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  if(e.code==='Space')callbacks.pause();
  if(e.code==='KeyE')callbacks.interact();
  if(e.code==='KeyH')reportAction(home());
  if(e.code==='KeyQ')report(actions.rally(state));
  if(e.code==='Digit6')ui.open('journey');
  if(e.code==='Digit1')ui.toggleHUD();
  if(e.code==='Digit2')ui.open('colony');
  if(e.code==='Digit3')ui.open('evolve');
  if(e.code==='Digit4')ui.open('journal');
  if(e.code==='Digit5')ui.open('chapter');
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{
  recomputePause();
  if(document.hidden){
    agentClient?.stop();
    visibilityWork=(async()=>{if(await storeSave()){await store.release();lostOwnership=true;}})();
  }else{
    void visibilityWork.then(async()=>{
      if(lostOwnership){location.reload();return;}
      agentClient=createAgentClient(state);void agentClient.start();recomputePause();
    });
  }
});
window.addEventListener('pagehide',storeSave);
setInterval(async()=>{if(!document.hidden&&!lostOwnership&&!replacingSave&&!(await store.renew())){lostOwnership=true;agentClient?.stop();recomputePause();notify(state,"这份旅程已由另一个页面接管，请重新加载。",'danger');}},3000);
function input(){
  const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  const right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const dir=world.cameraDirection();return {x:dir.x*forward-dir.z*right,z:dir.z*forward+dir.x*right,sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')};
}
let eraOverlay=null,eraCommitTried=false,returnTried=false,lastShot=-1;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function tickJourneyPresentation(dt){
  const transition=state.journey.transition;
  if(transition){
    if(!eraOverlay){
      eraOverlay=document.createElement('section');eraOverlay.className='era-overlay';eraOverlay.setAttribute('aria-label',msg("千年过场"));
      eraOverlay.innerHTML=`<span class="era-kicker">${msg("族群的故事仍在继续")}</span><h1 id="era-years">0 ${msg("年")}</h1><p id="era-caption"></p><button id="era-skip">${msg("跳过过场")}</button>`;document.body.append(eraOverlay);document.body.classList.add('cinematic');
      eraOverlay.querySelector('button').onclick=()=>{transition.progress=1;eraCommitTried=false;};
    }
    if(!document.hidden&&!lostOwnership&&!replacingSave)transition.progress=Math.min(1,transition.progress+dt/(reducedMotion?6:24));
    const p=transition.progress,shot=Math.min(4,Math.floor(p*5));
    document.getElementById('era-years').textContent=p>=1?msg("一千年后"):msg("{p0} 年",{p0:tr(Math.floor(p*1000))});
    document.getElementById('era-caption').textContent=[msg("族群在这里，留下了最初的家。"),msg("根系覆盖了旧路，生命沿着海岸生长。"),msg("岩层裂开，潮水走进了低地。"),msg("新的足迹，出现在风雨之后。"),msg("后裔仍在这片巢地，寻找新的远方。")][shot];
    const button=document.getElementById('era-skip');button.disabled=p<(reducedMotion?1/3:1/12);button.textContent=eraCommitTried&&!replacingSave?msg("重试进入后裔时代"):msg("跳过过场");
    world.cinematic?.(p,reducedMotion);
    if(shot!==lastShot){lastShot=shot;void storeSave();}
    if(p>=1&&!eraCommitTried){eraCommitTried=true;void callbacks.finishMillennium();}
  }
  if(state.journey.active?.returnReason&&!returnTried&&!replacingSave){returnTried=true;void callbacks.returnExpedition(state.journey.active.returnReason).then(ok=>{if(!ok)ui.open('journey');});}
}
let frames=0,measureStart=performance.now(),fps=0,lastChapterStage='';
function frame(now){
  const dt=Math.min(.1,(now-last)/1000);last=now;
  if(!state.paused&&state.started){acc+=dt*state.speed;const controls=input();let count=0;while(acc>=FIXED_DT&&count++<5){step(state,FIXED_DT,controls);acc-=FIXED_DT;}}
  if(!state.paused&&state.started)agentClient?.pump();
  if(state.chapter.status==='won'&&!shownVictory&&!state.journey.transition&&!state.journey.active){shownVictory=true;void storeSave();ui.open('chapter');}
  const stage=`${tr(state.chapter.trial?.id)}:${tr(state.chapter.trial?.status)}:${tr(state.chapter.trial?.reinforced)}:${tr(state.chapter.status)}`;
  if(stage!==lastChapterStage){lastChapterStage=stage;if(state.started)void storeSave();}
  world.tick(dt,now/1000);
  tickJourneyPresentation(dt);
  if(now-lastUI>160){ui.update();sound.update();lastUI=now;}
  if(now-lastSave>10000&&state.started){storeSave();lastSave=now;}
  frames++;if(now-measureStart>2000){fps=frames*1000/(now-measureStart);frames=0;measureStart=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Development diagnostics only: browser integration tests can inspect the same simulation.
if(import.meta.env.DEV||import.meta.env.VITE_PLAYTEST==='1')window.__game={state,world,ui,actions,callbacks,store,step,audio:sound,get agent(){return agentClient?.telemetry;},get stats(){return {fps,drawCalls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles};}};
