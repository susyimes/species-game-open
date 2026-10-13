import { spawn } from 'node:child_process';
const backend=spawn(process.execPath,['server/ecology/server.mjs'],{stdio:'inherit',windowsHide:true});
const frontend=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',process.env.GAME_PORT||'5196','--strictPort',...process.argv.slice(2)],{stdio:'inherit',windowsHide:true});
let stopping=false;
function stop(){if(stopping)return;stopping=true;backend.kill();frontend.kill();}
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,stop);
for(const child of [backend,frontend])child.on('exit',code=>{stop();process.exitCode=code||0;});
