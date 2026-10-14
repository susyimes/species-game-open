import { t as msg, tr, getLocale, onLocaleChange, preserveLanguageFocus } from "../i18n.js";
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

export const safe=s=>String(tr(s)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const set=(id,text)=>{const el=document.getElementById(id);text=tr(text);if(el&&el.textContent!==String(text))el.textContent=text;};
export const n=v=>Math.floor(v).toLocaleString(getLocale());

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
    updateHeadings(which);dialog.className='dialog-'+which;render();dialog.showModal();
    if(which==='evolve')getWorld()?.showPreview(document.getElementById('evolution-preview'),evolutionChoice(state,candidate).parts);
  }
  function updateHeadings(which){
    const headings={evolve:[msg("生命的下一种可能"),msg("进化小芽")],colony:[msg("一点一点，把这里变成家"),msg("营造家园")],journal:[msg("每一步，都留下生命的痕迹"),msg("岛屿见闻")],help:[msg("初生之岛 · 操作手册"),msg("慢慢探索，自在生长")],welcome:['WELCOME TO THE LIVING ISLE',msg("从一颗小芽开始。")]};
    headings.chapter=[msg("家园与远方，都留下族群的故事"),state.chapter.id==='second_island'?msg("风潮立足"):state.chapter.status==='won'?msg("初岛安居 · 已达成"):msg("初岛安居")];
    headings.journey=[msg("带着发现，回到自己的家园"),state.journey.active?msg("潮生岛远征"):msg("家园与远征")];
    headings.weather=[msg("安排下一段远行"),msg("天气与潮水")];
    headings.survival=[msg("认识岛上的邻居"),msg("岛屿生态")];
    set('dialog-kicker',headings[which][0]);set('dialog-title',headings[which][1]);
  }
  function render(){
    if(panel==='survival'){body.innerHTML=survivalMarkup(state);return;}
    if(panel==='chapter'){body.innerHTML=chapterMarkup(state);return;}
    if(panel==='journey'){body.innerHTML=journeyMarkup(state);return;}
    if(panel==='weather'){body.innerHTML=weatherMarkup(state);return;}
    if(panel==='welcome'){
      body.innerHTML=`<label class="dialog-language">Language / 语言 <select data-language-select aria-label="Language / 语言"><option value="en" ${getLocale()==='en'?'selected':''}>English</option><option value="zh-CN" ${getLocale()==='zh-CN'?'selected':''}>简体中文</option></select></label><p class="welcome-lead">${msg("点一丛浆果，让小芽走过去采集。")}</p><p class="welcome-short">${msg("先带一点食物回家，其余的慢慢来。")}</p><button id="start-button" class="primary-button">${msg("开始探索 ")}${tr(icon('arrow'))}</button><p class="fine-print">${msg("进度保存在这台设备上，离开时世界会暂停。")}</p>`;

    }else if(panel==='evolve'){
      candidate||=EVOLUTIONS.find(e=>!e.parent&&!state.parts.includes(e.id))?.id||'legs';
      const selected=EVOLUTIONS.find(e=>e.id===candidate);family=selected.parent||selected.id;
      body.innerHTML=`<div class="evolution-layout"><div class="evolution-stage"><div class="evolution-stage-label"><span>${msg("小芽 · 身体预览")}</span><span id="evo-generation">${msg("第 ")}${tr(state.generation)} ${msg("代")}</span></div><div id="evolution-preview"></div><p>${msg("选择一种适应，让小芽更擅长探索。")}</p><div class="evolution-stats" id="evolution-stats"></div><div class="appearance-picker"><span>${msg("族群体色 · ")}<b id="appearance-name"></b></span><div>${tr(APPEARANCES.map(a=>`<button data-appearance="${tr(a.id)}" style="--swatch:${tr(a.color)}" aria-label="${msg("体色：")}${tr(a.name)}" title="${tr(a.name)}"></button>`).join(''))}</div></div><p class="fine-print appearance-help">${msg("四种体色随时免费切换，族群一起换上新模样。")}</p></div><div class="evolution-options"><div class="evolution-intro"><span>${msg("选择你的进化方向")}</span><b>${tr(icon('dna'))} <span id="evo-dna">${tr(n(state.colony.dna))}</span></b></div><nav class="evo-family-nav" aria-label="${msg("进化方向")}">${tr(EVOLUTIONS.filter(e=>!e.parent).map(e=>`<button data-evo-category="${tr(e.id)}">${tr(icon(e.icon))} ${tr(e.category)}</button>`).join(''))}</nav><div class="evolution-grid" id="evolution-tree"></div><div class="evolution-detail"><h3 id="evo-name"></h3><p id="evo-description"></p><strong id="evo-effect"></strong><p class="branch-note" id="evo-branch-note"></p></div><button id="evolve-confirm" class="primary-button"></button><p class="fine-print" id="evo-hint"></p></div></div>`;
      renderTree();
      updateEvolution();
    }else if(panel==='colony'){
      body.innerHTML=`<div class="habitat-growth"><span class="habitat-growth-emblem">${tr(icon('nest'))}</span><div><strong id="habitat-name"></strong><p id="habitat-growth-hint"></p></div><span id="habitat-level"></span></div><div class="colony-modal-overview"><div>${tr(icon('paw'))}<strong id="modal-population"></strong><span>${msg("族群成员")}</span></div><div>${tr(icon('leaf'))}<strong id="modal-food"></strong><span>${msg("储存食物")}</span></div><div>${tr(icon('stone'))}<strong id="modal-material"></strong><span>${msg("储存材料")}</span></div></div><div class="building-grid">${tr([...BUILDINGS].sort((a,b)=>(b.id==='garden')-(a.id==='garden')).map(b=>`<article class="building-card" ${tr(b.id!=='garden'&&!state.completed.includes('build')&&!state.metrics.built&&!state.journey.era&&!state.journey.active?'hidden':'')}><div class="building-illustration ${tr(b.id)}">${tr(icon(b.icon))}<span>${tr(b.id==='nest'?'01':b.id==='garden'?'02':'03')}</span></div><div class="building-copy"><h3>${tr(b.name)}<small id="built-${tr(b.id)}"></small></h3><p>${tr(b.description)}</p><strong>${tr(b.effect)}</strong><div class="building-cost">${tr(icon('leaf'))} ${tr(b.cost.food)} <span></span>${tr(icon('stone'))} ${tr(b.cost.material)}</div><button class="secondary-button" data-build="${tr(b.id)}">${msg("开始营造 ")}${tr(icon('plus'))}</button></div></article>`).join(''))}</div><div class="hatch-panel" ${tr(!state.completed.includes('explore')&&!state.colony.egg&&state.metrics.population<=6&&!state.journey.era?'hidden':'')}><span class="egg-drawing">${tr(icon('nest'))}</span><div><h3>${msg("迎接新的同伴")}</h3><p id="hatch-status"></p></div><button id="hatch-button" class="primary-button">${msg("孵育 · 18 食物")}</button></div><p class="fine-print">${msg("营造会消耗巢中的资源。营造同伴走到工地后开始施工，空闲时会协助采集。")}</p>`;
      body.insertAdjacentHTML('beforeend',populationManagement(state));updateColony();
    }else if(panel==='journal'){
      body.innerHTML=`<div class="journal-biomes">${tr(BIOMES.map(b=>`<div class="biome-entry ${tr(state.discovered.includes(b.id)?'discovered':'')}"><span style="--biome:${tr(b.color)}">${tr(icon(state.discovered.includes(b.id)?'leaf':'compass'))}</span><h3>${tr(state.discovered.includes(b.id)?b.name:msg("尚未踏足"))}</h3><p>${tr(state.discovered.includes(b.id)?b.description:msg("向着岛屿更远的地方探索。"))}</p></div>`).join(''))}</div><h3 class="journal-heading">${msg("岛上的邻居")}</h3><div class="wildlife-guide">${tr(Object.entries(SPECIES).filter(([id])=>state.mapId==='home'?['mossback','reedbeak','emberfang','glowbug','tideback','reefjaw'].includes(id)||state.agents.some(a=>a.dominated&&a.species===id):[...Object.keys(state.habitatHealth?.baseline||{}),...state.agents.map(a=>a.species)].includes(id)).map(([,sp])=>`<article><span>${tr(icon(sp.fly?'leaf':sp.swim?'water':sp.kind==='predator'?'horn':'shield'))}</span><div><h3>${tr(state.discovered.includes(sp.biome)?sp.name:msg("未知的足迹"))}</h3><p>${tr(state.discovered.includes(sp.biome)?sp.description:msg("探索新的栖息地，认识不同的生命。"))}</p></div></article>`).join(''))}</div>${tr(state.journey.firstVictory?`<section class="journey-gallery"><h3>${msg("祖岛往事 · 初岛安居")}</h3><p>${msg("千年前，族群在这里建起了最初的家。安居记录保留于第 ")}${tr(Math.floor((state.journey.firstVictory.elapsedTicks??state.journey.firstVictory.tick)/20/60))} ${msg("分钟。")}</p><p>${msg("后裔保留了进化、家园与远征带回的发现。")}</p></section>`:'')}<h3 class="journal-heading">${msg("旅途中的小事")}</h3><ol class="journal-entries">${tr(state.journal.map(e=>`<li><span>${tr(Math.floor(e.time/60))} ${msg("分")}</span><p>${tr(safe(e.text))}</p></li>`).join(''))}</ol>`;
    }else if(panel==='help'){
      body.innerHTML=`<label class="dialog-language">Language / 语言 <select data-language-select aria-label="Language / 语言"><option value="en" ${getLocale()==='en'?'selected':''}>English</option><option value="zh-CN" ${getLocale()==='zh-CN'?'selected':''}>简体中文</option></select></label><div class="help-grid"><div><h3>${msg("跟着小芽探索")}</h3><p><kbd>W A S D</kbd> / ${msg("方向键 移动")}</p><p><kbd>Shift</kbd> ${msg("持续奔跑 · 消耗体力")}</p><p><kbd>E</kbd> ${msg("执行附近的采集 / 捕食")}</p><p>${msg("长按资源或生物 0.55 秒，查看详情和选项。")}</p><p><kbd>Q</kbd> ${msg("召唤守卫跟随一会儿")}</p><p><kbd>6</kbd> ${msg("远征菜单")}</p><p><kbd>H</kbd> ${msg("沿路返回巢穴")}</p><p><kbd>${msg("空格")}</kbd> ${msg("暂停 / 继续")}</p><p>${msg("单击野生生物捕食，击倒后接着拾取；Shift 奔跑可甩开追击。")}</p><p>${msg("点击地面前往，右键拖动旋转视角。长出潮汐侧鳍后，也可以点击近海游过去，再按 H 游回家。")}</p><p>${msg("面板默认隐藏。点“展开面板 / 收起面板”或按 1 切换，打开后会保持显示。首次备齐资源时，相关按钮会亮起；点击或略过后不再重复提示。")}</p></div><div><h3>${msg("让家园慢慢长大")}</h3><p>${msg("靠近巢穴会自动存放资源、恢复生命。")}</p><p>${msg("采集同伴寻找资源并带回。营造同伴优先施工，守卫保护附近同伴。")}</p><p>${msg("探索和完成旅程能获得进化点；随处可进化、免费换体色。进化保留当前伤势和体力比例。")}</p><p>${msg("同伴会自动取食。采集和浆果圃补充家园库存，不需要管理供食。")}</p><p>${msg("夜间猎食者警戒更远；雨后湿地泥泞，巢边可避风。")}</p><p>${msg("同伴死亡会永久离开，人口减少。只有小芽重伤后能回家恢复。切换窗口或打开菜单时，世界暂停。")}</p></div></div>${tr(callbacks.audioSettings?.()||'')}<div class="save-actions"><button id="export-save" class="secondary-button">${tr(icon('save'))} ${msg("导出旅程")}</button><button id="import-save-button" class="secondary-button">${msg("导入旅程")}</button><input id="import-save" type="file" accept="application/json,.json" hidden><button id="reset-button" class="text-button danger-text">${msg("重新启程")}</button></div><p id="save-feedback" class="fine-print">${msg("存档留在本机浏览器中。旧版种息的存档保持独立。")}</p>`;
    }
  }
  function renderTree(){
    document.getElementById('evolution-tree').innerHTML=EVOLUTIONS.filter(e=>e.id===family||e.parent===family&&state.parts.includes(family)).map(e=>{
      const choice=evolutionChoice(state,e.id),locked=e.parent&&!state.parts.includes(e.parent)||e.biome&&!state.discovered.includes(e.biome)&&!state.journey?.knowledge?.includes(e.biome);
      return `<button class="evolution-option ${tr(!e.parent?'evolution-root':'')} ${tr(locked?'locked':'')}" data-evolution="${tr(e.id)}"><span class="part-icon">${tr(icon(e.icon))}</span><span><strong>${tr(e.name)}</strong><small>${tr(!e.parent?msg("基础适应"):locked?msg("探索 / 前置解锁"):e.category+msg("专精"))}</small></span><b data-part-cost="${tr(e.id)}">${tr(choice.owned?icon('check'):choice.cost)}</b></button>`;
    }).join('');
    document.querySelectorAll('[data-evo-category]').forEach(el=>{el.classList.toggle('active',el.dataset.evoCategory===family);el.setAttribute('aria-pressed',String(el.dataset.evoCategory===family));});
  }
  function updateEvolution(){
    const choice=evolutionChoice(state,candidate),e=choice.part;if(!e)return;
    const {owned,parts}=choice;
    set('evo-name',e.name);set('evo-description',e.description);set('evo-effect',e.effect);set('evo-dna',n(state.colony.dna));
    set('evo-generation',msg("第 {p0} 代",{p0:tr(state.generation)}));
    set('appearance-name',(APPEARANCES.find(a=>a.id===state.appearance)||APPEARANCES[0]).name);
    set('evolve-confirm',owned?msg("已拥有这个部件"):msg("{p0} · {p1} 进化点",{p0:tr(choice.replaced?msg("替换专精"):msg("进化")),p1:tr(choice.cost)}));document.getElementById('evolve-confirm').disabled=!choice.ok;
    set('evo-hint',choice.reason||msg("随处都可进化，新部件立即生效。当前伤势与体力比例会保留。"));
    set('evo-branch-note',choice.replaced?msg("替换「{p0}」，回收 {p1} 点；本次净消耗 {p2} 点。",{p0:tr(choice.replaced.name),p1:tr(choice.refund),p2:tr(choice.cost)}):e.parent?msg("同一方向选择一种专精。以后可替换，回收旧专精的一半进化点。"):msg("先试试这个部件，之后还可以继续进化。"));
    document.querySelectorAll('[data-evolution]').forEach(el=>{el.classList.toggle('selected',el.dataset.evolution===candidate);el.setAttribute('aria-pressed',String(el.dataset.evolution===candidate));});
    for(const id of state.parts){const cost=document.querySelector(`[data-part-cost="${tr(id)}"]`);if(cost)cost.innerHTML=icon('check');}
    const stats=speciesStats(parts,state.style),before=speciesStats(state.parts,state.style);
    document.getElementById('evolution-stats').innerHTML=`<span>${msg("速度 ")}<b>${tr(stats.speed.toFixed(1))}</b><small>${tr(before.speed.toFixed(1))} →</small></span><span>${msg("防护 ")}<b>${tr(Math.round(stats.armor*100))}%</b><small>${tr(Math.round(before.armor*100))}% →</small></span><span>${msg("攻击 ")}<b>${tr(stats.attack.toFixed(0))}</b><small>${tr(before.attack.toFixed(0))} →</small></span><span>${msg("背包 ")}<b>${tr(stats.carry)}</b><small>${tr(before.carry)} →</small></span>`;
    document.querySelectorAll('[data-appearance]').forEach(el=>{el.setAttribute('aria-pressed',String(el.dataset.appearance===state.appearance));});
    getWorld()?.previewParts(parts);
  }
  function updateColony(){
    const habitat=habitatStage(state);
    set('habitat-name',habitat.name);set('habitat-level',`${tr(habitat.level)} / 3`);
    set('habitat-growth-hint',habitat.nextAt?msg("已建成 {p0} 座设施；再建成 {p1} 座，主巢会长出{p2}。",{p0:tr(habitat.completed),p1:tr(habitat.nextAt-habitat.completed),p2:tr(habitat.level===1?msg("枝架与叶棚"):msg("高棚、编织围护与种荚"))}):msg("高棚、编织围护和悬挂种荚已齐备；继续营造可扩充族群和储备。"));
    set('modal-population',`${tr(population(state))} / ${tr(state.colony.capacity)}`);set('modal-food',n(state.colony.food));set('modal-material',n(state.colony.material));
    const inProgress=state.buildings.some(b=>b.progress<1);
    for(const b of BUILDINGS){
      const count=state.buildings.filter(x=>x.kind===b.id).length;set('built-'+b.id,`${tr(count)} / ${tr(b.max)}`);
      const button=document.querySelector(`[data-build="${tr(b.id)}"]`);button.disabled=inProgress||count>=b.max||state.colony.food<b.cost.food||state.colony.material<b.cost.material;
      button.classList.toggle('guide-highlight',b.id==='garden'&&state.survival?.guideFood&&!state.hints?.foodActionsSeen);
      button.innerHTML=inProgress?msg("工程进行中"):count>=b.max?msg("已达上限"):msg("开始营造 {p0}",{p0:tr(icon('plus'))});
    }
    const egg=state.colony.egg;
    set('hatch-status',egg?msg("卵正在孵育，还需要 {p0} 秒。",{p0:tr(Math.ceil(egg.remaining))}):population(state)>=state.colony.capacity?msg("巢穴住满了，营造育幼巢可以增加 4 个位置。"):msg("一枚卵，一种新的可能。孵育需要 18 食物和一个空位。"));
    document.getElementById('hatch-button').disabled=!hatchChoice(state).ok;
    if(!egg)set('hatch-status',hatchChoice(state).ok?msg("幼体两分钟成年，养育期间不劳动且食量减半。"):hatchChoice(state).reason);
  }
  dialog.addEventListener('cancel',e=>{e.preventDefault();if(panel!=='welcome')close();});
  function refresh(){
    const expanded=[...body.querySelectorAll('details')].map(d=>d.open),scroll=dialog.scrollTop;
    preserveLanguageFocus(body,render);[...body.querySelectorAll('details')].forEach((d,i)=>{d.open=!!expanded[i];});
    dialog.scrollTop=scroll;
  }
  dialog.addEventListener('click',e=>{if(e.target===dialog&&panel!=='welcome'){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}});
  return {open,close,relocalize(){if(panel){updateHeadings(panel);refresh();if(panel==='evolve')getWorld()?.showPreview(document.getElementById('evolution-preview'),evolutionChoice(state,candidate).parts);}},render:refresh,update(){if(panel==='colony')updateColony();},select(id){candidate=id;updateEvolution();},category(id){family=id;candidate=id;renderTree();updateEvolution();},evolutionUpdated(){renderTree();updateEvolution();},get panel(){return panel;},get candidate(){return candidate;}};
}
