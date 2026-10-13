import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
const root=resolve(process.argv[2]||'artifacts/longplay/site'),port=Number(process.env.PLAYTEST_PORT||5198),apiPort=Number(process.env.PLAYTEST_API_PORT||5207);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.svg':'image/svg+xml','.png':'image/png'};
http.createServer((req,res)=>{
  if(req.url.startsWith('/api/ecology')){
    const upstream=http.request({host:'127.0.0.1',port:apiPort,path:req.url,method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode,response.headers);response.pipe(res);});
    upstream.on('error',()=>{res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"service_unavailable"}');});req.pipe(upstream);return;
  }
  let path;try{path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400);res.end();return;}
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(404);res.end();return;}
  if(existsSync(path)&&statSync(path).isDirectory())path=resolve(path,'index.html');
  if(!existsSync(path)||!statSync(path).isFile()){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':types[extname(path)]||'application/octet-stream','cache-control':'no-store'});createReadStream(path).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(JSON.stringify({preview:root,port,apiPort})));
