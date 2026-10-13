import { icon } from './icons.js';
import { interfaceHTML } from './templates.js';
import { createDialogs, safe, set, n } from './dialogs.js';
import { QUESTS, EVOLUTIONS, BUILDINGS, JOBS, BIOMES, NEST, SPECIES, speciesStats } from '../core/config.js';
import { population, nearbyContext } from '../core/state.js';
import { dayInfo, bagTotal, harvestDuration } from '../core/simulation.js';
import { clamp } from '../core/math.js';
import { biomeAt, heightAt } from '../core/terrain.js';
import { creatureOptions } from '../core/creature-interactions.js';

const bar=(id,value)=>{const el=document.getElementById(id);if(el)el.style.width=`${clamp(value,0,100)}%`;};
export function mountUI(state,callbacks){
  document.getElementById('interface').innerHTML=interfaceHTML;
  let world=null,lastToast='',lastSelection='',lastParts='';
  const dialogs=createDialogs(state,callbacks,()=>world);
  const creatureMenu=document.getElementById('creature-menu');let menuTargetId=null;
  function closeCreatureMenu(){creatureMenu.close();menuTargetId=null;callbacks.modal(false);}
  function openCreatureMenu(a){
    menuTargetId=a.id;const name=SPECIES[a.species]?.name||`同伴 ${String(state.agents.filter(x=>x.kind==='companion').indexOf(a)+1).padStart(2,'0')}`;
    set('creature-menu-title',name);
    const options=creatureOptions(state,a);
    document.getElementById('creature-menu-options').innerHTML=options.map(o=>`<button data-creature-action="${o.id}"><span>${icon(o.id==='hunt'?'horn':o.id==='dominate'?'sun':o.id==='communicate'?'sound':o.id==='release'?'leaf':o.id==='follow'?'paw':'nest')}</span><div><strong>${o.name}</strong><small>${o.description}</small></div>${icon('arrow')}</button>`).join('');
    set('creature-menu-hint',a.kind==='companion'?'指令只会作用于这位同伴。':!state.parts.includes('crest')?'长出共鸣冠饰，可解锁交流。':!options.some(o=>o.id==='dominate'||o.id==='release')?'共鸣冠饰、弯月双角和任意一种专精，可解锁统治。':'统治需要至少 60 亲近，或对方生命不高于 40%。');
    callbacks.modal(true);creatureMenu.showModal();
  }
  creatureMenu.addEventListener('cancel',e=>{e.preventDefault();closeCreatureMenu();});
  function run(fn,...args){const result=callbacks[fn]?.(...args);if(result&&!result.ok)callbacks.message(result.reason);update(true);return result;}
  document.getElementById('interface').addEventListener('click',e=>{
    const btn=e.target.closest('button,a');if(!btn)return;
    if(btn.matches('.brand')){e.preventDefault();dialogs.close();world?.focusPlayer();}
    if(btn.dataset.panel)dialogs.open(btn.dataset.panel);
    if(btn.dataset.job)run('assignJob',btn.dataset.job,Number(btn.dataset.delta));
    if(btn.dataset.speed){state.speed=Number(btn.dataset.speed);update(true);}
    if(btn.dataset.evolution)dialogs.select(btn.dataset.evolution);
    if(btn.dataset.evoCategory)dialogs.category(btn.dataset.evoCategory);
    if(btn.dataset.appearance){const result=run('setAppearance',btn.dataset.appearance);if(result?.ok){dialogs.evolutionUpdated();callbacks.save();}}
    if(btn.dataset.companionJob)run('companionJob',btn.dataset.companionJob);
    if(btn.dataset.creatureAction){const id=menuTargetId,action=btn.dataset.creatureAction;closeCreatureMenu();run('creatureAction',id,action);}
    if(btn.dataset.build){const result=run('build',btn.dataset.build);if(result?.ok)dialogs.close();}
    switch(btn.id){
      case 'dialog-close':dialogs.close();break;
      case 'start-button':state.started=true;dialogs.close();callbacks.save();break;
      case 'evolve-confirm':{const result=run('evolve',dialogs.candidate);if(result?.ok){dialogs.evolutionUpdated();callbacks.save();}break;}
      case 'hatch-button':{const result=run('hatch');if(result?.ok)dialogs.close();break;}
      case 'pause-button':callbacks.pause();break;
      case 'interact-button':run('interact');break;
      case 'return-button':run('home');break;
      case 'rally-button':run('rally');break;
      case 'map-home':world?.focusHome();break;
      case 'camera-follow':case 'explore-button':dialogs.close();world?.focusPlayer();break;
      case 'camera-in':world?.zoom(.82);break;
      case 'camera-out':world?.zoom(1.2);break;
      case 'selection-action':callbacks.selectedAction();break;
      case 'target-clear':callbacks.clearTarget();break;
      case 'creature-menu-close':closeCreatureMenu();break;
      case 'export-save':callbacks.exportSave();break;
      case 'import-save-button':document.getElementById('import-save').click();break;
      case 'reset-button':btn.id='confirm-reset';btn.textContent='确认开启新旅程';set('save-feedback','当前旅程会先保存一份本机备份，再开启新旅程。');break;
      case 'confirm-reset':callbacks.reset();break;
    }
  });
  document.getElementById('interface').addEventListener('change',e=>{if(e.target.id==='import-save'&&e.target.files[0])callbacks.importSave(e.target.files[0]);});
  const map=document.getElementById('minimap'),ctx=map.getContext('2d');
  const mapBase=document.createElement('canvas');mapBase.width=map.width;mapBase.height=map.height;
  const bg=mapBase.getContext('2d'),scale=2.05,center={x:180,y:119};
  bg.fillStyle='#b0ceba';bg.fillRect(0,0,map.width,map.height);
  for(let y=0;y<map.height;y+=2)for(let x=0;x<map.width;x+=2){
    const wx=(x-center.x)/scale,wz=(y-center.y)/scale,h=heightAt(wx,wz);
    if(h<.15)continue;bg.fillStyle=h<.6?'#d6d0a4':h>3?'#b0a781':biomeAt(wx,wz).color;bg.fillRect(x,y,2,2);
  }
  map.addEventListener('click',e=>{
    const r=map.getBoundingClientRect(),x=((e.clientX-r.left)/r.width*map.width-center.x)/scale,z=((e.clientY-r.top)/r.height*map.height-center.y)/scale;
    callbacks.mapMove({x,z});
  });
  function drawMap(){
    ctx.drawImage(mapBase,0,0);
    for(const b of BIOMES){ctx.fillStyle='#6f846d';ctx.font='16px sans-serif';ctx.textAlign='center';if(!state.discovered.includes(b.id))ctx.fillText('?',center.x+b.x*scale,center.y+b.z*scale);}
    ctx.fillStyle='#ece6c0';ctx.strokeStyle='#5b7858';ctx.lineWidth=2;ctx.beginPath();ctx.arc(center.x+NEST.x*scale,center.y+NEST.z*scale,6,0,Math.PI*2);ctx.fill();ctx.stroke();
    for(const a of state.agents.filter(a=>a.hp>0)){
      if(a.kind==='predator'&&!state.discovered.includes(biomeAt(a.x,a.z).id))continue;
      ctx.fillStyle=a.kind==='companion'?'#4c7657':a.kind==='predator'?'#aa6958':'#a59569';ctx.beginPath();ctx.arc(center.x+a.x*scale,center.y+a.z*scale,a.kind==='companion'?2.3:2,0,Math.PI*2);ctx.fill();
    }
    const p=state.player;ctx.save();ctx.translate(center.x+p.x*scale,center.y+p.z*scale);ctx.rotate(-p.heading);ctx.fillStyle='#fffbee';ctx.strokeStyle='#325e4d';ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(0,7);ctx.lineTo(-5,-5);ctx.lineTo(0,-2);ctx.lineTo(5,-5);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
  }
  function update(force=false){
    set('food-value',n(state.colony.food));set('material-value',n(state.colony.material));set('dna-value',n(state.colony.dna));set('population-value',`${population(state)} / ${state.colony.capacity}`);
    const gardens=state.buildings.filter(b=>b.kind==='garden'&&b.progress===1).length,rate=gardens*5-population(state)*1.08;
    set('food-rate',`${rate>0?'+':''}${rate.toFixed(1)}/分`);
    const d=dayInfo(state),biome=biomeAt(state.player.x,state.player.z);
    set('day-value',`第 ${d.day} 天`);set('hour-value',`${String(Math.floor(d.hour)).padStart(2,'0')}:${String(Math.floor(d.hour%1*60)).padStart(2,'0')}`);set('biome-name',biome.name);
    const weather=state.weather==='rain'?'water':d.hour>18||d.hour<6?'moon':'sun',wi=document.getElementById('weather-icon');
    if(wi.dataset.weather!==weather){wi.innerHTML=icon(weather);wi.dataset.weather=weather;}
    const q=QUESTS[state.quest];
    set('quest-title',q?.title||'让生命继续生长');set('quest-description',q?.description||'旅程的第一章完成了。继续探索、进化，找到你喜欢的生活方式。');
    set('quest-index',`${String(Math.min(6,state.quest+1)).padStart(2,'0')} / 06`);set('quest-label',q?.label||'第一章已完成');
    set('quest-count',q?`${Math.min(q.target,Math.floor(state.metrics[q.metric]||0))} / ${q.target}`:'6 / 6');bar('quest-bar',q?(state.metrics[q.metric]||0)/q.target*100:100);set('quest-reward',q?`+${q.reward} 进化点`:'自由探索');
    set('colony-status',state.colony.food<8?'需要更多食物':state.colony.egg?'新生命正在孵育':'生活安稳');
    for(const id of Object.keys(JOBS))set('job-'+id,state.agents.filter(a=>a.kind==='companion'&&a.job===id).length);
    const project=state.buildings.find(b=>b.progress<1);document.getElementById('construction').hidden=!project;
    if(project){set('construction-name',`营造${BUILDINGS.find(b=>b.id===project.kind).name}`);set('construction-percent',`${Math.floor(project.progress*100)}%`);bar('construction-bar',project.progress*100);}
    set('building-count',`${state.buildings.filter(b=>b.progress===1&&b.kind!=='home').length} 座设施`);
    set('generation',`第 ${state.generation} 代`);set('species-subtitle',state.parts.length?`${state.parts.length} 次适应 · ${state.parts.includes('fins')?'水陆两栖':'陆生杂食'}`:'原生种 · 陆生杂食');
    const stats=speciesStats(state.parts);bar('health-bar',state.player.hp);bar('stamina-bar',state.player.stamina/stats.stamina*100);set('health-value',Math.ceil(state.player.hp));set('stamina-value',Math.floor(state.player.stamina));
    if(lastParts!==state.parts.join(',')||force){lastParts=state.parts.join(',');document.getElementById('creature-traits').innerHTML=state.parts.length?state.parts.map(id=>`<span>${EVOLUTIONS.find(e=>e.id===id).name}</span>`).join(''):'<span>好奇的探索者</span><span>群居</span>';}
    set('bag-value',`背包 ${n(bagTotal(state.player))} / ${stats.carry}`);set('bag-detail',bagTotal(state.player)?`${n(state.player.carry.food)} 食物 · ${n(state.player.carry.material)} 材料`:'');
    const mode=world?.actors.get('player')?.root.userData.movementMode;
    document.getElementById('bag-value').dataset.medium=mode||'land';
    if(mode==='swim'||mode==='wade')set('bag-value',`${mode==='swim'?'游泳':'趟水'} · 背包 ${n(bagTotal(state.player))} / ${stats.carry}`);
    const context=nearbyContext(state);set('interaction-label',context?.type==='enemy'?'双击生物 / 长按互动':context?.label||(state.player.path.length?'正在前往目的地':'靠近资源进行采集'));
    document.getElementById('interact-button').disabled=context?.type==='enemy';
    const selected=state.selected,ss=selected?.id+':'+Math.floor(selected?.amount??0)+':'+Math.ceil(selected?.hp??0)+':'+state.player.target?.id+':'+state.player.behavior+':'+selected?.job+':'+selected?.manualFollow+':'+selected?.trust+':'+selected?.dominated;
    document.body.classList.toggle('has-target',!!selected);
    const resource=selected?.amount!==undefined;
    document.getElementById('selection-panel').dataset.kind=resource?'resource':selected?'creature':'empty';
    document.getElementById('gather-status').hidden=!resource;
    if(resource){
      const active=state.player.target?.type==='resource'&&state.player.target.id===selected.id;
      const gathering=active&&state.player.behavior==='gather'&&Math.hypot(state.player.x-selected.x,state.player.z-selected.z)<=2.1;
      const percent=gathering?Math.floor(clamp(state.player.work/harvestDuration(state.player,selected)*100,0,100)):0;
      const verb=selected.kind==='relic'?'研究':'采集';
      const label=active?gathering?`${verb}中`:'正在靠近':selected.amount<1?selected.kind==='relic'?'等待孢子孕育':'已采集完':bagTotal(state.player)>=stats.carry&&selected.kind!=='relic'?'背包已满':'等待采集';
      set('gather-label',state.paused&&active?`已暂停 · ${label}`:label);
      set('gather-percent',gathering?`${percent}%`:'');bar('gather-bar',percent);
      const progress=document.getElementById('gather-progress');progress.setAttribute('aria-valuenow',String(percent));progress.setAttribute('aria-valuetext',`${label}${gathering?` ${percent}%`:''}`);
    }
    if(ss!==lastSelection||force){
      lastSelection=ss;
      document.getElementById('target-clear').hidden=!selected;
      document.getElementById('target-clear').setAttribute('aria-label','关闭目标信息');
      const creature=!!selected&&selected.hp!==undefined;
      document.getElementById('target-health').hidden=!creature;
      document.getElementById('companion-jobs').hidden=true;
      document.getElementById('selection-action').hidden=creature;
      document.getElementById('selection-action').disabled=false;
      if(selected){
        const names={food:'蜜红浆果',material:'河岸矿石',relic:'远古孢子',companion:'小芽的同伴',grazer:'原野游食兽',predator:'赤脊猎食者'};set('selection-name',selected.carcass?'猎物残骸':SPECIES[selected.species]?.name||names[selected.kind]||'初生之巢');
        set('selection-description',selected.amount!==undefined?selected.kind==='relic'?'古老生命留下的记忆。靠近并研究，可以获得 18 进化点。':`还有 ${Math.floor(selected.amount)} 份${selected.kind==='food'?'食物':'材料'}。采集后记得带回巢穴。`:selected.kind==='predator'?'领地意识很强的猎食者。进化护甲或召唤守卫，再靠近它。':selected.kind==='grazer'?'温顺的野生邻居。你可以观察它，也可以靠近捕猎。':selected.kind==='companion'?'同伴会按照分工照料家园。你进化的部件也会被它们继承。':'靠近巢穴恢复生命，并自动存放背包资源。');
        set('selection-action',selected.kind==='predator'||selected.kind==='grazer'?'靠近并捕猎 →':selected.kind==='companion'?'查看家园分工 →':selected.kind==='relic'?'前去研究 →':'前去采集 →');
        if(SPECIES[selected.species])set('selection-description',SPECIES[selected.species].description);
        if(selected.carcass)set('selection-action','拾取食物 →');
        if(resource)set('selection-description',selected.kind==='relic'?selected.amount<1?'3 分钟后重新孕育':`研究获得 ${selected.researchCount?8:18} 进化点`:`剩余 ${Math.floor(selected.amount)} 份${selected.kind==='food'?'食物':'材料'}`);
        const following=!!selected.manualFollow,active=state.player.target?.id===selected.id;
        const companionIndex=state.agents.filter(a=>a.kind==='companion').indexOf(selected)+1;
        if(selected.kind==='companion')set('selection-name',`同伴 ${String(companionIndex).padStart(2,'0')}`);
        const name=document.getElementById('selection-name').textContent;
        if(creature){const max=SPECIES[selected.species]?.hp||100;bar('target-health-bar',selected.hp/max*100);set('target-health-value',`${Math.ceil(selected.hp)} / ${max}`);}
        if(selected.kind==='predator'||selected.kind==='grazer'){
          const actionType=state.player.target?.type;
          const actionName=actionType==='communicate'?'交流':actionType==='dominate'?'统治':'捕猎';
          set('target-intent',active?`正在${actionName} ${name}。点地面可取消并移动。`:selected.dominated?'已接受统治，正在跟随你的行动。':`亲近 ${selected.trust||0} / 100 · 长按查看互动。`);
          if(selected.hp<=0)set('target-intent',`${name}已倒下，附近可能有可拾取的食物。`);
        }else if(selected.kind==='companion'){
          set('selection-description',`目前分工：${JOBS[selected.job]}。可以单独指挥这位同伴。`);
          set('target-intent',following?`${name}正在跟随你。长按可变更指令。`:'长按这位同伴，可以选择跟随或分工。');
          document.querySelectorAll('[data-companion-job]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.companionJob===selected.job&&!following)));
        }else{
          set('selection-action',active?'停止采集':selected.kind==='relic'?'研究孢子':selected.carcass?'拾取食物':'前往采集');
          set('target-intent','');
          document.getElementById('selection-action').disabled=selected.amount<1&&!active;
        }
        document.getElementById('selection-action').setAttribute('aria-label',`${document.getElementById('selection-action').textContent}：${name}`);
      }else{
        set('selection-name','丰饶的原野');set('selection-description','单击资源，自动靠近并采集。');set('selection-action','去采集第一份浆果 →');set('target-intent','');
        document.getElementById('selection-action').removeAttribute('aria-label');
      }
    }
    const recent=state.notifications.filter(e=>state.time-e.time<9).slice(-2),toastSig=recent.map(e=>e.text+e.time).join('|');
    if(toastSig!==lastToast){lastToast=toastSig;document.getElementById('toasts').innerHTML=recent.map(e=>`<div class="toast ${e.kind}">${icon(e.kind==='evolve'?'dna':e.kind==='danger'?'shield':'check')}<span>${safe(e.text)}</span></div>`).join('');}
    set('play-state',state.paused?'时间已暂停':'世界正在生长');
    const pause=document.getElementById('pause-button');if(pause.dataset.paused!==String(state.paused)){pause.innerHTML=icon(state.paused?'play':'pause');pause.setAttribute('aria-label',state.paused?'继续':'暂停');pause.dataset.paused=String(state.paused);}
    document.querySelectorAll('[data-speed]').forEach(el=>el.classList.toggle('active',Number(el.dataset.speed)===state.speed));
    set('map-discovered',`探索 ${state.discovered.length} / 4`);drawMap();dialogs.update();
  }
  update(true);
  return {update,open:dialogs.open,openCreatureMenu,close(){if(creatureMenu.open)closeCreatureMenu();else dialogs.close();},get panel(){return creatureMenu.open?'creature':dialogs.panel;},get previewHost(){return document.getElementById('portrait');},attachWorld(w){world=w;}};
}
