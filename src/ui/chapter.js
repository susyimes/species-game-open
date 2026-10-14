import { t as msg, tr, getLocale, onLocaleChange } from "../i18n.js";
import { journeyMarkup } from './journey.js';
import { chapterProgress } from '../core/chapter.js';
import { WEATHER, tideValue, environment } from '../core/weather.js';
import { clockInfo } from '../core/clock.js';

const text=value=>String(tr(value)).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const routeName=id=>({coexist:msg("以食物相迎"),repelled:msg("共同抵御"),shelter:msg("安守家园")}[id]||id);
const duration=n=>`${tr(Math.floor(Math.max(0,n)/60).toString().padStart(2,'0'))}:${tr(Math.floor(Math.max(0,n)%60).toString().padStart(2,'0'))}`;
export function weatherMarkup(s){
  const env=environment(s,s.player),ground=env.wetness>.65?msg("地面湿透"):env.wetness>.15?msg("雨后潮湿"):msg("地面干燥");
  const segments=s.weatherV3.schedule,dir=tideValue(s,s.time+1)>tideValue(s)?msg("涨潮"):msg("退潮");
  return `<p class="chapter-lead">${tr(WEATHER[s.weather].name)} · ${tr(dir)}。${msg("离开页面时，岛上的时间会暂停。")}</p><div class="forecast-list">${tr(segments.map((w,i)=>{
    const clock=clockInfo({time:w.start/20});
    return `<article><span>${tr(i===0?msg("现在"):msg("第 {p0} 日 {p1}:{p2}",{p0:tr(clock.day),p1:tr(String(Math.floor(clock.hour)).padStart(2,'0')),p2:tr(String(Math.floor(clock.hour%1*60)).padStart(2,'0'))}))}</span><strong>${tr(WEATHER[w.id].name)}</strong><small>${tr(i===0?msg("还余 {p0}",{p0:tr(duration((w.end-s.clock.tick)/20))}):msg("持续 {p0}",{p0:tr(duration((w.end-w.start)/20))}))}</small></article>`;
  }).join(''))}</div><div class="weather-effects"><div><strong>${tr(ground)}</strong><p>${msg("雨水会留下积水，晴后逐渐干透。湿地比岩坡更泥泞。")}</p></div><div><strong>${tr(env.sheltered?msg("巢边避风"):env.movement<.99?msg("行路速度 {p0}%",{p0:tr(Math.round(env.movement*100))}):msg("行路平稳"))}</strong><p>${msg("风雨拖慢野外行动和采集；巢边可避风，侧鳍能减轻泥泞影响。")}</p></div><div><strong>${msg("浆果圃产出 ")}${tr(Math.round(env.garden*100))}%</strong><p>${msg("小雨滋养浆果，风雨压低产量。野外浆果也随天气改变生长速度。")}</p></div><div><strong>${tr(env.foodDemand>1?msg("族群需粮增加 12%"):msg("族群正常需粮"))}</strong><p>${msg("风雨时多备食物，留意浅滩涨水。草木和浪花会随风摇动。")}</p></div></div><p class="fine-print">${msg("天气效果随岛上时间推进；暂停或离开页面时，湿润、积水和潮水都不会离线结算。")}</p>`;
}
export function chapterMarkup(s){
  if(s.journey?.active)return journeyMarkup(s);
  if(s.chapter.id==='second_island'){const p=chapterProgress(s);return `<p class="chapter-lead">${msg("后裔时代：带回远方的发现，让家园在风潮之间继续生长。")}</p><div class="chapter-goals">${tr(p.goals.map(g=>`<div class="chapter-goal ${tr(g.value>=g.target?'complete':'')}"><span>${tr(g.label)}</span><strong>${tr(Math.min(g.value,g.target))} / ${tr(g.target)}</strong></div>`).join(''))}</div><div class="stability-card"><strong>${tr(p.won?msg("风潮立足 · 已达成"):msg("安居观察 {p0} / 02:00",{p0:tr(duration(p.stableSeconds))}))}</strong><p>${tr(text(s.chapter.disruption||msg("食物至少 30，巢边无威胁，族群平安。")))}</p></div><button data-panel="journey" class="primary-button">${msg("准备下一次远征")}</button>`;}
  const p=chapterProgress(s),t=s.chapter.trial;
  const trialText=!t?msg("尚未预约"):t.status==='scheduled'?msg("来客将在 {p0} 后靠岸",{p0:tr(duration((t.startTick-s.clock.tick)/20))}):t.status==='active'?msg("风雨还余 {p0}",{p0:tr(duration((t.endTick-s.clock.tick)/20))}):t.status==='departing'?msg("来客正在返回海面"):t.status==='resolved'?msg("已完成：{p0}",{p0:tr(t.completedRoutes.map(routeName).join('、'))}):msg("可以休整后再次预约");
  return `<p class="chapter-lead">${tr(p.won?msg("小芽与同伴已经在初岛安家。继续探索，或导出这段旅程。"):msg("建立家园，认识全岛，照料族群度过一次潮汐来客。"))}</p>
  ${tr(p.won?`<div class="era-invitation"><strong>${msg("家园会留下来，故事可以走向千年之后。")}</strong><p>${msg("建筑、族群、库存与进化保留；外围地形和野生物种将变化。")}</p><button id="millennium-start" class="primary-button">${msg("见证千年")}</button></div>`:'')}
  <div class="chapter-goals">${tr(p.goals.map(g=>`<div class="chapter-goal ${tr(g.value>=g.target?'complete':'')}"><span>${tr(g.value>=g.target?'✓':'○')} ${tr(g.label)}</span><strong>${tr(Math.min(g.value,g.target))} / ${tr(g.target)}</strong></div>`).join(''))}</div>
  <div class="stability-card"><strong>${tr(p.won?msg("初岛安居已达成"):msg("安居观察 {p0} / 03:00",{p0:tr(duration(p.stableSeconds))}))}</strong><p>${tr(p.won?msg("胜利将一直记录在这份存档里。"):text(s.chapter.disruption||msg("保持食物至少 30，巢边无威胁，族群平安。")))}${tr(p.minimumSeconds>0?msg(" · 累计生活还需 {p0}",{p0:tr(duration(p.minimumSeconds))}):'')}</p></div>
  <section class="trial-card"><h3>${msg("潮汐来客")}</h3><p id="trial-status">${tr(text(trialText))}</p><div class="trial-routes"><p><b>${msg("以食物相迎")}</b>${msg("两次各投喂 8 食物，和平相处并送它们离开。")}</p><p><b>${msg("共同抵御")}</b>${msg("召集守卫，迫使来客退回海面。")}</p><p><b>${msg("安守家园")}</b>${msg("预先加固，准备 40 食物，和两位守卫守过风雨。")}</p></div>
  <div class="chapter-actions"><button id="trial-start" class="primary-button" ${tr(p.won?'disabled':'')}>${msg("迎接下一次潮汐")}</button><button id="reinforce-nest" class="secondary-button">${tr(t?.reinforced?msg("本次已加固"):msg("加固巢区 · 12 材料"))}</button></div></section>
  <div class="chapter-actions"><button id="load-provisions" class="secondary-button">${msg("携带 8 食物")}</button><button id="return-provisions" class="secondary-button">${msg("归还口粮")}</button><button id="export-save" class="secondary-button">${msg("导出旅程")}</button></div><p class="fine-print">${msg("携带口粮、加固和预约需靠近巢穴。基础旅程完成并累计游玩 15 分钟（含远征）后可预约考验。获胜后仍可留在本岛生活。")}</p>`;
}
