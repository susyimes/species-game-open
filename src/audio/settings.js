export const AUDIO_KEY='zhongxi-audio-v1';
export const AUDIO_DEFAULTS=Object.freeze({muted:false,music:.38,effects:.65,ambience:.42});
export const AUDIO_IDS=['island-day','island-night','island-expedition','gather-leaf','gather-stone','deposit','evolve','impact','splash','rain','surf'];
export function audioSettings(value){
  const result={...AUDIO_DEFAULTS,muted:typeof value?.muted==='boolean'?value.muted:false};
  for(const key of ['music','effects','ambience'])if(Number.isFinite(value?.[key]))result[key]=Math.max(0,Math.min(1,value[key]));
  return result;
}
export function readAudioSettings(storage){try{return audioSettings(JSON.parse(storage.getItem(AUDIO_KEY)));}catch{return audioSettings();}}
