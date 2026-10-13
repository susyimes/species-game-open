import {AUDIO_IDS,AUDIO_KEY,readAudioSettings,audioSettings} from './settings.js';

const cooldowns={evolve:1.7,deposit:.8,'gather-leaf':.35,'gather-stone':.35,impact:.3,splash:.85};
export class AudioMixer{
  constructor({storage,contextFactory=()=>new (globalThis.AudioContext||globalThis.webkitAudioContext)(),fetcher=(...args)=>globalThis.fetch(...args),base=import.meta.env?.BASE_URL||'/'}={}){
    if(!storage)try{storage=globalThis.localStorage;}catch{}
    Object.assign(this,{storage,contextFactory,fetcher,base});this.settings=readAudioSettings(storage);
    this.context=null;this.unlocked=false;this.disposed=false;this.scene={active:false};this.buffers=new Map();this.loading=new Map();this.retryAt=new Map();this.slots=new Map();this.effects=new Set();this.last=new Map();this.stats={played:0,failed:0};this.playEpoch=0;this.prewarmed=false;
  }
  get audible(){return this.unlocked&&!this.disposed&&this.scene.active&&!this.settings.muted;}
  unlock(){
    if(this.disposed)return;
    try{
      if(!this.context){
        const c=this.context=this.contextFactory(),limiter=c.createDynamicsCompressor();
        limiter.threshold.value=-12;limiter.knee.value=10;limiter.ratio.value=6;limiter.connect(c.destination);
        this.buses={};for(const name of ['music','effects','ambience']){const bus=c.createGain();bus.connect(limiter);this.buses[name]=bus;}
      }
      this.unlocked=true;
      // Called synchronously in a real gesture, including when the welcome screen is still open.
      this.resume();
    }catch{this.unlocked=false;this.stats.failed++;}
  }
  resume(){
    if(!this.context||this.resumeTask)return;
    this.resumeTask=Promise.resolve(this.context.resume()).then(()=>{if(!this.audible)return this.context.suspend();}).catch(()=>{}).finally(()=>{this.resumeTask=null;});
  }
  setSettings(patch){
    this.playEpoch++;
    this.settings=audioSettings({...this.settings,...patch});try{this.storage.setItem(AUDIO_KEY,JSON.stringify(this.settings));}catch{}
    this.sync(this.scene);
  }
  sync(scene){
    const wasAudible=this.audible;this.scene=scene;const c=this.context;if(!c||this.disposed)return;
    if(!this.audible){
      if(wasAudible)this.playEpoch++;
      for(const voice of this.effects)this.stop(voice);this.effects.clear();
      if(c.state==='running')void c.suspend().catch(()=>{});return;
    }
    if(c.state!=='running'&&c.state!=='closed')this.resume();
    if(!this.prewarmed){this.prewarmed=true;for(const id of AUDIO_IDS.filter(id=>!id.startsWith('island-')&&!['rain','surf'].includes(id)))void this.load(id);}
    this.gain(this.buses.music.gain,this.settings.music*(scene.musicGain??1),.3);
    this.gain(this.buses.effects.gain,this.settings.effects,.06);
    this.gain(this.buses.ambience.gain,this.settings.ambience,.4);
    this.loop('music',this.settings.music>0?scene.music:null,1,'music');
    this.loop('rain',this.settings.ambience>0&&scene.rain>0?'rain':null,scene.rain||0,'ambience');
    this.loop('surf',this.settings.ambience>0&&scene.surf>.025?'surf':null,scene.surf||0,'ambience');
  }
  gain(param,value,seconds){const t=this.context.currentTime;param.cancelScheduledValues(t);param.setValueAtTime(param.value,t);param.linearRampToValueAtTime(value,t+seconds);}
  async load(id){
    if(!AUDIO_IDS.includes(id)||this.disposed)return null;
    if(this.buffers.has(id))return this.buffers.get(id);
    if(this.loading.has(id))return this.loading.get(id);
    if((this.retryAt.get(id)||0)>Date.now())return null;
    const job=(async()=>{
      for(const format of ['ogg','mp3']){
        const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
        try{
          const response=await this.fetcher(`${this.base}audio/${id}.${format}`,{signal:abort.signal});if(!response.ok)throw new Error('Audio unavailable');
          const buffer=await this.context.decodeAudioData(await response.arrayBuffer());
          if(!this.disposed)this.buffers.set(id,buffer);return buffer;
        }catch{ /* Codec fallback and a quiet retry later; audio never blocks a playable world. */ }
        finally{clearTimeout(timer);}
      }
      this.stats.failed++;this.retryAt.set(id,Date.now()+15000);return null;
    })();
    this.loading.set(id,job);try{return await job;}finally{this.loading.delete(id);}
  }
  voice(buffer,bus,{loop=false,volume=1,rate=1}={}){
    const c=this.context,source=c.createBufferSource(),gain=c.createGain(),voice={source,gain,loop};
    source.buffer=buffer;source.loop=loop;source.playbackRate.value=rate;gain.gain.value=volume;source.connect(gain);gain.connect(this.buses[bus]);
    source.onended=()=>{this.effects.delete(voice);source.disconnect();gain.disconnect();};
    source.start();return voice;
  }
  stop(voice,fade=0){
    if(!voice)return;try{if(fade)this.gain(voice.gain.gain,0,fade);voice.source.stop(this.context.currentTime+fade);}catch{}
  }
  loop(name,id,volume,bus){
    let slot=this.slots.get(name);if(!slot){slot={id:null,voice:null,pending:null};this.slots.set(name,slot);}
    if(!id){slot.pending=null;this.stop(slot.voice,.8);slot.voice=null;slot.id=null;return;}
    if(slot.id===id){slot.pending=null;this.gain(slot.voice.gain.gain,volume,.8);return;}
    if(slot.pending?.id===id)return;
    const request={id};slot.pending=request;
    void this.load(id).then(buffer=>{
      if(slot.pending!==request)return;slot.pending=null;
      if(!buffer||!this.audible)return;
      const old=slot.voice;slot.voice=this.voice(buffer,bus,{loop:true,volume:0});slot.id=id;
      this.gain(slot.voice.gain.gain,volume,2);this.stop(old,2);
    }).catch(()=>{});
  }
  play({id,volume=1,rate=1}){
    if(!this.audible||!this.settings.effects||this.context.state!=='running')return;
    const now=this.context.currentTime;if(now-(this.last.get(id)??-100)<(cooldowns[id]??.5)||this.effects.size>=4)return;
    this.last.set(id,now);const issued=Date.now(),epoch=this.playEpoch;
    void this.load(id).then(buffer=>{
      if(!buffer||epoch!==this.playEpoch||!this.audible||this.context.state!=='running'||Date.now()-issued>800||this.effects.size>=4)return;
      const voice=this.voice(buffer,'effects',{volume,rate:rate*(.98+(this.stats.played%3)*.02)});this.effects.add(voice);this.stats.played++;
    }).catch(()=>{});
  }
  inspect(){return {unlocked:this.unlocked,audible:this.audible,context:this.context?.state||'locked',settings:{...this.settings},buffers:[...this.buffers.keys()],loops:[...this.slots.entries()].filter(([,s])=>s.voice).map(([name,s])=>({name,id:s.id})),effects:this.effects.size,...this.stats};}
  dispose(){this.disposed=true;for(const s of this.slots.values())this.stop(s.voice);for(const e of this.effects)this.stop(e);void this.context?.close().catch(()=>{});this.buffers.clear();}
}
