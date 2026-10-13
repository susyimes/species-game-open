import { journeyMarkup } from './journey.js';
import { chapterProgress } from '../core/chapter.js';
import { WEATHER, tideValue, environment } from '../core/weather.js';
import { clockInfo } from '../core/clock.js';

const text=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const routeName=id=>({coexist:'以食物相迎',repelled:'共同抵御',shelter:'安守家园'}[id]||id);
const duration=n=>`${Math.floor(Math.max(0,n)/60).toString().padStart(2,'0')}:${Math.floor(Math.max(0,n)%60).toString().padStart(2,'0')}`;
export function weatherMarkup(s){
  const env=environment(s,s.player),ground=env.wetness>.65?'地面湿透':env.wetness>.15?'雨后潮湿':'地面干燥';
  const segments=s.weatherV3.schedule,dir=tideValue(s,s.time+1)>tideValue(s)?'涨潮':'退潮';
  return `<p class="chapter-lead">${WEATHER[s.weather].name} · ${dir}。离开页面时，岛上的时间会暂停。</p><div class="forecast-list">${segments.map((w,i)=>{
    const clock=clockInfo({time:w.start/20});
    return `<article><span>${i===0?'现在':`第 ${clock.day} 日 ${String(Math.floor(clock.hour)).padStart(2,'0')}:${String(Math.floor(clock.hour%1*60)).padStart(2,'0')}`}</span><strong>${WEATHER[w.id].name}</strong><small>${i===0?`还余 ${duration((w.end-s.clock.tick)/20)}`:`持续 ${duration((w.end-w.start)/20)}`}</small></article>`;
  }).join('')}</div><div class="weather-effects"><div><strong>${ground}</strong><p>雨水会留下积水，晴后逐渐干透。湿地比岩坡更泥泞。</p></div><div><strong>${env.sheltered?'巢边避风':env.movement<.99?`行路速度 ${Math.round(env.movement*100)}%`:'行路平稳'}</strong><p>风雨拖慢野外行动和采集；巢边可避风，侧鳍能减轻泥泞影响。</p></div><div><strong>浆果圃产出 ${Math.round(env.garden*100)}%</strong><p>小雨滋养浆果，风雨压低产量。野外浆果也随天气改变生长速度。</p></div><div><strong>${env.foodDemand>1?'族群需粮增加 12%':'族群正常需粮'}</strong><p>风雨时多备食物，留意浅滩涨水。草木和浪花会随风摇动。</p></div></div><p class="fine-print">天气效果随岛上时间推进；暂停或离开页面时，湿润、积水和潮水都不会离线结算。</p>`;
}
export function chapterMarkup(s){
  if(s.journey?.active)return journeyMarkup(s);
  if(s.chapter.id==='second_island'){const p=chapterProgress(s);return `<p class="chapter-lead">后裔时代：带回远方的发现，让家园在风潮之间继续生长。</p><div class="chapter-goals">${p.goals.map(g=>`<div class="chapter-goal ${g.value>=g.target?'complete':''}"><span>${g.label}</span><strong>${Math.min(g.value,g.target)} / ${g.target}</strong></div>`).join('')}</div><div class="stability-card"><strong>${p.won?'风潮立足 · 已达成':`安居观察 ${duration(p.stableSeconds)} / 02:00`}</strong><p>${text(s.chapter.disruption||'食物至少 30，巢边无威胁，族群平安。')}</p></div><button data-panel="journey" class="primary-button">准备下一次远征</button>`;}
  const p=chapterProgress(s),t=s.chapter.trial;
  const trialText=!t?'尚未预约':t.status==='scheduled'?`来客将在 ${duration((t.startTick-s.clock.tick)/20)} 后靠岸`:t.status==='active'?`风雨还余 ${duration((t.endTick-s.clock.tick)/20)}`:t.status==='departing'?'来客正在返回海面':t.status==='resolved'?`已完成：${t.completedRoutes.map(routeName).join('、')}`:'可以休整后再次预约';
  return `<p class="chapter-lead">${p.won?'小芽与同伴已经在初岛安家。继续探索，或导出这段旅程。':'建立家园，认识全岛，照料族群度过一次潮汐来客。'}</p>
  ${p.won?'<div class="era-invitation"><strong>家园会留下来，故事可以走向千年之后。</strong><p>建筑、族群、库存与进化保留；外围地形和野生物种将变化。</p><button id="millennium-start" class="primary-button">见证千年</button></div>':''}
  <div class="chapter-goals">${p.goals.map(g=>`<div class="chapter-goal ${g.value>=g.target?'complete':''}"><span>${g.value>=g.target?'✓':'○'} ${g.label}</span><strong>${Math.min(g.value,g.target)} / ${g.target}</strong></div>`).join('')}</div>
  <div class="stability-card"><strong>${p.won?'初岛安居已达成':`安居观察 ${duration(p.stableSeconds)} / 03:00`}</strong><p>${p.won?'胜利将一直记录在这份存档里。':text(s.chapter.disruption||'保持食物至少 30，巢边无威胁，族群平安。')}${p.minimumSeconds>0?` · 累计生活还需 ${duration(p.minimumSeconds)}`:''}</p></div>
  <section class="trial-card"><h3>潮汐来客</h3><p id="trial-status">${text(trialText)}</p><div class="trial-routes"><p><b>以食物相迎</b>两次各投喂 8 食物，和平相处并送它们离开。</p><p><b>共同抵御</b>召集守卫，迫使来客退回海面。</p><p><b>安守家园</b>预先加固，准备 40 食物，和两位守卫守过风雨。</p></div>
  <div class="chapter-actions"><button id="trial-start" class="primary-button" ${p.won?'disabled':''}>迎接下一次潮汐</button><button id="reinforce-nest" class="secondary-button">${t?.reinforced?'本次已加固':'加固巢区 · 12 材料'}</button></div></section>
  <div class="chapter-actions"><button id="load-provisions" class="secondary-button">携带 8 食物</button><button id="return-provisions" class="secondary-button">归还口粮</button><button id="export-save" class="secondary-button">导出旅程</button></div><p class="fine-print">携带口粮、加固和预约需靠近巢穴。基础旅程完成并累计游玩 15 分钟（含远征）后可预约考验。获胜后仍可留在本岛生活。</p>`;
}
