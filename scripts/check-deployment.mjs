import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const base=new URL(process.argv[2]||'https://species.truebox.cn/');
const directory=resolve(process.argv[3]||'dist');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function files(dir,prefix=''){
  return readdirSync(dir).flatMap(name=>statSync(join(dir,name)).isDirectory()?files(join(dir,name),prefix+name+'/'):[prefix+name]);
}
const paths=files(directory),results=[];
for(let start=0;start<paths.length;start+=4){
  results.push(...await Promise.all(paths.slice(start,start+4).map(async path=>{
    const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(30000)});
    assert.equal(response.status,200,`${path}: HTTP ${response.status}`);
    const bytes=Buffer.from(await response.arrayBuffer()),expected=readFileSync(join(directory,path));
    assert.equal(hash(bytes),hash(expected),`${path}: deployed bytes differ from release`);
    const cache=response.headers.get('cache-control')||'';
    const contentType=response.headers.get('content-type')||'';
    const mime={html:'text/html',css:'text/css',js:'application/javascript',json:'application/json',svg:'image/svg+xml'}[path.split('.').at(-1)];
    if(mime)assert.ok(contentType.startsWith(mime),`${path}: unexpected content type ${contentType}`);
    if(base.protocol==='https:'){
      if(path.startsWith('assets/'))assert.match(cache,/immutable/,`${path}: missing immutable cache`);
      else assert.match(cache,/no-cache/,`${path}: unversioned assets must revalidate`);
      if(path.endsWith('.glb'))assert.ok(contentType.startsWith('model/gltf-binary'),`${path}: unexpected model type ${contentType}`);
    }
    return {path,status:response.status,bytes:bytes.length,sha256:hash(bytes),contentType:response.headers.get('content-type'),cache};
  })));
}
for(const path of ['.git/config','.env','deploy/activate.sh','server/ecology/server.mjs','private/ecology.env']){
  const response=await fetch(new URL(path,base),{signal:AbortSignal.timeout(15000)});
  await response.body?.cancel();
  assert.equal(response.status,404,`${path}: private deployment input must not be served`);
}
const health=await(await fetch(new URL('api/ecology/health',base))).json();
assert.equal(health.ok,true);assert.equal(health.mode,'model');assert.equal(health.rules_version,'isle-v3-e1');
if(base.protocol==='https:'){
  const insecure=new URL('release.json',base);
  insecure.protocol='http:';
  const redirect=await fetch(insecure,{redirect:'manual',signal:AbortSignal.timeout(15000)});
  await redirect.body?.cancel();
  assert.equal(redirect.status,301,'HTTP must permanently redirect to HTTPS');
  assert.equal(redirect.headers.get('location'),new URL('release.json',base).href);
}
console.log(JSON.stringify({url:base.href,checkedAt:new Date().toISOString(),files:results,privatePaths:'404',passed:true},null,2));
