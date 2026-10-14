import { t as msg, tr, getLocale, onLocaleChange, setLocale, refreshLocalizedLabels } from "../i18n.js";
import { CONTRACTS } from '../core/journey-config.js';
import { departureChoice } from '../core/journey.js';
import { remaining } from './journey.js';
import { mapBiomes } from '../core/maps.js';
import { icon } from './icons.js';
import { interfaceHTML } from './templates.js';
import { createDialogs, safe, set, n } from './dialogs.js';
import { QUESTS, EVOLUTIONS, BUILDINGS, JOBS, BIOMES, NEST, SPECIES, speciesStats, FOOD_PER_MEMBER_SECOND } from '../core/config.js';
import { population, nearbyContext } from '../core/state.js';
import { dayInfo, bagTotal } from '../core/simulation.js';
import { clamp } from '../core/math.js';
import { terrainFor } from '../core/terrain.js';
import { targetInfo } from '../core/target-info.js';
import { createOnboarding } from './onboarding.js';
import { environment, WEATHER, tideValue } from '../core/weather.js';
import { chapterProgress } from '../core/chapter.js';
import { createHud } from './hud.js';
import { habitatStage } from '../core/habitat.js';
import { foodOutlook } from '../core/food.js';
import { isJuvenile } from '../core/survival-config.js';
import { visibleSystems } from './progression.js';
import { RIVAL_SITES } from '../core/rivals.js';

const bar=(id,value)=>{const el=document.getElementById(id);if(el)el.style.width=`${tr(clamp(value,0,100))}%`;};
export function mountUI(state,callbacks){
  const BIOMES=mapBiomes(state);
  const { biomeAt, heightAt }=terrainFor(state);
  document.getElementById('interface').innerHTML=interfaceHTML;
  const language=document.createElement('label');language.className='language-control';language.innerHTML='<span class="visually-hidden">Language / 语言</span><select id="game-language" data-language-select aria-label="Language / 语言"><option value="en">English</option><option value="zh-CN">简体中文</option></select>';document.querySelector('.topbar').append(language);const languageSelect=language.querySelector('select');languageSelect.value=getLocale();document.getElementById('interface').addEventListener('change',e=>{if(e.target.matches('[data-language-select]'))setLocale(e.target.value);});
  const hud=createHud(state,document.getElementById('interface'));
  let world=null,lastToast='',lastParts='';
  const dialogs=createDialogs(state,callbacks,()=>world);
  const coach=createOnboarding(state,document.getElementById('interface'),callbacks.save);
  function openPanel(which){
    if(visibleSystems(state)[which]===false)return;
    coach.ack(which);if(which==='journey'){state.hints??={};state.hints.journeyIntro=true;callbacks.save();}dialogs.open(which);
  }
  const creatureMenu=document.getElementById('creature-menu');let menuTarget=null;
  function closeCreatureMenu(){creatureMenu.close();menuTarget=null;callbacks.modal(false);}
  function openTargetMenu(target){
    const info=targetInfo(state,target);if(!info)return;
    menuTarget=target;
    set('creature-menu-title',info.name);set('creature-menu-description',info.description);
    document.getElementById('creature-menu-facts').innerHTML=info.facts.map(f=>'<span>'+safe(f)+'</span>').join('');
    document.getElementById('creature-menu-options').innerHTML=info.options.map(o=>'<button data-target-action="'+o.id+'" '+(o.disabled?'disabled':'')+'><span>'+icon(o.id==='hunt'?'horn':o.id==='harvest'?'leaf':o.id==='communicate'?'sound':o.id==='follow'?'paw':'nest')+'</span><div><strong>'+safe(o.name)+'</strong><small>'+safe(o.description)+'</small></div>'+icon('arrow')+'</button>').join('');
    set('creature-menu-hint',info.hint);callbacks.modal(true);if(!creatureMenu.open)creatureMenu.showModal();coach.update();
  }
  creatureMenu.addEventListener('cancel',e=>{e.preventDefault();closeCreatureMenu();});
  function run(fn,...args){const result=callbacks[fn]?.(...args);if(result&&!result.ok)callbacks.message(result.reason);update(true);return result;}
  document.getElementById('interface').addEventListener('click',e=>{
    const btn=e.target.closest('button,a');if(!btn)return;
    if(btn.matches('.brand')){e.preventDefault();dialogs.close();world?.focusPlayer();}
    if(btn.dataset.panel)openPanel(btn.dataset.panel);
    if(btn.dataset.focusReward){dialogs.close();world?.focusReward(btn.dataset.focusReward);}
    if(btn.dataset.depart){void callbacks.depart(btn.dataset.depart,btn.dataset.urgent==='true');return;}
    let policyResult;
    if(btn.dataset.foodPolicy)policyResult=run('configureFood','foodPolicy',btn.dataset.foodPolicy);
    if(btn.id==='breeding-toggle')policyResult=run('configureFood','breedingAllowed',!state.colony.breedingAllowed);
    if(btn.dataset.populationDelta)policyResult=run('configureFood','populationLimit',state.colony.populationLimit+Number(btn.dataset.populationDelta));
    if(btn.dataset.protect)policyResult=run('configureHabitat','protected',btn.dataset.protect);
    if(btn.id==='reserve-fruit')policyResult=run('configureHabitat','reserveFruit',!state.habitatHealth.reserveFruit);
    if(btn.dataset.releaseYoung)policyResult=run('releaseYoung',btn.dataset.releaseYoung);
    if(btn.id==='plant-seeds')policyResult=run('plantSeeds');
    if(policyResult?.ok){if(policyResult.point)world?.focusPoint(policyResult.point);dialogs.render();callbacks.save();}
    if(btn.dataset.sample!==undefined){dialogs.close();callbacks.sample(Number(btn.dataset.sample));}
    if(btn.dataset.job)run('assignJob',btn.dataset.job,Number(btn.dataset.delta));
    if(btn.dataset.speed){state.speed=Number(btn.dataset.speed);update(true);}
    if(btn.dataset.evolution)dialogs.select(btn.dataset.evolution);
    if(btn.dataset.evoCategory)dialogs.category(btn.dataset.evoCategory);
    if(btn.dataset.appearance){const result=run('setAppearance',btn.dataset.appearance);if(result?.ok){dialogs.evolutionUpdated();callbacks.save();}}
    if(btn.dataset.companionJob)run('companionJob',btn.dataset.companionJob);
    if(btn.dataset.targetAction){const target=menuTarget,action=btn.dataset.targetAction;closeCreatureMenu();callbacks.targetAction(target,action);update(true);}
    if(btn.dataset.build){const result=run('build',btn.dataset.build);if(result?.ok)dialogs.close();}
    switch(btn.id){
      case 'dialog-close':dialogs.close();break;
      case 'expedition-return':void callbacks.returnExpedition('normal');break;
      case 'expedition-emergency':void callbacks.returnExpedition('emergency');break;
      case 'expedition-camp':dialogs.close();run('home');break;
      case 'journey-rest':dialogs.close();run('home');break;
      case 'millennium-start':void callbacks.startMillennium();break;
      case 'start-button':state.started=true;dialogs.close();callbacks.save();break;
      case 'evolve-confirm':{const result=run('evolve',dialogs.candidate);if(result?.ok){dialogs.evolutionUpdated();callbacks.save();}break;}
      case 'hatch-button':{const result=run('hatch');if(result?.ok)dialogs.close();break;}
      case 'pause-button':callbacks.pause();break;
      case 'audio-toggle':callbacks.toggleAudio();break;
      case 'interact-button':run('interact');break;
      case 'return-button':run('home');break;
      case 'rally-button':run('rally');break;
      case 'trial-start':{const result=run('startTrial');if(result?.ok)dialogs.close();break;}
      case 'reinforce-nest':{const result=run('reinforceNest');if(result?.ok)dialogs.close();break;}
      case 'load-provisions':{const result=run('provisions',false);if(result?.ok)dialogs.close();break;}
      case 'return-provisions':{const result=run('provisions',true);if(result?.ok)dialogs.close();break;}
      case 'map-home':world?.focusHome();break;
      case 'explore-button':hud.toggle();break;
      case 'camera-follow':dialogs.close();world?.focusPlayer();break;
      case 'camera-in':world?.zoom(.82);break;
      case 'camera-out':world?.zoom(1.2);break;
      case 'selection-action':{
        const guide=coach.current;if(!guide)break;
        if(guide.target==='gather'){coach.ack('gather');callbacks.selectedAction();}
        else if(guide.target==='home')run('home');else if(guide.target==='explore')callbacks.guideExplore();else openPanel(guide.target);
        break;
      }
      case 'guide-dismiss':coach.ack();break;
      case 'target-clear':callbacks.clearTarget();break;
      case 'creature-menu-close':closeCreatureMenu();break;
      case 'export-save':callbacks.exportSave();break;
      case 'import-save-button':document.getElementById('import-save').click();break;
      case 'reset-button':btn.id='confirm-reset';btn.textContent=msg("确认开启新旅程");set('save-feedback',msg("当前旅程会先保存一份本机备份，再开启新旅程。"));break;
      case 'confirm-reset':callbacks.reset();break;
    }
  });
  document.getElementById('interface').addEventListener('change',e=>{if(e.target.id==='import-save'&&e.target.files[0])callbacks.importSave(e.target.files[0]);});
  document.getElementById('interface').addEventListener('input',e=>{if(e.target.dataset.audioVolume)callbacks.audioVolume(e.target.dataset.audioVolume,e.target.value);});
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
    if(state.mapId==='home')for(const [i,point] of RIVAL_SITES.entries())if((state.habitatHealth?.rivals?.stage||0)>i){ctx.strokeStyle='#a25636';ctx.lineWidth=2;ctx.beginPath();ctx.arc(center.x+point.x*scale,center.y+point.z*scale,9,0,Math.PI*2);ctx.stroke();}
    for(const r of state.resources.filter(r=>r.sampleIndex!==undefined&&r.amount>0)){ctx.fillStyle='#e2ba4f';ctx.strokeStyle='#5b6040';ctx.lineWidth=2;ctx.beginPath();ctx.arc(center.x+r.x*scale,center.y+r.z*scale,7,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.fillStyle='#344b40';ctx.font='bold 11px sans-serif';ctx.textAlign='center';ctx.fillText(String(r.sampleIndex+1),center.x+r.x*scale,center.y+r.z*scale+4);}
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
    hud.update();
    const outlook=foodOutlook(state),supply=document.getElementById('survival-strip');
    const ecoDanger=['endangered','critical','recovering'].includes(state.habitatHealth?.level);
    supply.hidden=!ecoDanger;supply.textContent=state.habitatHealth?.critical?msg("岛上的生命正在减少 · 查看保护办法"):msg("留意野生种群 · 查看岛屿生态");
    supply.setAttribute('aria-label',supply.textContent);document.body.classList.toggle('on-expedition',!!state.journey?.active);
    const systems=visibleSystems(state);
    document.querySelector('.resource-icon.gene').closest('.resource').hidden=!systems.evolve;
    document.querySelector('.resource-icon.material').closest('.resource').hidden=!systems.colony;
    document.querySelector('.resource.population').hidden=!systems.colony;
    for(const name of ['evolve','colony','journal','journey']){const button=document.querySelector(`.action-bar [data-panel="${tr(name)}"]`);if(button)button.hidden=!systems[name];}
    document.getElementById('chapter-button').hidden=!systems.chapter;
    document.getElementById('weather-toggle').hidden=!systems.weather;
    document.querySelector('.time-controls [data-speed="2"]').hidden=!systems.colony;
    document.getElementById('rally-button').hidden=!systems.rally;
    document.getElementById('return-button').hidden=!state.metrics.gathered&&!state.metrics.deposited;
    supply.dataset.level=state.habitatHealth?.critical?'critical':state.survival?.level||'fed';
    const run=state.journey.active;
    const status=document.getElementById('expedition-status');status.hidden=!run;
    if(run)status.textContent=msg("潮生岛 · 样本 {p0}/3 · {p1} ›",{p0:tr(run.samples.length),p1:tr(remaining(run.deadline-state.time))});
    set('map-name',run?msg("潮生岛远征"):state.journey.era?msg("裂潮家园"):msg("初生之岛"));
    document.getElementById('expedition-button').classList.toggle('guide-highlight',!coach.current&&!state.hints?.journeyIntro&&departureChoice(state,'glowflower').ok);

    set('food-value',n(state.colony.food));set('material-value',n(state.colony.material));set('dna-value',n(state.colony.dna));set('population-value',`${tr(population(state))} / ${tr(state.colony.capacity)}`);
    const env=environment(state);
    const d=dayInfo(state),biome=biomeAt(state.player.x,state.player.z);
    set('day-value',msg("{p0}第 {p1} 天",{p0:tr(state.journey.era?msg("后裔 · "):''),p1:tr(d.day)}));set('hour-value',`${tr(String(Math.floor(d.hour)).padStart(2,'0'))}:${tr(String(Math.floor(d.hour%1*60)).padStart(2,'0'))}`);set('biome-name',biome.name);
    const weather=state.weather==='rain'?'water':d.hour>18||d.hour<6?'moon':'sun',wi=document.getElementById('weather-icon');
    if(wi.dataset.weather!==weather){wi.innerHTML=icon(weather);wi.dataset.weather=weather;}
    const q=QUESTS[state.quest];
    set('quest-title',q?.title||msg("家园的下一步"));set('quest-description',q?.description||msg("基础旅程已完成。查看初岛安居目标，准备迎接海上的来客。"));
    set('quest-index',`${tr(String(Math.min(6,state.quest+1)).padStart(2,'0'))} / 06`);set('quest-label',q?.label||msg("基础旅程已完成"));
    const chapter=chapterProgress(state);set('chapter-summary',chapter.won?msg("已达成"):`${tr(chapter.goals.filter(g=>g.value>=g.target).length)} / ${tr(chapter.goals.length)}`);
    set('weather-toggle',`${tr(WEATHER[state.weather].name)} · ${tr(tideValue(state,state.time+1)>tideValue(state)?msg("涨潮"):msg("退潮"))} ›`);
    set('quest-count',q?`${tr(Math.min(q.target,Math.floor(state.metrics[q.metric]||0)))} / ${tr(q.target)}`:'6 / 6');bar('quest-bar',q?(state.metrics[q.metric]||0)/q.target*100:100);set('quest-reward',q?msg("+{p0} 进化点",{p0:tr(q.reward)}):msg("自由探索"));
    set('chapter-label',run?msg("远征目标"):state.journey.era?msg("风潮立足"):msg("初岛安居"));
    if(run){const c=CONTRACTS.find(c=>c.id===run.contractId);set('quest-title',c.name);set('quest-description',msg("收集三个样本，回营地返航。避开猎食者，受伤时先回营地。"));set('quest-index',msg("远征"));set('quest-label',c.sample);set('quest-count',`${tr(run.samples.length)} / 3`);set('quest-reward',state.journey.rewards.includes(c.id)?msg("+8 进化点"):c.reward);bar('quest-bar',run.samples.length/3*100);set('chapter-summary',`${tr(run.samples.length)} / 3`);}
    else if(state.journey.era){set('quest-title',msg("让家园与远方相连"));set('quest-description',msg("完成三次远征、带回三种景观，照料族群在风潮之间生活。"));set('quest-index',msg("后裔时代"));}
    set('habitat-stage-label',habitatStage(state).name);
    set('colony-status',state.colony.food<8?msg("需要更多食物"):state.colony.egg?msg("新生命正在孵育"):msg("生活安稳"));
    for(const id of Object.keys(JOBS))set('job-'+id,state.agents.filter(a=>a.kind==='companion'&&!isJuvenile(state,a)&&a.job===id).length);
    const project=state.buildings.find(b=>b.progress<1);document.getElementById('construction').hidden=!project;
    if(project){set('construction-name',msg("营造{p0}",{p0:tr(BUILDINGS.find(b=>b.id===project.kind).name)}));set('construction-percent',`${tr(Math.floor(project.progress*100))}%`);bar('construction-bar',project.progress*100);}
    set('building-count',msg("{p0} 座设施",{p0:tr(state.buildings.filter(b=>b.progress===1&&b.kind!=='home').length)}));
    set('generation',msg("第 {p0} 代",{p0:tr(state.generation)}));set('species-subtitle',state.parts.length?msg("{p0} 次适应 · {p1}",{p0:tr(state.parts.length),p1:tr(state.parts.includes('fins')?msg("水陆两栖"):msg("陆生杂食"))}):msg("原生种 · 陆生杂食"));
    const stats=speciesStats(state.parts,state.style);bar('health-bar',state.player.hp);bar('stamina-bar',state.player.stamina/stats.stamina*100);set('health-value',Math.ceil(state.player.hp));set('stamina-value',Math.floor(state.player.stamina));
    set('compact-health',Math.ceil(state.player.hp));set('compact-stamina',Math.floor(state.player.stamina));document.getElementById('compact-vitals').classList.toggle('danger',state.player.hp<45);
    if(lastParts!==state.parts.join(',')||force){lastParts=state.parts.join(',');document.getElementById('creature-traits').innerHTML=state.parts.length?state.parts.map(id=>`<span>${tr(EVOLUTIONS.find(e=>e.id===id).name)}</span>`).join(''):`<span>${msg("好奇的探索者")}</span><span>${msg("群居")}</span>`;}
    set('bag-value',msg("背包 {p0} / {p1}",{p0:tr(n(bagTotal(state.player))),p1:tr(stats.carry)}));set('bag-detail',bagTotal(state.player)?msg("{p0} 食物 · {p1} 材料",{p0:tr(n(state.player.carry.food)),p1:tr(n(state.player.carry.material))}):'');
    const mode=world?.actors.get('player')?.root.userData.movementMode;
    document.getElementById('bag-value').dataset.medium=mode||'land';
    if(mode==='swim'||mode==='wade')set('bag-value',msg("{p0} · 背包 {p1} / {p2}",{p0:tr(mode==='swim'?msg("游泳"):msg("趟水")),p1:tr(n(bagTotal(state.player))),p2:tr(stats.carry)}));
    const context=nearbyContext(state);
    set('interaction-label',context?.type==='enemy'?msg("捕食附近猎物"):context?.label||(state.player.path.length?msg("正在前往目的地"):msg("单击采集 / 捕食 · 长按详情")));
    document.getElementById('interact-button').disabled=!context;
    coach.update();
    const recent=state.notifications.filter(e=>state.time-e.time<9&&!['resource','quest'].includes(e.kind)).slice(-2),toastSig=getLocale()+recent.map(e=>e.text+e.time).join('|');
    if(toastSig!==lastToast){lastToast=toastSig;document.getElementById('toasts').innerHTML=recent.map(e=>`<div class="toast ${tr(e.kind)}">${tr(icon(e.kind==='evolve'?'dna':e.kind==='danger'?'shield':'check'))}<span>${tr(safe(e.text))}</span></div>`).join('');}
    set('play-state',state.paused?msg("时间已暂停"):msg("世界正在生长"));
    const pause=document.getElementById('pause-button');if(pause.dataset.paused!==String(state.paused)+getLocale()){pause.innerHTML=icon(state.paused?'play':'pause');pause.setAttribute('aria-label',state.paused?msg("继续"):msg("暂停"));pause.dataset.paused=String(state.paused)+getLocale();}
    document.querySelectorAll('[data-speed]').forEach(el=>el.classList.toggle('active',Number(el.dataset.speed)===state.speed));
    set('map-discovered',msg("探索 {p0} / 4",{p0:tr(state.discovered.length)}));drawMap();dialogs.update();
  }
  onLocaleChange(()=>{
    const focusedLanguage=document.activeElement?.matches('[data-language-select]'),focusedInDialog=!!document.activeElement?.closest('dialog');
    languageSelect.value=getLocale();refreshLocalizedLabels(document.getElementById('interface'));
    for(const el of document.querySelectorAll('[data-job-label]'))el.textContent=tr(JOBS[el.dataset.jobLabel]);
    for(const el of document.querySelectorAll('[data-job]'))el.setAttribute('aria-label',msg(el.dataset.delta==='-1'?'减少{p0}同伴':'增加{p0}同伴',{p0:tr(JOBS[el.dataset.job])}));
    dialogs.relocalize();if(menuTarget)openTargetMenu(menuTarget);update(true);if(focusedLanguage)(focusedInDialog?document.querySelector('dialog[open] [data-language-select]'):languageSelect)?.focus();
  });
  update(true);
  return {update,revealHUD:hud.reveal,toggleHUD:hud.toggle,open(which){openPanel(which);},openTargetMenu,acknowledgeGuide:coach.ack,close(){if(creatureMenu.open)closeCreatureMenu();else dialogs.close();},get panel(){return creatureMenu.open?'creature':dialogs.panel;},get previewHost(){return document.getElementById('portrait');},attachWorld(w){world=w;}};
}
