import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { createEcologyServer } from '../server/ecology/server.mjs';
import { createState } from '../src/core/state.js';
import { ecologyTick, consumeEcologyInbox, expireEcology } from '../src/core/ecology.js';

const primary='deepseek-v4-flash',fallback='doubao-seed-2.0-lite';
function input(slot=3){
  const observation={schema_version:1,rules_version:'isle-v3-e1',source_tick:2400*slot,
    roles:[{role:'island',slot_index:slot},{role:'marine',slot_index:slot*2/3}],
    opportunities:['island','marine'].map(role=>({id:`${role}:${slot}`,role,basis_ids:[`${role}:seen`],
      allowed_choices:[{action_id:'hold',variant_id:'local'}],observations:{weather:'clear'}}))};
  return {request_id:randomUUID(),save_id:'save',run_epoch:'run',observation,
    observation_hash:createHash('sha256').update(JSON.stringify(observation)).digest('hex')};
}
function completion(request,content){
  const observation=JSON.parse(request.body.messages[1].content);
  return {model:`${request.body.model}-actual`,usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30},
    choices:[{message:{content:content??JSON.stringify({schema_version:1,choices:observation.opportunities.map(op=>({
      role:op.role,opportunity_id:op.id,...op.allowed_choices[0],basis_ids:op.basis_ids,reason:'原地休息。'}))})}}]};
}
async function fixture(t,respond,options={}){
  const calls=[];
  const upstream=http.createServer(async(req,res)=>{
    let raw='';for await(const chunk of req)raw+=chunk;
    const request={path:req.url,body:JSON.parse(raw),authorization:req.headers.authorization};calls.push(request);
    const result=respond(request,calls.length);
    if(result===null)return;
    if(result.disconnect){res.destroy();return;}
    res.writeHead(result.status||200,{'content-type':'application/json'});res.end(JSON.stringify(result.body??completion(request)));
  });
  await new Promise(resolve=>upstream.listen(0,'127.0.0.1',resolve));
  const app=createEcologyServer({dbPath:':memory:',mode:'model',key:'test-private-key',minimumInterval:0,timeout:1000,
    baseUrl:`http://127.0.0.1:${upstream.address().port}/api/plan/v3`,...options});
  t.after(async()=>{await app.close();await new Promise(resolve=>{upstream.close(resolve);upstream.closeAllConnections();});});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const session=await fetch(base+'/api/ecology/session',{method:'POST'}),cookie=session.headers.get('set-cookie').split(';')[0];
  const call=(path,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});
  async function submit(body=input()){
    const response=await call('/api/ecology/decisions',body);assert.equal(response.status,202);
    const {job_id}=await response.json(),deadline=Date.now()+3000;
    while(Date.now()<deadline){
      const job=await(await call(`/api/ecology/decisions/${job_id}`)).json();
      if(!['queued','running'].includes(job.status))return job;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    throw new Error('job timeout');
  }
  return {app,calls,call,submit};
}

test('both ecology roles use Flash without a reasoning override and health exposes the configuration',async t=>{
  const f=await fixture(t,()=>({}));
  const health=await(await f.call('/api/ecology/health')).json();
  assert.equal(health.mode,'model');assert.equal(health.provider,'ark-plan');
  assert.equal(health.model,primary);assert.equal(health.fallback_model,fallback);assert.equal(health.reasoning_effort,'default');
  assert.equal(JSON.stringify(health).includes('test-private-key'),false);
  const job=await f.submit();assert.equal(job.status,'ready');assert.equal(job.output.choices.length,2);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].path,'/api/plan/v3/chat/completions');
  assert.equal(f.calls[0].authorization,'Bearer test-private-key');assert.equal(f.calls[0].body.model,primary);
  for(const field of ['reasoning_effort','thinking','thinking_budget'])assert.equal(Object.hasOwn(f.calls[0].body,field),false);
  assert.equal(job.telemetry.requestedModel,primary);assert.equal(job.telemetry.selectedModel,primary);
  assert.equal(job.telemetry.actualModel,`${primary}-actual`);assert.equal(job.telemetry.fallbackUsed,false);
  assert.deepEqual(job.telemetry.attemptedModels,[primary]);assert.equal(job.telemetry.reasoningEffort,'default');
});

test('a provider failure switches once to Lite, deduplicates the job, and counts both attempts against quota',async t=>{
  const f=await fixture(t,(_,index)=>index===1?{status:503}:{},{sessionLimit:2}),body=input();
  const job=await f.submit(body);assert.equal(job.status,'ready');assert.equal(job.output.choices.length,2);
  assert.deepEqual(f.calls.map(c=>c.body.model),[primary,fallback]);
  for(const call of f.calls)assert.equal(Object.hasOwn(call.body,'reasoning_effort'),false);
  assert.equal(job.telemetry.selectedModel,fallback);assert.equal(job.telemetry.actualModel,`${fallback}-actual`);
  assert.equal(job.telemetry.fallbackUsed,true);assert.deepEqual(job.telemetry.attemptedModels,[primary,fallback]);
  assert.equal(job.telemetry.modelAttempts[0].failure,'provider_http_503');
  assert.deepEqual(job.telemetry.modelAttempts.map(a=>a.status),['failed','ready']);
  assert.equal(f.app.db.prepare('SELECT sent FROM usage WHERE job_id=?').get(job.job_id).sent,2);
  const duplicate=await f.submit({...body,request_id:randomUUID()});assert.equal(duplicate.job_id,job.job_id);
  assert.equal(f.calls.length,2);assert.equal((await f.call('/api/ecology/decisions',input(6))).status,429);
});

test('authentication failures and provider throttling do not trigger fallback',async t=>{
  for(const status of [401,403,429])await t.test(String(status),async t=>{
    const f=await fixture(t,()=>({status})),job=await f.submit();
    assert.equal(job.status,'failed');assert.equal(job.failure,`provider_http_${status}`);
    assert.equal(f.calls.length,1);assert.equal(job.telemetry.fallbackUsed,false);
  });
});

test('malformed JSON and invalid response envelopes fall back and retain usage for both attempts',async t=>{
  for(const content of ['not JSON','{"schema_version":99,"choices":[]}'])await t.test(content,async t=>{
    const f=await fixture(t,(request,index)=>index===1?{body:completion(request,content)}:{}),job=await f.submit();
    assert.equal(job.status,'ready');assert.equal(job.telemetry.selectedModel,fallback);
    assert.equal(job.telemetry.usage.total_tokens,60);assert.equal(job.telemetry.modelAttempts[0].usage.total_tokens,30);
    assert.equal(f.calls.length,2);
  });
});

test('network failure can fall back within the same job',async t=>{
  const f=await fixture(t,(_,index)=>index===1?{disconnect:true}:{}),job=await f.submit();
  assert.equal(job.status,'ready');assert.equal(job.telemetry.selectedModel,fallback);assert.equal(f.calls.length,2);
});

test('a primary timeout leaves time for a successful fallback',async t=>{
  const f=await fixture(t,(_,index)=>index===1?null:{},{timeout:450}),job=await f.submit();
  assert.equal(job.status,'ready');assert.equal(job.telemetry.modelAttempts[0].failure,'provider_timeout');
  assert.equal(job.telemetry.selectedModel,fallback);assert.equal(f.calls.length,2);
});

test('two stalled models stop at the shared job deadline',async t=>{
  const f=await fixture(t,()=>null,{timeout:450}),job=await f.submit();
  assert.equal(job.status,'failed');assert.equal(job.failure,'provider_timeout');
  assert.equal(f.calls.length,2);assert.equal(job.telemetry.selectedModel,null);
  assert.deepEqual(job.telemetry.modelAttempts.map(a=>a.status),['failed','failed']);
});

test('fallback stops at the session budget without sending a second request',async t=>{
  const f=await fixture(t,()=>({status:503}),{sessionLimit:1}),job=await f.submit();
  assert.equal(job.status,'failed');assert.equal(job.failure,'budget_exceeded');
  assert.equal(job.telemetry.fallbackSkipped,'budget_exceeded');assert.equal(job.telemetry.fallbackUsed,false);
  assert.equal(f.calls.length,1);assert.equal(f.app.db.prepare('SELECT sent FROM usage').get().sent,1);
});

test('fallback also respects shared source and global attempt budgets',async t=>{
  for(const scope of ['source','global'])await t.test(scope,async t=>{
    const f=await fixture(t,()=>({status:503}));
    const current=f.app.db.prepare('SELECT * FROM sessions').get();
    f.app.db.prepare('INSERT INTO usage VALUES (?,?,?,?,?)').run('previous-job','previous-session',
      scope==='source'?current.source:'another-source',Date.now(),scope==='source'?95:191);
    const job=await f.submit();assert.equal(job.failure,'budget_exceeded');assert.equal(f.calls.length,1);
    assert.equal(job.telemetry.fallbackSkipped,'budget_exceeded');
    assert.equal((await f.call('/api/ecology/decisions',input(6))).status,429);
  });
});

test('valid replies remain applicable after a full model window at double simulation speed',()=>{
  const s=createState();s.time=120;s.clock.tick=2400;s.ecology.modelEnabled=true;s.ecology.runEpoch='timing-test';ecologyTick(s);
  const batch=s.ecology.outbox[0],op=batch.opportunities[0];
  const choice={...op.allowed_choices[0],role:op.role,opportunity_id:op.id,basis_ids:op.basis_ids.slice(0,1),reason:'原地观察。'};
  // Two seconds queued, 50 in the provider, and two polling: 108 simulated seconds at 2x.
  s.time+=108;s.clock.tick+=108*20;expireEcology(s);
  s.ecology.inbox.push({batchId:batch.id,source:'model',output:{schema_version:1,choices:[choice]}});consumeEcologyInbox(s);
  const group=s.ecology.groups.find(group=>group.id===op.group_id);
  assert.equal(group.intent.source,'model');assert.equal(group.intent.startTick,s.clock.tick);
  const commandId=group.intent.commandId;
  s.ecology.inbox.push({batchId:batch.id,source:'model',output:{schema_version:1,choices:[choice]}});consumeEcologyInbox(s);
  assert.equal(group.intent.commandId,commandId);
  assert.equal(s.ecology.appliedCommandIds.filter(id=>id===commandId).length,1);
});

test('disabling fallback or selecting the same model never repeats a paid request',async t=>{
  for(const fallbackModel of ['off',primary])await t.test(fallbackModel,async t=>{
    const f=await fixture(t,()=>({status:503}),{fallbackModel}),job=await f.submit();
    assert.equal(job.status,'failed');assert.equal(f.calls.length,1);
    assert.deepEqual(job.telemetry.attemptedModels,[primary]);
  });
});

test('two failures preserve safe attempt evidence and return no model output',async t=>{
  const f=await fixture(t,()=>({status:502,body:{error:'test-private-key must never appear in telemetry'}})),job=await f.submit();
  assert.equal(job.status,'failed');assert.equal(job.failure,'provider_http_502');assert.equal(job.output,null);
  assert.equal(f.calls.length,2);assert.deepEqual(job.telemetry.modelAttempts.map(a=>a.status),['failed','failed']);
  assert.equal(JSON.stringify(job).includes('test-private-key'),false);
});
