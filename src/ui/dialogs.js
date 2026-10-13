import { journeyMarkup } from './journey.js';
import { mapBiomes } from '../core/maps.js';
import { icon } from './icons.js';
import { EVOLUTIONS, APPEARANCES, SPECIES, BUILDINGS, BIOMES, speciesStats } from '../core/config.js';
import { evolutionChoice } from '../core/evolution.js';
import { population } from '../core/state.js';
import { habitatStage } from '../core/habitat.js';
import { chapterMarkup, weatherMarkup } from './chapter.js';
import { populationManagement, survivalMarkup } from './survival.js';
import { hatchChoice } from '../core/food.js';

export const safe=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const set=(id,text)=>{const el=document.getElementById(id);if(el&&el.textContent!==String(text))el.textContent=text;};
export const n=v=>Math.floor(v).toLocaleString('zh-CN');

export function createDialogs(state,callbacks,getWorld){
  const BIOMES=mapBiomes(state);
  const dialog=document.getElementById('game-dialog'),body=document.getElementById('dialog-body');
  let panel=null,candidate=null,family='legs',previousFocus=null;
  function close(){
    if(['colony','survival'].includes(panel)&&state.survival?.guideFood&&!state.hints?.foodActionsSeen){state.hints??={};state.hints.foodActionsSeen=true;callbacks.save();}
    getWorld()?.showPreview(document.getElementById('portrait'));
    dialog.close();panel=null;candidate=null;callbacks.modal(false);previousFocus?.focus();
  }
  function open(which){
    if(which==='colony'&&state.journey?.active)which='journey';
    if(!state.started&&which!=='welcome')return;
    if(panel)close();previousFocus=document.activeElement;panel=which;callbacks.modal(true);
    document.getElementById('dialog-close').hidden=which==='welcome';
    const headings={evolve:['生命的下一种可能','进化小芽'],colony:['一点一点，把这里变成家','营造家园'],journal:['每一步，都留下生命的痕迹','岛屿见闻'],help:['初生之岛 · 操作手册','慢慢探索，自在生长'],welcome:['WELCOME TO THE LIVING ISLE','从一颗小芽开始。']};
    headings.chapter=['家园与远方，都留下族群的故事',state.chapter.id==='second_island'?'风潮立足':state.chapter.status==='won'?'初岛安居 · 已达成':'初岛安居'];
    headings.journey=['带着发现，回到自己的家园',state.journey.active?'潮生岛远征':'家园与远征'];
    headings.weather=['安排下一段远行','天气与潮水'];
    headings.survival=['认识岛上的邻居','岛屿生态'];
    set('dialog-kicker',headings[which][0]);set('dialog-title',headings[which][1]);dialog.className='dialog-'+which;render();dialog.showModal();
    if(which==='evolve')getWorld()?.showPreview(document.getElementById('evolution-preview'),evolutionChoice(state,candidate).parts);
  }
  function render(){
    if(panel==='survival'){body.innerHTML=survivalMarkup(state);return;}
    if(panel==='chapter'){body.innerHTML=chapterMarkup(state);return;}
    if(panel==='journey'){body.innerHTML=journeyMarkup(state);return;}
    if(panel==='weather'){body.innerHTML=weatherMarkup(state);return;}
    if(panel==='welcome'){
      body.innerHTML=`<p class="welcome-lead">点一丛浆果，让小芽走过去采集。</p><p class="welcome-short">先带一点食物回家，其余的慢慢来。</p><button id="start-button" class="primary-button">开始探索 ${icon('arrow')}</button><p class="fine-print">进度保存在这台设备上，离开时世界会暂停。</p>`;

    }else if(panel==='evolve'){
      candidate||=EVOLUTIONS.find(e=>!e.parent&&!state.parts.includes(e.id))?.id||'legs';
      const selected=EVOLUTIONS.find(e=>e.id===candidate);family=selected.parent||selected.id;
      body.innerHTML=`<div class="evolution-layout"><div class="evolution-stage"><div class="evolution-stage-label"><span>小芽 · 身体预览</span><span id="evo-generation">第 ${state.generation} 代</span></div><div id="evolution-preview"></div><p>选择一种适应，让小芽更擅长探索。</p><div class="evolution-stats" id="evolution-stats"></div><div class="appearance-picker"><span>族群体色 · <b id="appearance-name"></b></span><div>${APPEARANCES.map(a=>`<button data-appearance="${a.id}" style="--swatch:${a.color}" aria-label="体色：${a.name}" title="${a.name}"></button>`).join('')}</div></div><p class="fine-print appearance-help">四种体色随时免费切换，族群一起换上新模样。</p></div><div class="evolution-options"><div class="evolution-intro"><span>选择你的进化方向</span><b>${icon('dna')} <span id="evo-dna">${n(state.colony.dna)}</span></b></div><nav class="evo-family-nav" aria-label="进化方向">${EVOLUTIONS.filter(e=>!e.parent).map(e=>`<button data-evo-category="${e.id}">${icon(e.icon)} ${e.category}</button>`).join('')}</nav><div class="evolution-grid" id="evolution-tree"></div><div class="evolution-detail"><h3 id="evo-name"></h3><p id="evo-description"></p><strong id="evo-effect"></strong><p class="branch-note" id="evo-branch-note"></p></div><button id="evolve-confirm" class="primary-button"></button><p class="fine-print" id="evo-hint"></p></div></div>`;
      renderTree();
      updateEvolution();
    }else if(panel==='colony'){
      body.innerHTML=`<div class="habitat-growth"><span class="habitat-growth-emblem">${icon('nest')}</span><div><strong id="habitat-name"></strong><p id="habitat-growth-hint"></p></div><span id="habitat-level"></span></div><div class="colony-modal-overview"><div>${icon('paw')}<strong id="modal-population"></strong><span>族群成员</span></div><div>${icon('leaf')}<strong id="modal-food"></strong><span>储存食物</span></div><div>${icon('stone')}<strong id="modal-material"></strong><span>储存材料</span></div></div><div class="building-grid">${[...BUILDINGS].sort((a,b)=>(b.id==='garden')-(a.id==='garden')).map(b=>`<article class="building-card" ${b.id!=='garden'&&!state.completed.includes('build')&&!state.metrics.built&&!state.journey.era&&!state.journey.active?'hidden':''}><div class="building-illustration ${b.id}">${icon(b.icon)}<span>${b.id==='nest'?'01':b.id==='garden'?'02':'03'}</span></div><div class="building-copy"><h3>${b.name}<small id="built-${b.id}"></small></h3><p>${b.description}</p><strong>${b.effect}</strong><div class="building-cost">${icon('leaf')} ${b.cost.food} <span></span>${icon('stone')} ${b.cost.material}</div><button class="secondary-button" data-build="${b.id}">开始营造 ${icon('plus')}</button></div></article>`).join('')}</div><div class="hatch-panel" ${!state.completed.includes('explore')&&!state.colony.egg&&state.metrics.population<=6&&!state.journey.era?'hidden':''}><span class="egg-drawing">${icon('nest')}</span><div><h3>迎接新的同伴</h3><p id="hatch-status"></p></div><button id="hatch-button" class="primary-button">孵育 · 18 食物</button></div><p class="fine-print">营造会消耗巢中的资源。营造同伴走到工地后开始施工，空闲时会协助采集。</p>`;
      body.insertAdjacentHTML('beforeend',populationManagement(state));updateColony();
    }else if(panel==='journal'){
      body.innerHTML=`<div class="journal-biomes">${BIOMES.map(b=>`<div class="biome-entry ${state.discovered.includes(b.id)?'discovered':''}"><span style="--biome:${b.color}">${icon(state.discovered.includes(b.id)?'leaf':'compass')}</span><h3>${state.discovered.includes(b.id)?b.name:'尚未踏足'}</h3><p>${state.discovered.includes(b.id)?b.description:'向着岛屿更远的地方探索。'}</p></div>`).join('')}</div><h3 class="journal-heading">岛上的邻居</h3><div class="wildlife-guide">${Object.entries(SPECIES).filter(([id])=>state.mapId==='home'?['mossback','reedbeak','emberfang','glowbug','tideback','reefjaw'].includes(id)||state.agents.some(a=>a.dominated&&a.species===id):[...Object.keys(state.habitatHealth?.baseline||{}),...state.agents.map(a=>a.species)].includes(id)).map(([,sp])=>`<article><span>${icon(sp.fly?'leaf':sp.swim?'water':sp.kind==='predator'?'horn':'shield')}</span><div><h3>${state.discovered.includes(sp.biome)?sp.name:'未知的足迹'}</h3><p>${state.discovered.includes(sp.biome)?sp.description:'探索新的栖息地，认识不同的生命。'}</p></div></article>`).join('')}</div>${state.journey.firstVictory?`<section class="journey-gallery"><h3>祖岛往事 · 初岛安居</h3><p>千年前，族群在这里建起了最初的家。安居记录保留于第 ${Math.floor((state.journey.firstVictory.elapsedTicks??state.journey.firstVictory.tick)/20/60)} 分钟。</p><p>后裔保留了进化、家园与远征带回的发现。</p></section>`:''}<h3 class="journal-heading">旅途中的小事</h3><ol class="journal-entries">${state.journal.map(e=>`<li><span>${Math.floor(e.time/60)} 分</span><p>${safe(e.text)}</p></li>`).join('')}</ol>`;
    }else if(panel==='help'){
      body.innerHTML=`<div class="help-grid"><div><h3>跟着小芽探索</h3><p><kbd>W A S D</kbd> / 方向键 移动</p><p><kbd>Shift</kbd> 持续奔跑 · 消耗体力</p><p><kbd>E</kbd> 执行附近的采集 / 捕食</p><p>长按资源或生物 0.55 秒，查看详情和选项。</p><p><kbd>Q</kbd> 召唤守卫跟随一会儿</p><p><kbd>6</kbd> 远征菜单</p><p><kbd>H</kbd> 沿路返回巢穴</p><p><kbd>空格</kbd> 暂停 / 继续</p><p>单击野生生物捕食，击倒后接着拾取；Shift 奔跑可甩开追击。</p><p>点击地面前往，右键拖动旋转视角。长出潮汐侧鳍后，也可以点击近海游过去，再按 H 游回家。</p><p>面板默认隐藏。点“展开面板 / 收起面板”或按 1 切换，打开后会保持显示。首次备齐资源时，相关按钮会亮起；点击或略过后不再重复提示。</p></div><div><h3>让家园慢慢长大</h3><p>靠近巢穴会自动存放资源、恢复生命。</p><p>采集同伴寻找资源并带回。营造同伴优先施工，守卫保护附近同伴。</p><p>探索和完成旅程能获得进化点；随处可进化、免费换体色。进化保留当前伤势和体力比例。</p><p>同伴会自动取食。采集和浆果圃补充家园库存，不需要管理供食。</p><p>夜间猎食者警戒更远；雨后湿地泥泞，巢边可避风。</p><p>同伴死亡会永久离开，人口减少。只有小芽重伤后能回家恢复。切换窗口或打开菜单时，世界暂停。</p></div></div>${callbacks.audioSettings?.()||''}<div class="save-actions"><button id="export-save" class="secondary-button">${icon('save')} 导出旅程</button><button id="import-save-button" class="secondary-button">导入旅程</button><input id="import-save" type="file" accept="application/json,.json" hidden><button id="reset-button" class="text-button danger-text">重新启程</button></div><p id="save-feedback" class="fine-print">存档留在本机浏览器中。旧版种息的存档保持独立。</p>`;
    }
  }
  function renderTree(){
    document.getElementById('evolution-tree').innerHTML=EVOLUTIONS.filter(e=>e.id===family||e.parent===family&&state.parts.includes(family)).map(e=>{
      const choice=evolutionChoice(state,e.id),locked=e.parent&&!state.parts.includes(e.parent)||e.biome&&!state.discovered.includes(e.biome)&&!state.journey?.knowledge?.includes(e.biome);
      return `<button class="evolution-option ${!e.parent?'evolution-root':''} ${locked?'locked':''}" data-evolution="${e.id}"><span class="part-icon">${icon(e.icon)}</span><span><strong>${e.name}</strong><small>${!e.parent?'基础适应':locked?'探索 / 前置解锁':e.category+'专精'}</small></span><b data-part-cost="${e.id}">${choice.owned?icon('check'):choice.cost}</b></button>`;
    }).join('');
    document.querySelectorAll('[data-evo-category]').forEach(el=>{el.classList.toggle('active',el.dataset.evoCategory===family);el.setAttribute('aria-pressed',String(el.dataset.evoCategory===family));});
  }
  function updateEvolution(){
    const choice=evolutionChoice(state,candidate),e=choice.part;if(!e)return;
    const {owned,parts}=choice;
    set('evo-name',e.name);set('evo-description',e.description);set('evo-effect',e.effect);set('evo-dna',n(state.colony.dna));
    set('evo-generation',`第 ${state.generation} 代`);
    set('appearance-name',(APPEARANCES.find(a=>a.id===state.appearance)||APPEARANCES[0]).name);
    set('evolve-confirm',owned?'已拥有这个部件':`${choice.replaced?'替换专精':'进化'} · ${choice.cost} 进化点`);document.getElementById('evolve-confirm').disabled=!choice.ok;
    set('evo-hint',choice.reason||'随处都可进化，新部件立即生效。当前伤势与体力比例会保留。');
    set('evo-branch-note',choice.replaced?`替换「${choice.replaced.name}」，回收 ${choice.refund} 点；本次净消耗 ${choice.cost} 点。`:e.parent?'同一方向选择一种专精。以后可替换，回收旧专精的一半进化点。':'先试试这个部件，之后还可以继续进化。');
    document.querySelectorAll('[data-evolution]').forEach(el=>{el.classList.toggle('selected',el.dataset.evolution===candidate);el.setAttribute('aria-pressed',String(el.dataset.evolution===candidate));});
    for(const id of state.parts){const cost=document.querySelector(`[data-part-cost="${id}"]`);if(cost)cost.innerHTML=icon('check');}
    const stats=speciesStats(parts,state.style),before=speciesStats(state.parts,state.style);
    document.getElementById('evolution-stats').innerHTML=`<span>速度 <b>${stats.speed.toFixed(1)}</b><small>${before.speed.toFixed(1)} →</small></span><span>防护 <b>${Math.round(stats.armor*100)}%</b><small>${Math.round(before.armor*100)}% →</small></span><span>攻击 <b>${stats.attack.toFixed(0)}</b><small>${before.attack.toFixed(0)} →</small></span><span>背包 <b>${stats.carry}</b><small>${before.carry} →</small></span>`;
    document.querySelectorAll('[data-appearance]').forEach(el=>{el.setAttribute('aria-pressed',String(el.dataset.appearance===state.appearance));});
    getWorld()?.previewParts(parts);
  }
  function updateColony(){
    const habitat=habitatStage(state);
    set('habitat-name',habitat.name);set('habitat-level',`${habitat.level} / 3`);
    set('habitat-growth-hint',habitat.nextAt?`已建成 ${habitat.completed} 座设施；再建成 ${habitat.nextAt-habitat.completed} 座，主巢会长出${habitat.level===1?'枝架与叶棚':'高棚、编织围护与种荚'}。`:'高棚、编织围护和悬挂种荚已齐备；继续营造可扩充族群和储备。');
    set('modal-population',`${population(state)} / ${state.colony.capacity}`);set('modal-food',n(state.colony.food));set('modal-material',n(state.colony.material));
    const inProgress=state.buildings.some(b=>b.progress<1);
    for(const b of BUILDINGS){
      const count=state.buildings.filter(x=>x.kind===b.id).length;set('built-'+b.id,`${count} / ${b.max}`);
      const button=document.querySelector(`[data-build="${b.id}"]`);button.disabled=inProgress||count>=b.max||state.colony.food<b.cost.food||state.colony.material<b.cost.material;
      button.classList.toggle('guide-highlight',b.id==='garden'&&state.survival?.guideFood&&!state.hints?.foodActionsSeen);
      button.innerHTML=inProgress?'工程进行中':count>=b.max?'已达上限':`开始营造 ${icon('plus')}`;
    }
    const egg=state.colony.egg;
    set('hatch-status',egg?`卵正在孵育，还需要 ${Math.ceil(egg.remaining)} 秒。`:population(state)>=state.colony.capacity?'巢穴住满了，营造育幼巢可以增加 4 个位置。':'一枚卵，一种新的可能。孵育需要 18 食物和一个空位。');
    document.getElementById('hatch-button').disabled=!hatchChoice(state).ok;
    if(!egg)set('hatch-status',hatchChoice(state).ok?'幼体两分钟成年，养育期间不劳动且食量减半。':hatchChoice(state).reason);
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(panel!=='welcome')close();});
  function refresh(){
    const expanded=[...body.querySelectorAll('details[open]')].map(d=>d.querySelector('summary')?.textContent),scroll=dialog.scrollTop;
    render();for(const d of body.querySelectorAll('details'))if(expanded.includes(d.querySelector('summary')?.textContent))d.open=true;
    dialog.scrollTop=scroll;
  }
  dialog.addEventListener('click',e=>{if(e.target===dialog&&panel!=='welcome'){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  return {open,close,render:refresh,update(){if(panel==='colony')updateColony();},select(id){candidate=id;updateEvolution();},category(id){family=id;candidate=id;renderTree();updateEvolution();},evolutionUpdated(){renderTree();updateEvolution();},get panel(){return panel;},get candidate(){return candidate;}};
}
