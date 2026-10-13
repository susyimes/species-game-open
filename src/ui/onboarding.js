import { nextGuide, nextObjective, acknowledgeGuide } from '../core/onboarding.js';

export function createOnboarding(state,root,save){
  const panel=root.querySelector('#onboarding'),text=root.querySelector('#guide-text'),label=root.querySelector('#guide-label');
  const buttons={home:root.querySelector('#return-button'),evolve:root.querySelector('.action-bar [data-panel="evolve"]'),colony:root.querySelector('.action-bar [data-panel="colony"]'),journal:root.querySelector('.action-bar [data-panel="journal"]'),chapter:root.querySelector('#chapter-button')};
  let current=null;
  buttons.survival=root.querySelector('#survival-strip');
  function update(){
    current=nextGuide(state)||nextObjective(state);
    const visible=!!current&&!state.paused&&state.player.target?.type!=='enemy';
    panel.hidden=!visible;document.body.classList.toggle('has-guide',visible);
    root.querySelector('#guide-dismiss').hidden=!!current?.objective;
    if(current){text.textContent=current.text;label.textContent=current.label+' ›';panel.dataset.guide=current.id;}
    else delete panel.dataset.guide;
    for(const [target,button] of Object.entries(buttons)){
      const active=!!current&&current.target===target;button.classList.toggle('guide-highlight',active);
      if(active&&visible)button.setAttribute('aria-describedby','guide-text');else button.removeAttribute('aria-describedby');
    }
  }
  return {update,get current(){return current;},ack(target=null){
    if(acknowledgeGuide(state,target)){void save();update();return true;}return false;
  }};
}
