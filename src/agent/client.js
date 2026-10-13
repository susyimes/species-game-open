import { digest, newIdentity } from '../core/persistence-v3.js';
import { ECOLOGY_TIMING } from '../core/ecology-commands.js';

const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export function createAgentClient(state){
  const e=state.ecology;
  e.runEpoch=newIdentity();e.modelEnabled=false;e.pending=[];e.outbox=[];e.inbox=[];
  const telemetry={mode:'rule',requested:0,ready:0,failed:0,attempts:[],busy:false};
  let nextAttempt=0,stopped=false,failureCount=0,backoffUntil=0;
  async function start(){
    try{
      const health=await fetch('/api/ecology/health',{signal:AbortSignal.timeout(5000)});
      if(!health.ok)return;
      const info=await health.json();if(info.mode!=='model'&&info.mode!=='mock')return;
      const res=await fetch('/api/ecology/session',{method:'POST',signal:AbortSignal.timeout(5000)});
      if(!res.ok)return;
      telemetry.mode=info.mode;e.modelEnabled=true;
    }catch{telemetry.mode='rule';}
  }
  async function send(batch){
    telemetry.busy=true;telemetry.requested++;nextAttempt=Date.now()+45000;
    const epoch=e.runEpoch;
    try{
      const observation={schema_version:1,rules_version:state.rulesVersion,source_tick:batch.source_tick,world_id:state.journey?.active?.id||state.mapId||'home',roles:batch.roles,
        opportunities:batch.opportunities.map(({targets,reservationId,...op})=>op)};
      const hash=await digest(JSON.stringify(observation));
      const response=await fetch('/api/ecology/decisions',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({request_id:newIdentity(),save_id:state.saveId,run_epoch:epoch,observation_hash:hash,observation}),signal:AbortSignal.timeout(5000)});
      if(!response.ok){if(response.status===401||response.status===403)e.modelEnabled=false;throw new Error(`http_${response.status}`);}
      const job=await response.json();
      const deadline=Date.now()+ECOLOGY_TIMING.pollMs;
      for(let i=0;Date.now()<deadline&&!stopped;i++){
        await pause(Math.min(2000,750+i*150));
        if(epoch!==e.runEpoch||batch.closed||state.clock.tick>batch.acceptByTick)return;
        if(document.hidden)return;
        const result=await fetch(`/api/ecology/decisions/${encodeURIComponent(job.job_id)}`,{signal:AbortSignal.timeout(4000)});
        if(!result.ok)throw new Error('job_unavailable');
        const data=await result.json();
        if(data.observation_hash!==hash||data.run_epoch!==epoch)throw new Error('response_binding');
        if(data.status==='ready'){
          telemetry.ready++;failureCount=0;telemetry.attempts.push(data.telemetry);telemetry.attempts=telemetry.attempts.slice(-60);
          e.inbox.push({batchId:batch.id,jobId:job.job_id,output:data.output,source:telemetry.mode});return;
        }
        if(['failed','expired'].includes(data.status))throw new Error(data.failure||'provider_failure');
      }
    }catch(error){telemetry.failed++;telemetry.lastFailure=String(error.message).slice(0,100);if(++failureCount>=3){backoffUntil=Date.now()+300000;failureCount=0;}}
    finally{telemetry.busy=false;}
  }
  return {telemetry,start,pump(){
    for(const receipt of (e.receipts||[]).splice(0)){
      const {jobId,...body}=receipt;void fetch(`/api/ecology/decisions/${encodeURIComponent(jobId)}/receipt`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(4000)}).catch(()=>{});
    }
    e.outbox=e.outbox.filter(b=>!b.closed&&b.epoch===e.runEpoch&&state.clock.tick<=b.acceptByTick);
    if(!stopped&&!telemetry.busy&&e.modelEnabled&&e.outbox.length&&Date.now()>=Math.max(nextAttempt,backoffUntil))void send(e.outbox.shift());
  },stop(){stopped=true;e.modelEnabled=false;e.runEpoch=newIdentity();e.outbox=[];e.inbox=[];e.pending=[];}};
}
