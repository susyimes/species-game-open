import {habitatInfo} from '../core/ecosystem.js';
import {SPECIES} from '../core/config.js';
import {mapBiomes} from '../core/maps.js';
import {visibleSystems} from './progression.js';

export function populationManagement(s){
  const c=s.colony;
  if(!s.completed.includes('explore')&&!c.egg&&s.metrics.population<=6&&!s.journey?.era&&!s.habitatHealth?.critical&&!s.survival?.guideFood)return '';
  return `<details class="population-settings"><summary>管理族群规模</summary><p>住处和食物充足时会自动孵育；你也可以暂停繁殖。幼体长大后加入劳动。</p><div class="policy-row"><button id="breeding-toggle" aria-pressed="${c.breedingAllowed}">${c.breedingAllowed?'允许繁殖':'暂停繁殖'}</button><span>人口上限</span><button data-population-delta="-1" aria-label="降低人口上限" ${c.populationLimit<=1?'disabled':''}>−</button><b id="population-limit">${c.populationLimit}</b><button data-population-delta="1" aria-label="提高人口上限" ${c.populationLimit>=18?'disabled':''}>+</button></div><p class="fine-print">同伴死亡会减少人口，不会自动回营地复活。</p></details><div class="chapter-actions"><button data-panel="survival" class="secondary-button">岛屿生态</button>${visibleSystems(s).journey?'<button data-panel="journey" class="secondary-button">去远方看看</button>':''}</div>`;
}
export function survivalMarkup(s){
  const h=s.habitatHealth,info=habitatInfo(s),names={healthy:'岛屿生机充足',endangered:'野生种群正在减少',critical:'岛屿需要休养',recovering:'植被正在恢复'};
  const eggs=Object.entries(s.colony.nursery||{}).filter(([,n])=>n>0);
  return `<section class="ecology-management"><div class="survival-heading"><div><small>这座岛的邻居</small><h3>${names[h.level]}</h3></div><strong>${info.total} 只野生生物</strong></div><p>${h.critical?'保留野果、设置禁猎区，再放归不同物种。成熟的繁殖对稳定生活后，岛屿会慢慢恢复。':'野生生物需要同类与食物，才能养育下一代。赤鬃猎兽也会繁殖、巡游并寻找新的领地。'}</p>
  <details class="population-settings" ${h.level!=='healthy'?'open':''}><summary>查看各种群</summary><div class="wild-populations">${info.species.map(row=>`<div class="${row.count?'':'extinct'}"><span>${SPECIES[row.id].name}</span><b>${row.count} 只</b><small>${!row.count?'局部灭绝':row.breeding?'可以繁殖':'需要成熟同类与食物'}</small></div>`).join('')}</div></details>
  <h3>留一片安静的栖息地</h3><div class="refuge-options">${mapBiomes(s).map(b=>`<button data-protect="${b.id}" aria-pressed="${h.protected.includes(b.id)}">${h.protected.includes(b.id)?'✓ ':''}${b.name}</button>`).join('')}</div><button id="reserve-fruit" aria-pressed="${h.reserveFruit}">${h.reserveFruit?'已为野生生物保留野果':'保留保护区野果'}</button><p class="fine-print">禁猎区中不能主动捕猎，遇袭仍可自卫。保留野果，让岛上的邻居有食物养育幼体。</p>
  <h3>让带回的生命安家</h3><div class="nursery-list">${eggs.length?eggs.map(([id,n])=>`<div><span>${SPECIES[id].name} · 卵囊 ${n}</span><button data-release-young="${id}" ${s.journey?.active||n<2?'disabled':''}>放归一对</button></div>`).join(''):'<p>远征可以带回卵囊，在对应的保护区放归。</p>'}</div><p class="fine-print">先留好野果，再放归。幼体需要时间长大。</p>
  ${s.colony.seedStock||s.colony.soilLevel?`<div class="policy-row"><span>耐盐种子 ${s.colony.seedStock||0} · 已补种 ${s.colony.soilLevel||0} / 3</span><button id="plant-seeds" ${s.journey?.active||!s.colony.seedStock||s.colony.soilLevel>=3?'disabled':''}>补种果圃</button></div>`:''}</section>`;
}
