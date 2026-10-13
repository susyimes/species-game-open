import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createState} from '../src/core/state.js';
import {step} from '../src/core/simulation.js';
import {serialize,deserialize} from '../src/core/persistence.js';
const results=[];
for(const seed of [73429,1,87,173,901]){
  const state=createState(seed);state.started=true;const durations=[];let maxEntities=0,maxArrivals=0;
  for(let tick=0;tick<7*360*20;tick++){
    const before=performance.now();step(state,.05);if(tick%20===0)durations.push(performance.now()-before);
    maxEntities=Math.max(maxEntities,state.agents.length);maxArrivals=Math.max(maxArrivals,state.ecology.arrivals.filter(a=>!['resolved','cancelled'].includes(a.status)).length);
    assert.ok(state.agents.length<=64&&state.colony.food>=0&&state.colony.food<=state.colony.storage&&state.colony.material>=0&&state.colony.material<=state.colony.storage);
  }
  const raw=serialize(state);assert.ok(deserialize(raw));assert.ok(Buffer.byteLength(raw)<1024*1024);assert.ok(maxArrivals<=2);
  durations.sort((a,b)=>a-b);results.push({seed,simSeconds:state.time,maxEntities,maxArrivals,saveBytes:Buffer.byteLength(raw),tickP95Ms:durations[Math.floor(durations.length*.95)]});
}
await fs.mkdir('artifacts/soak',{recursive:true});await fs.writeFile('artifacts/soak/report.json',JSON.stringify({passed:true,mode:'rule',results},null,2));console.log(JSON.stringify({passed:true,results}));
