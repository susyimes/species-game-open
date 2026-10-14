import { t as msg, tr, getLocale, onLocaleChange } from "../i18n.js";
import {habitatInfo} from '../core/ecosystem.js';
import {SPECIES} from '../core/config.js';
import {mapBiomes} from '../core/maps.js';
import {visibleSystems} from './progression.js';

export function populationManagement(s){
  const c=s.colony;
  if(!s.completed.includes('explore')&&!c.egg&&s.metrics.population<=6&&!s.journey?.era&&!s.habitatHealth?.critical&&!s.survival?.guideFood)return '';
  return `<details class="population-settings"><summary>${msg("管理族群规模")}</summary><p>${msg("住处和食物充足时会自动孵育；你也可以暂停繁殖。幼体长大后加入劳动。")}</p><div class="policy-row"><button id="breeding-toggle" aria-pressed="${tr(c.breedingAllowed)}">${tr(c.breedingAllowed?msg("允许繁殖"):msg("暂停繁殖"))}</button><span>${msg("人口上限")}</span><button data-population-delta="-1" aria-label="${msg("降低人口上限")}" ${tr(c.populationLimit<=1?'disabled':'')}>−</button><b id="population-limit">${tr(c.populationLimit)}</b><button data-population-delta="1" aria-label="${msg("提高人口上限")}" ${tr(c.populationLimit>=18?'disabled':'')}>+</button></div><p class="fine-print">${msg("同伴死亡会减少人口，不会自动回营地复活。")}</p></details><div class="chapter-actions"><button data-panel="survival" class="secondary-button">${msg("岛屿生态")}</button>${tr(visibleSystems(s).journey?`<button data-panel="journey" class="secondary-button">${msg("去远方看看")}</button>`:'')}</div>`;
}
export function survivalMarkup(s){
  const h=s.habitatHealth,info=habitatInfo(s),names={healthy:msg("岛屿生机充足"),endangered:msg("野生种群正在减少"),critical:msg("岛屿需要休养"),recovering:msg("植被正在恢复")};
  const eggs=Object.entries(s.colony.nursery||{}).filter(([,n])=>n>0);
  return `<section class="ecology-management"><div class="survival-heading"><div><small>${msg("这座岛的邻居")}</small><h3>${tr(names[h.level])}</h3></div><strong>${tr(info.total)} ${msg("只野生生物")}</strong></div><p>${tr(h.critical?msg("保留野果、设置禁猎区，再放归不同物种。成熟的繁殖对稳定生活后，岛屿会慢慢恢复。"):msg("野生生物需要同类与食物，才能养育下一代。赤鬃猎兽也会繁殖、巡游并寻找新的领地。"))}</p>
  <details class="population-settings" ${tr(h.level!=='healthy'?'open':'')}><summary>${msg("查看各种群")}</summary><div class="wild-populations">${tr(info.species.map(row=>`<div class="${tr(row.count?'':'extinct')}"><span>${tr(SPECIES[row.id].name)}</span><b>${tr(row.count)} ${msg("只")}</b><small>${tr(!row.count?msg("局部灭绝"):row.breeding?msg("可以繁殖"):msg("需要成熟同类与食物"))}</small></div>`).join(''))}</div></details>
  <h3>${msg("留一片安静的栖息地")}</h3><div class="refuge-options">${tr(mapBiomes(s).map(b=>`<button data-protect="${tr(b.id)}" aria-pressed="${tr(h.protected.includes(b.id))}">${tr(h.protected.includes(b.id)?'✓ ':'')}${tr(b.name)}</button>`).join(''))}</div><button id="reserve-fruit" aria-pressed="${tr(h.reserveFruit)}">${tr(h.reserveFruit?msg("已为野生生物保留野果"):msg("保留保护区野果"))}</button><p class="fine-print">${msg("禁猎区中不能主动捕猎，遇袭仍可自卫。保留野果，让岛上的邻居有食物养育幼体。")}</p>
  <h3>${msg("让带回的生命安家")}</h3><div class="nursery-list">${tr(eggs.length?eggs.map(([id,n])=>`<div><span>${tr(SPECIES[id].name)} · ${msg("卵囊 ")}${tr(n)}</span><button data-release-young="${tr(id)}" ${tr(s.journey?.active||n<2?'disabled':'')}>${msg("放归一对")}</button></div>`).join(''):`<p>${msg("远征可以带回卵囊，在对应的保护区放归。")}</p>`)}</div><p class="fine-print">${msg("先留好野果，再放归。幼体需要时间长大。")}</p>
  ${tr(s.colony.seedStock||s.colony.soilLevel?`<div class="policy-row"><span>${msg("耐盐种子 ")}${tr(s.colony.seedStock||0)} · ${msg("已补种 ")}${tr(s.colony.soilLevel||0)} / 3</span><button id="plant-seeds" ${tr(s.journey?.active||!s.colony.seedStock||s.colony.soilLevel>=3?'disabled':'')}>${msg("补种果圃")}</button></div>`:'')}</section>`;
}
