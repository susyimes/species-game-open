import { icon } from './icons.js';
import { EVOLUTIONS, APPEARANCES, SPECIES, BUILDINGS, BIOMES, NEST, speciesStats } from '../core/config.js';
import { evolutionChoice } from '../core/evolution.js';
import { population } from '../core/state.js';
import { dist } from '../core/math.js';

export const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const set=(id,text)=>{const el=document.getElementById(id);if(el&&el.textContent!==String(text))el.textContent=text;};
export const n=v=>Math.floor(v).toLocaleString('zh-CN');

export function createDialogs(state,callbacks,getWorld){
  const dialog=document.getElementById('game-dialog'),body=document.getElementById('dialog-body');
  let panel=null,candidate=null,family='legs',previousFocus=null;
  function close(){
    getWorld()?.showPreview(document.getElementById('portrait'));
    dialog.close();panel=null;candidate=null;callbacks.modal(false);previousFocus?.focus();
  }
  function open(which){
    if(!state.started&&which!=='welcome')return;
    if(panel)close();previousFocus=document.activeElement;panel=which;callbacks.modal(true);
    document.getElementById('dialog-close').hidden=which==='welcome';
    const headings={evolve:['生命的下一种可能','进化小芽'],colony:['一点一点，把这里变成家','营造家园'],journal:['每一步，都留下生命的痕迹','岛屿见闻'],help:['初生之岛 · 操作手册','慢慢探索，自在生长'],welcome:['WELCOME TO THE LIVING ISLE','从一颗小芽开始。']};
    set('dialog-kicker',headings[which][0]);set('dialog-title',headings[which][1]);dialog.className='dialog-'+which;render();dialog.showModal();
    if(which==='evolve')getWorld()?.showPreview(document.getElementById('evolution-preview'),evolutionChoice(state,candidate).parts);
  }
  function render(){
    if(panel==='welcome'){
      body.innerHTML=`<p class="welcome-lead">探索一座生机盎然的岛屿。<br>长出新的模样，和同伴一起安家。</p><div class="welcome-steps"><div>${icon('compass')}<strong>走向世界</strong><p>点击地面移动<br>点击浆果丛采集</p></div><div>${icon('dna')}<strong>慢慢进化</strong><p>发现远古孢子<br>为身体长出新部件</p></div><div>${icon('nest')}<strong>一起生活</strong><p>带着收获回家<br>营造、孵育、分工</p></div></div><button id="start-button" class="primary-button">开始这段旅程 ${icon('arrow')}</button><p class="fine-print">进度保存在这台设备上，离开时世界会暂停。</p>`;
    }else if(panel==='evolve'){
      candidate||=EVOLUTIONS.find(e=>!e.parent&&!state.parts.includes(e.id))?.id||'legs';
      const selected=EVOLUTIONS.find(e=>e.id===candidate);family=selected.parent||selected.id;
      body.innerHTML=`<div class="evolution-layout"><div class="evolution-stage"><div class="evolution-stage-label"><span>小芽 · 身体预览</span><span id="evo-generation">第 ${state.generation} 代</span></div><div id="evolution-preview"></div><p>六种基础适应，十二种专精。每一代都能有新模样。</p><div class="evolution-stats" id="evolution-stats"></div><div class="appearance-picker"><span>族群体色</span><div>${APPEARANCES.map(a=>`<button data-appearance="${a.id}" style="--swatch:${a.color}" aria-label="体色：${a.name}" title="${a.name}"></button>`).join('')}</div></div></div><div class="evolution-options"><div class="evolution-intro"><span>选择你的进化方向</span><b>${icon('dna')} <span id="evo-dna">${n(state.colony.dna)}</span></b></div><nav class="evo-family-nav" aria-label="进化方向">${EVOLUTIONS.filter(e=>!e.parent).map(e=>`<button data-evo-category="${e.id}">${icon(e.icon)} ${e.category}</button>`).join('')}</nav><div class="evolution-grid" id="evolution-tree"></div><div class="evolution-detail"><h3 id="evo-name"></h3><p id="evo-description"></p><strong id="evo-effect"></strong><p class="branch-note" id="evo-branch-note"></p></div><button id="evolve-confirm" class="primary-button"></button><p class="fine-print" id="evo-hint"></p></div></div>`;
      renderTree();
      updateEvolution();
    }else if(panel==='colony'){
      body.innerHTML=`<div class="colony-modal-overview"><div>${icon('paw')}<strong id="modal-population"></strong><span>族群成员</span></div><div>${icon('leaf')}<strong id="modal-food"></strong><span>储存食物</span></div><div>${icon('stone')}<strong id="modal-material"></strong><span>储存材料</span></div></div><div class="building-grid">${BUILDINGS.map(b=>`<article class="building-card"><div class="building-illustration ${b.id}">${icon(b.icon)}<span>${b.id==='nest'?'01':b.id==='garden'?'02':'03'}</span></div><div class="building-copy"><h3>${b.name}<small id="built-${b.id}"></small></h3><p>${b.description}</p><strong>${b.effect}</strong><div class="building-cost">${icon('leaf')} ${b.cost.food} <span></span>${icon('stone')} ${b.cost.material}</div><button class="secondary-button" data-build="${b.id}">开始营造 ${icon('plus')}</button></div></article>`).join('')}</div><div class="hatch-panel"><span class="egg-drawing">${icon('nest')}</span><div><h3>迎接新的同伴</h3><p id="hatch-status"></p></div><button id="hatch-button" class="primary-button">孵育 · 18 食物</button></div><p class="fine-print">营造会消耗巢中的资源。营造同伴走到工地后开始施工，空闲时会协助采集。</p>`;
      updateColony();
    }else if(panel==='journal'){
      body.innerHTML=`<div class="journal-biomes">${BIOMES.map(b=>`<div class="biome-entry ${state.discovered.includes(b.id)?'discovered':''}"><span style="--biome:${b.color}">${icon(state.discovered.includes(b.id)?'leaf':'compass')}</span><h3>${state.discovered.includes(b.id)?b.name:'尚未踏足'}</h3><p>${state.discovered.includes(b.id)?b.description:'向着岛屿更远的地方探索。'}</p></div>`).join('')}</div><h3 class="journal-heading">岛上的邻居</h3><div class="wildlife-guide">${Object.values(SPECIES).map(sp=>`<article><span>${icon(sp.fly?'leaf':sp.swim?'water':sp.kind==='predator'?'horn':'shield')}</span><div><h3>${state.discovered.includes(sp.biome)?sp.name:'未知的足迹'}</h3><p>${state.discovered.includes(sp.biome)?sp.description:'探索新的栖息地，认识不同的生命。'}</p></div></article>`).join('')}</div><h3 class="journal-heading">旅途中的小事</h3><ol class="journal-entries">${state.journal.map(e=>`<li><span>${Math.floor(e.time/60)} 分</span><p>${safe(e.text)}</p></li>`).join('')}</ol>`;
    }else if(panel==='help'){
      body.innerHTML=`<div class="help-grid"><div><h3>跟着小芽探索</h3><p><kbd>W A S D</kbd> / 方向键 移动</p><p><kbd>Shift</kbd> 持续奔跑 · 消耗体力</p><p><kbd>E</kbd> 采集 / 攻击附近目标</p><p><kbd>Q</kbd> 召唤守卫跟随一会儿</p><p><kbd>H</kbd> 沿路返回巢穴</p><p><kbd>空格</kbd> 暂停 / 继续</p><p>点击地面前往，右键拖动旋转视角。</p></div><div><h3>让家园慢慢长大</h3><p>靠近巢穴会自动存放资源、恢复生命。</p><p>采集同伴寻找资源并带回。营造同伴优先施工，守卫保护附近同伴。</p><p>探索和完成旅程能获得进化点；回到巢边才能进化。</p><p>食物随族群规模持续消耗，浆果圃提供稳定补给。</p><p>切换窗口或打开面板时，世界暂停。</p></div></div><div class="save-actions"><button id="export-save" class="secondary-button">${icon('save')} 导出旅程</button><button id="import-save-button" class="secondary-button">导入旅程</button><input id="import-save" type="file" accept="application/json,.json" hidden><button id="reset-button" class="text-button danger-text">重新启程</button></div><p id="save-feedback" class="fine-print">存档留在本机浏览器中。旧版种息的存档保持独立。</p>`;
    }
  }
  function renderTree(){
    document.getElementById('evolution-tree').innerHTML=EVOLUTIONS.filter(e=>e.id===family||e.parent===family).map(e=>{
      const choice=evolutionChoice(state,e.id),locked=e.parent&&!state.parts.includes(e.parent)||e.biome&&!state.discovered.includes(e.biome);
      return `<button class="evolution-option ${!e.parent?'evolution-root':''} ${locked?'locked':''}" data-evolution="${e.id}"><span class="part-icon">${icon(e.icon)}</span><span><strong>${e.name}</strong><small>${!e.parent?'基础适应':locked?'探索 / 前置解锁':e.category+'专精'}</small></span><b data-part-cost="${e.id}">${choice.owned?icon('check'):choice.cost}</b></button>`;
    }).join('');
    document.querySelectorAll('[data-evo-category]').forEach(el=>{el.classList.toggle('active',el.dataset.evoCategory===family);el.setAttribute('aria-pressed',String(el.dataset.evoCategory===family));});
  }
  function updateEvolution(){
    const choice=evolutionChoice(state,candidate),e=choice.part;if(!e)return;
    const {owned,parts}=choice,near=dist(state.player,NEST)<5;
    set('evo-name',e.name);set('evo-description',e.description);set('evo-effect',e.effect);set('evo-dna',n(state.colony.dna));
    set('evo-generation',`第 ${state.generation} 代`);
    set('evolve-confirm',owned?'已拥有这个部件':`${choice.replaced?'替换专精':'进化'} · ${choice.cost} 进化点`);document.getElementById('evolve-confirm').disabled=!choice.ok;
    set('evo-hint',choice.reason||'新部件会立即改变外形与能力。');
    set('evo-branch-note',choice.replaced?`替换「${choice.replaced.name}」，回收 ${choice.refund} 点；本次净消耗 ${choice.cost} 点。`:e.parent?'同一方向选择一种专精。以后可替换，回收旧专精的一半进化点。':'长出这个基础部件后，可继续选择两种不同的专精。');
    document.querySelectorAll('[data-evolution]').forEach(el=>{el.classList.toggle('selected',el.dataset.evolution===candidate);el.setAttribute('aria-pressed',String(el.dataset.evolution===candidate));});
    for(const id of state.parts){const cost=document.querySelector(`[data-part-cost="${id}"]`);if(cost)cost.innerHTML=icon('check');}
    const stats=speciesStats(parts),before=speciesStats(state.parts);
    document.getElementById('evolution-stats').innerHTML=`<span>速度 <b>${stats.speed.toFixed(1)}</b><small>${before.speed.toFixed(1)} →</small></span><span>防护 <b>${Math.round(stats.armor*100)}%</b><small>${Math.round(before.armor*100)}% →</small></span><span>攻击 <b>${stats.attack.toFixed(0)}</b><small>${before.attack.toFixed(0)} →</small></span><span>背包 <b>${stats.carry}</b><small>${before.carry} →</small></span>`;
    document.querySelectorAll('[data-appearance]').forEach(el=>{el.setAttribute('aria-pressed',String(el.dataset.appearance===state.appearance));el.disabled=!near;});
    getWorld()?.previewParts(parts);
  }
  function updateColony(){
    set('modal-population',`${population(state)} / ${state.colony.capacity}`);set('modal-food',n(state.colony.food));set('modal-material',n(state.colony.material));
    const inProgress=state.buildings.some(b=>b.progress<1);
    for(const b of BUILDINGS){
      const count=state.buildings.filter(x=>x.kind===b.id).length;set('built-'+b.id,`${count} / ${b.max}`);
      const button=document.querySelector(`[data-build="${b.id}"]`);button.disabled=inProgress||count>=b.max||state.colony.food<b.cost.food||state.colony.material<b.cost.material;
      button.innerHTML=inProgress?'工程进行中':count>=b.max?'已达上限':`开始营造 ${icon('plus')}`;
    }
    const egg=state.colony.egg;
    set('hatch-status',egg?`卵正在孵育，还需要 ${Math.ceil(egg.remaining)} 秒。`:population(state)>=state.colony.capacity?'巢穴住满了，营造育幼巢可以增加 4 个位置。':'一枚卵，一种新的可能。孵育需要 18 食物和一个空位。');
    document.getElementById('hatch-button').disabled=!!egg||population(state)>=state.colony.capacity||state.colony.food<18;
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(panel!=='welcome')close();});
  dialog.addEventListener('click',e=>{if(e.target===dialog&&panel!=='welcome'){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  return {open,close,render,update(){if(panel==='colony')updateColony();},select(id){candidate=id;updateEvolution();},category(id){family=id;candidate=id;renderTree();updateEvolution();},evolutionUpdated(){renderTree();updateEvolution();},get panel(){return panel;},get candidate(){return candidate;}};
}
