import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AUDIO_IDS } from '../src/audio/settings.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const release=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d+Z$/,'Z')+'-'+revision.slice(0,7);
const output=join(root,'artifacts','deploy',release),payload=join(output,'payload');
if(!existsSync(join(root,'dist','index.html')))throw new Error('Run npm run build first');
mkdirSync(payload,{recursive:true});
cpSync(join(root,'dist'),join(payload,'site'),{recursive:true});
mkdirSync(join(payload,'deploy'));
for(const name of ['activate.sh','nginx-http.conf','nginx-https.conf','Dockerfile','probe.mjs']){
  const text=readFileSync(join(root,'deploy',name),'utf8').replace(/\r\n/g,'\n');
  writeFileSync(join(payload,'deploy',name),text);
}
mkdirSync(join(payload,'server','ecology'),{recursive:true});
cpSync(join(root,'server','ecology','server.mjs'),join(payload,'server','ecology','server.mjs'));
mkdirSync(join(payload,'src','core'),{recursive:true});
cpSync(join(root,'src','core','ecology-commands.js'),join(payload,'src','core','ecology-commands.js'));
writeFileSync(join(payload,'package.json'),JSON.stringify({private:true,type:'module'}));
const metadata={name:'species-game',release,sourceRevision:revision,builtAt:new Date().toISOString()};
writeFileSync(join(payload,'site','release.json'),JSON.stringify(metadata,null,2)+'\n');
function list(dir,prefix=''){
  return readdirSync(dir).flatMap(name=>{
    const path=join(dir,name),relative=prefix+name;
    return statSync(path).isDirectory()?list(path,relative+'/'):[relative];
  });
}
const files=list(join(payload,'site'));
if(files.some(name=>/\.map$|\.blend\d*$|(^|\/)\.env|(^|\/)\.git/.test(name)))throw new Error('Unexpected source or local file in site');
const expectedModels=['sprig','berry','nest','tree','stone','relic','mossback','reedbeak','emberfang','glowbug','tideback','reefjaw','riftstalker','stonehorn','tideblade','spearbeak','resinshell','stormlantern','fernback','moonray','mireclaw','spinedillo'];
for(const name of expectedModels)if(!files.includes(`models/${name}.glb`))throw new Error(`Missing playable model: ${name}`);
for(const name of AUDIO_IDS)for(const format of ['ogg','mp3'])if(!files.includes(`audio/${name}.${format}`))throw new Error(`Missing playable audio: ${name}.${format}`);
if(!files.includes('audio/manifest.json'))throw new Error('Missing generated audio provenance');
if(!files.includes('legacy/index.html'))throw new Error('Missing playable legacy entry');
const archive=join(output,`species-game-${release}.tar.gz`);
execFileSync('tar',['-czf',archive,'-C',payload,'.'],{cwd:root});
const bytes=readFileSync(archive),sha256=createHash('sha256').update(bytes).digest('hex');
const report={...metadata,archive,sha256,bytes:bytes.length,files};
writeFileSync(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
