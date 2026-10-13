import { createEcologyServer } from '../server/ecology/server.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createState } from '../src/core/state.js';
import { ecologyTick } from '../src/core/ecology.js';
import { ECOLOGY_TIMING } from '../src/core/ecology-commands.js';

const fallbackProbe=process.argv.includes('--fallback');
const timeout=Number(process.argv.find(arg=>arg.startsWith('--timeout-ms='))?.split('=')[1]||ECOLOGY_TIMING.requestMs);
const app=createEcologyServer({dbPath:':memory:',mode:'model',timeout,...(process.argv.includes('--no-fallback')?{fallbackModel:'off'}:{}),
  ...(fallbackProbe?{model:'ecology-unavailable-primary-probe'}:{})});
try{
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const s=createState();s.time=process.argv.includes('--both-roles')?360:120;s.clock.tick=s.time*20;s.ecology.modelEnabled=true;s.ecology.runEpoch='probe';ecologyTick(s);
  const batch=s.ecology.outbox[0],observation={schema_version:1,rules_version:s.rulesVersion,source_tick:batch.source_tick,roles:batch.roles,opportunities:batch.opportunities.map(({targets,...op})=>op)};
  const res=await fetch(base+'/api/ecology/session',{method:'POST'}),cookie=res.headers.get('set-cookie').split(';')[0];
  const submitted=await fetch(base+'/api/ecology/decisions',{method:'POST',headers:{cookie,'content-type':'application/json'},body:JSON.stringify({request_id:randomUUID(),save_id:'probe',run_epoch:'probe',observation,observation_hash:createHash('sha256').update(JSON.stringify(observation)).digest('hex')})});
  const job=await submitted.json();if(!job.job_id)throw new Error(JSON.stringify(job));
  let result;
  const deadline=Date.now()+timeout+5000;
  while(Date.now()<deadline){await new Promise(r=>setTimeout(r,200));result=await(await fetch(base+'/api/ecology/decisions/'+job.job_id,{headers:{cookie}})).json();if(!['queued','running'].includes(result.status))break;}
  const diagnostic=timeout!==ECOLOGY_TIMING.requestMs||process.argv.includes('--no-fallback');
  mkdirSync('artifacts/agent',{recursive:true});writeFileSync(`artifacts/agent/${diagnostic?'diagnostic-':''}${fallbackProbe?'fallback-real-probe':'real-probe'}.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));if(result.status!=='ready'||!result.output.choices.length||result.telemetry?.fallbackUsed!==fallbackProbe)process.exitCode=1;
}finally{await app.close();}
