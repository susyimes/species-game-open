import './style.css';
import { FIXED_DT, NEST, SAVE_KEY } from './core/config.js';
import { load, save, serialize, deserialize } from './core/persistence.js';
import { createState, notify } from './core/state.js';
import { step } from './core/simulation.js';
import * as actions from './core/actions.js';
import { startCreatureAction, showWildGestureHint } from './core/creature-interactions.js';
import { createWorld } from './view/world.js';
import { mountUI } from './ui/interface.js';

const loaded=load(),state=loaded.state;
if(loaded.invalidRaw){try{localStorage.setItem(SAVE_KEY+'-unreadable-'+Date.now(),loaded.invalidRaw);}catch{}}
let world,ui,modal=false,manualPause=false,replacingSave=false,last=performance.now(),acc=0,lastUI=0,lastSave=0;
const keys=new Set();
function report(result){if(result&&!result.ok)notify(state,result.reason,'info');return result;}
function storeSave(){if(replacingSave)return true;const ok=save(state);document.getElementById('save-status').textContent=ok?'✓ 已存档':'存档空间不足';return ok;}
function home(){world?.focusPlayer();return actions.moveTo(state,NEST);}
function pick(pick){
  if(!state.started||modal)return;
  const {type,entity,gesture='single'}=pick;
  if(type==='ground'){state.selected=null;actions.stopPlayer(state);report(actions.moveTo(state,entity));}
  else if(type==='home'){state.selected=null;report(home());}
  else {
    state.selected=entity;
    if(type==='resource')report(actions.interact(state,{type,entity}));
    if(type==='enemy'){showWildGestureHint(state);if(gesture==='double')report(startCreatureAction(state,entity.id,'hunt'));}
    if(gesture==='long'&&(type==='enemy'||type==='companion'))ui.openCreatureMenu(entity);
  }
  ui.update(true);
}
function selectedAction(){
  const r=state.selected||state.resources.find(r=>r.kind==='food'&&r.amount>=1);
  if(!r)return;
  if(r.kind==='companion'||r.kind==='grazer'||r.kind==='predator')return;
  if(state.player.target?.id===r.id){actions.stopPlayer(state);ui.update(true);return;}
  pick({type:'resource',entity:r});
}
function recomputePause(){state.paused=manualPause||modal||document.hidden;keys.clear();acc=0;last=performance.now();}
const callbacks={
  message:text=>notify(state,text),modal(value){modal=value;recomputePause();},
  save:storeSave,home,selectedAction,mapMove:p=>pick({type:'ground',entity:p}),
  clearTarget(){state.selected=null;ui.update(true);},
  creatureAction(id,action){return startCreatureAction(state,id,action);},
  companionJob(job){return actions.commandCompanion(state,state.selected?.id,job);},
  pause(){manualPause=!manualPause;recomputePause();ui.update(true);},
  exportSave(){
    const url=URL.createObjectURL(new Blob([serialize(state)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download=`种息-第${state.generation}代.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  },
  async importSave(file){
    const feedback=text=>{document.getElementById('save-feedback').textContent=text;};
    if(file.size>2_000_000){feedback('存档文件太大了。');return;}
    const raw=await file.text(),next=deserialize(raw);
    if(!next){feedback('这份存档无法读取，当前旅程没有改变。');return;}
    try{localStorage.setItem(SAVE_KEY+'-backup',serialize(state));localStorage.setItem(SAVE_KEY,serialize(next));replacingSave=true;location.reload();}catch{feedback('没有足够的存档空间，当前旅程没有改变。');}
  },
  reset(){try{localStorage.setItem(SAVE_KEY+'-backup',serialize(state));localStorage.setItem(SAVE_KEY,serialize(createState()));replacingSave=true;location.reload();}catch{notify(state,'无法备份当前旅程，请先导出存档。','danger');}},
};
for(const id of ['evolve','setAppearance','build','assignJob','hatch','rally','interact'])callbacks[id]=(...args)=>actions[id](state,...args);
ui=mountUI(state,callbacks);
try{
  world=await createWorld(document.getElementById('view'),state,{onPick:pick,onProgress:n=>{document.getElementById('loading-progress').style.width=`${Math.round(n*100)}%`;},previewHost:ui.previewHost});
  ui.attachWorld(world);document.getElementById('loading').hidden=true;
  if(!state.started)ui.open('welcome');
}catch(error){
  console.error(error);document.getElementById('loading-status').textContent='场景没有成功加载。请刷新页面，并检查浏览器是否启用了硬件加速。';
  document.getElementById('loading').classList.add('failed');
  throw error;
}
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,select')||e.target.isContentEditable)return;
  if(modal)return;
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  keys.add(e.code);if(e.repeat)return;
  if(e.code==='Space')callbacks.pause();
  if(e.code==='KeyE')report(actions.interact(state));
  if(e.code==='KeyH')report(home());
  if(e.code==='KeyQ')report(actions.rally(state));
  if(e.code==='Digit1'){ui.close();world.focusPlayer();}
  if(e.code==='Digit2')ui.open('colony');
  if(e.code==='Digit3')ui.open('evolve');
  if(e.code==='Digit4')ui.open('journal');
});
document.addEventListener('keyup',e=>keys.delete(e.code));
window.addEventListener('blur',()=>keys.clear());
document.addEventListener('visibilitychange',()=>{recomputePause();if(document.hidden)storeSave();});
window.addEventListener('pagehide',storeSave);
function input(){
  const forward=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
  const right=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
  const dir=world.cameraDirection();return {x:dir.x*forward-dir.z*right,z:dir.z*forward+dir.x*right,sprint:keys.has('ShiftLeft')||keys.has('ShiftRight')};
}
let frames=0,measureStart=performance.now(),fps=0;
function frame(now){
  const dt=Math.min(.1,(now-last)/1000);last=now;
  if(!state.paused&&state.started){acc+=dt*state.speed;const controls=input();let count=0;while(acc>=FIXED_DT&&count++<5){step(state,FIXED_DT,controls);acc-=FIXED_DT;}}
  world.tick(dt,now/1000);
  if(now-lastUI>160){ui.update();lastUI=now;}
  if(now-lastSave>10000&&state.started){storeSave();lastSave=now;}
  frames++;if(now-measureStart>2000){fps=frames*1000/(now-measureStart);frames=0;measureStart=now;}
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Development diagnostics only: browser integration tests can inspect the same simulation.
if(import.meta.env.DEV)window.__game={state,world,ui,actions,step,get stats(){return {fps,drawCalls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles};}};
