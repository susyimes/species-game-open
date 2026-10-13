import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createEcologyServer } from '../server/ecology/server.mjs';

async function client(app){
  if(!app.server.listening)await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const session=await fetch(base+'/api/ecology/session',{method:'POST'}),cookie=session.headers.get('set-cookie').split(';')[0];
  return {base,async call(path,body){return fetch(base+path,{method:body?'POST':'GET',headers:{cookie,'content-type':'application/json'},body:body?JSON.stringify(body):undefined});}};
}
function input(slot=1){
  const observation={schema_version:1,rules_version:'isle-v3-e1',source_tick:2400*slot,roles:[{role:'island',slot_index:slot}],
    opportunities:[{id:`island:${slot}:test`,role:'island',allowed_choices:[{action_id:'hold',variant_id:'local'}],basis_ids:['seen:grass'],observations:{weather:'clear'}}]};
  return {request_id:randomUUID(),save_id:'save',run_epoch:'run',observation_hash:createHash('sha256').update(JSON.stringify(observation)).digest('hex'),observation};
}
async function done(c,id){for(let i=0;i<100;i++){const res=await c.call(`/api/ecology/decisions/${id}`),job=await res.json();if(!['queued','running'].includes(job.status))return job;await new Promise(r=>setTimeout(r,10));}throw new Error('job timeout');}
test('same request and slot are billed once and results are isolated to their session',async()=>{
  const app=createEcologyServer({dbPath:':memory:',mode:'mock',minimumInterval:0});
  try{
    const a=await client(app),b=await client(app),body=input();
    const first=await (await a.call('/api/ecology/decisions',body)).json();
    const duplicate=await (await a.call('/api/ecology/decisions',{...body,request_id:randomUUID()})).json();assert.equal(first.job_id,duplicate.job_id);
    const job=await done(a,first.job_id);assert.equal(job.status,'ready');assert.equal(job.telemetry.actualModel,'mock');
    assert.equal(app.db.prepare('SELECT count(*) n FROM usage').get().n,1);
    assert.equal((await b.call(`/api/ecology/decisions/${first.job_id}`)).status,404);
    assert.equal((await fetch(a.base+'/api/ecology/decisions/'+first.job_id)).status,401);
    assert.equal((await a.call('/api/ecology/decisions',{...input(2),request_id:body.request_id})).status,409);
  }finally{await app.close();}
});
test('invalid hash and state-writing catalogs never reach the provider',async()=>{
  let calls=0;const app=createEcologyServer({dbPath:':memory:',mode:'mock',provider:async()=>{calls++;return {output:{schema_version:1,choices:[]},telemetry:{}};}});
  try{
    const c=await client(app);assert.equal((await c.call('/api/ecology/decisions',{...input(),observation_hash:'fake'})).status,400);
    const bad=input();bad.observation.opportunities[0].allowed_choices[0].action_id='set_hp';bad.observation_hash=createHash('sha256').update(JSON.stringify(bad.observation)).digest('hex');
    assert.equal((await c.call('/api/ecology/decisions',bad)).status,400);assert.equal(calls,0);
  }finally{await app.close();}
});
test('timeouts charge one attempt, fail without retries, and obey the per-session budget',async()=>{
  let calls=0;const app=createEcologyServer({dbPath:':memory:',mode:'mock',timeout:40,minimumInterval:0,sessionLimit:1,
    provider:async()=>{calls++;await new Promise(r=>setTimeout(r,120));return {output:{schema_version:1,choices:[]},telemetry:{}};}});
  try{
    const c=await client(app),first=await(await c.call('/api/ecology/decisions',input())).json(),job=await done(c,first.job_id);
    assert.equal(job.status,'failed');assert.equal(job.failure,'provider_timeout');assert.equal(calls,1);
    assert.equal((await c.call('/api/ecology/decisions',input(2))).status,429);
  }finally{await app.close();}
});
test('discarding cookies cannot create unlimited source sessions',async()=>{
  const app=createEcologyServer({dbPath:':memory:',mode:'rule'});
  try{
    const c=await client(app);
    for(let i=1;i<12;i++)assert.equal((await fetch(c.base+'/api/ecology/session',{method:'POST'})).status,200);
    assert.equal((await fetch(c.base+'/api/ecology/session',{method:'POST'})).status,429);
    assert.equal(app.db.prepare('SELECT count(*) n FROM sessions').get().n,12);
  }finally{await app.close();}
});
