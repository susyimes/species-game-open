import {AudioMixer} from './mixer.js';
import {SoundDirector,soundscape} from './director.js';
import {icon} from '../ui/icons.js';

export function createGameAudio(getState,getMode,getFlags){
  const mixer=new AudioMixer(),director=new SoundDirector();let lastControls='';
  function controls(){
    const s=mixer.settings,signature=JSON.stringify(s),button=document.getElementById('audio-toggle');
    if(button&&signature!==lastControls){
      button.innerHTML=icon(s.muted?'soundOff':'sound');button.setAttribute('aria-pressed',String(!s.muted));
      button.setAttribute('aria-label',s.muted?'开启音乐与音效':'关闭音乐与音效');button.title=s.muted?'声音已关闭':'声音已开启 · 音量可在帮助中调整';lastControls=signature;
    }
    for(const input of document.querySelectorAll('[data-audio-volume]')){
      const value=Math.round(s[input.dataset.audioVolume]*100);if(input!==document.activeElement)input.value=String(value);
      const output=document.getElementById('volume-'+input.dataset.audioVolume);if(output)output.textContent=value+'%';
    }
  }
  function update(){
    const s=getState(),mode=getMode();mixer.sync(soundscape(s,mode,getFlags()));
    for(const cue of director.sample(s,mode))mixer.play(cue);controls();
  }
  const gesture=e=>{if(e.isTrusted&&!mixer.unlocked){mixer.unlock();update();}};
  document.addEventListener('pointerdown',gesture,{passive:true});document.addEventListener('keydown',gesture);
  window.addEventListener('pagehide',e=>{if(e.persisted)mixer.sync({...mixer.scene,active:false});else mixer.dispose();});
  window.addEventListener('pageshow',e=>{if(e.persisted)update();});
  return {update,toggle(){mixer.setSettings({muted:!mixer.settings.muted});controls();},
    volume(key,value){if(['music','effects','ambience'].includes(key)){mixer.setSettings({[key]:Number(value)/100});controls();}},
    settingsMarkup(){return `<section class="audio-settings"><h3>声音</h3>${Object.entries({music:'音乐',effects:'动作音效',ambience:'雨水与海浪'}).map(([key,label])=>`<label><span>${label}</span><input type="range" min="0" max="100" step="1" data-audio-volume="${key}" aria-label="${label}音量" value="${Math.round(mixer.settings[key]*100)}"><output id="volume-${key}">${Math.round(mixer.settings[key]*100)}%</output></label>`).join('')}</section>`;},
    inspect:()=>mixer.inspect()};
}
