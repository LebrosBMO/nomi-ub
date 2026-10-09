import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const TOKEN='test-only-local-pairing-token-12345';
async function start(port:number,env:Record<string,string>){
 const child=spawn(process.execPath,['server/index.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),HOST:'127.0.0.1',OPENAI_API_KEY:'',NOMI_ACCESS_TOKEN:TOKEN,...env},stdio:['ignore','pipe','pipe']});
 await Promise.race([once(child.stdout,'data'),new Promise((_,rej)=>setTimeout(()=>rej(Error('server startup timeout')),5000).unref())]);
 return child;
}
test('Assistant endpoint fails closed without an OpenAI key and rejects unauthorized clients',async()=>{
 const child=await start(18789,{});
 try{
 const base='http://127.0.0.1:18789';const health=await fetch(base+'/health').then(r=>r.json());assert.equal(health.ready,false);assert.equal(health.mode,'not_configured');
 assert.equal((await fetch(base+'/assistant',{method:'POST',body:'{}'})).status,401);
 const off=await fetch(base+'/assistant',{method:'POST',headers:{Authorization:'Bearer '+TOKEN},body:'{}'});assert.equal(off.status,503);assert.equal((await off.json()).error,'ai_not_configured');
 assert.equal((await fetch(base+'/assistant',{method:'OPTIONS',headers:{Origin:'https://untrusted.example'}})).status,403);
 }finally{child.kill();await once(child,'exit');}
});
test('Assistant sends only the request and previous intent to the Responses API, retries without reasoning once, and returns the validated intent',async()=>{
 const seen:any[]=[];
 const fake=http.createServer(async(req,res)=>{
  let body='';for await(const c of req)body+=c;const json=JSON.parse(body);seen.push({url:req.url,auth:req.headers.authorization,json});
  res.setHeader('Content-Type','application/json');
  if(json.reasoning){res.writeHead(400);return res.end(JSON.stringify({error:{message:'Unsupported parameter: reasoning.effort'}}));}
  res.end(JSON.stringify({status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:JSON.stringify({category:'tire',district:'БГД',query:'bgd dugui zasvar',nearby:false,openNow:false,action:'search',clarification:null})}]}],usage:{input_tokens:612,output_tokens:48,total_tokens:660,output_tokens_details:{reasoning_tokens:20}}}));
 });
 fake.listen(18791,'127.0.0.1');await once(fake,'listening');
 const child=await start(18790,{OPENAI_API_KEY:'sk-test-only',OPENAI_BASE_URL:'http://127.0.0.1:18791/v1/'});
 try{
  const base='http://127.0.0.1:18790';
  assert.equal((await fetch(base+'/health').then(r=>r.json())).mode,'openai');
  const r=await fetch(base+'/assistant',{method:'POST',headers:{Authorization:'Bearer '+TOKEN},body:JSON.stringify({message:'bgd dugui zasvar'})});
  assert.equal(r.status,200);const got=await r.json();
  assert.equal(got.intent.category,'tire');assert.equal(got.intent.district,'БГД');assert.equal(got.model,'gpt-6-luna');
  assert.deepEqual(got.usage,{input:612,output:48,total:660});
  assert.equal(seen.length,2);assert.ok(seen[0].json.reasoning);assert.equal(seen[1].json.reasoning,undefined);
  const sent=seen[1];assert.equal(sent.url,'/v1/responses');assert.equal(sent.auth,'Bearer sk-test-only');
  assert.equal(sent.json.store,false);assert.equal(sent.json.text.format.type,'json_schema');assert.equal(sent.json.text.format.strict,true);
  assert.deepEqual(JSON.parse(sent.json.input),{previous:null,message:'bgd dugui zasvar'});
  // The effort stays off for later requests in this process.
  await fetch(base+'/assistant',{method:'POST',headers:{Authorization:'Bearer '+TOKEN},body:JSON.stringify({message:'эмийн сан'})});
  assert.equal(seen.length,3);assert.equal(seen[2].json.reasoning,undefined);
 }finally{child.kill();await once(child,'exit');fake.close();}
});
