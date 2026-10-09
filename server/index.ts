import http from 'node:http';
import {configFromEnv,createAssistant,type Route} from '../src/server/assistant.ts';
// The local server: the same assistant as the hosted API routes (src/app/api), behind Node's http server.
const config=configFromEnv(process.env),port=Number(process.env.PORT||8787);
const handle=createAssistant(config);
const routes:Record<string,Route>={'/health':'health','/assistant':'assistant','/register':'register'};
const server=http.createServer(async(req,res)=>{
 let body='';
 if(req.method==='POST')for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>12000){res.writeHead(413,{'Content-Type':'application/json; charset=utf-8'});return res.end(JSON.stringify({error:'too_large'}));}}
 const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(value!==undefined)headers.set(name,Array.isArray(value)?value.join(', '):value);
 const request=new Request(`http://${req.headers.host||'127.0.0.1'}${req.url||'/'}`,{method:req.method,headers,body:req.method==='POST'?body:undefined});
 const response=await handle(routes[req.url||'']??null,request,req.socket.remoteAddress||'unknown');
 res.writeHead(response.status,Object.fromEntries(response.headers));res.end(await response.text());
});
server.requestTimeout=20000;server.headersTimeout=10000;
server.listen(port,process.env.HOST||'127.0.0.1',()=>console.log(`Nomi assistant listening on port ${port}; OpenAI ${config.key?'configured':'not configured'} (${config.model}).`));
