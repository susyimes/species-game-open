import { visibleSystems } from './progression.js';

export function createHud(state,root){
  const panels=[...root.querySelectorAll('.journey-panel,.colony-panel,.creature-panel,.minimap,.controls-hint,#mobile-tip')];
  for(const panel of panels)panel.dataset.autoHide='';
  const explore=root.querySelector('#explore-button'),mini=root.querySelector('#compact-vitals');
  let collapsed=true,signature='';
  function setCollapsed(value){
    const systems=visibleSystems(state);
    signature=JSON.stringify([value,systems]);
    collapsed=value;document.body.classList.toggle('hud-collapsed',value);
    for(const panel of panels){
      const locked=panel.matches('.colony-panel')&&!systems.colony||panel.matches('.creature-panel')&&!systems.evolve||panel.matches('.minimap')&&!systems.evolve;
      panel.hidden=value||locked;panel.inert=panel.hidden;
    }
    mini.hidden=!value&&systems.evolve;explore.setAttribute('aria-expanded',String(!value));
    explore.title=value?'展开面板与地图（1）':'收起面板与地图（1）';
    explore.querySelector('span').textContent=value?'展开面板':'收起面板';
    explore.setAttribute('aria-label',explore.title);explore.classList.toggle('active',!value);
  }
  setCollapsed(true);
  return {reveal(){setCollapsed(false);},toggle(){setCollapsed(!collapsed);},update(){if(JSON.stringify([collapsed,visibleSystems(state)])!==signature)setCollapsed(collapsed);},get collapsed(){return collapsed;}};
}
