import assert from 'node:assert/strict';
const serve = Deno.serve;
Deno.serve=()=>({});
const {createReviewHandler}=await import('../supabase/functions/apple-review-conversation/index.ts');
Deno.serve=serve;
const owner='11111111-1111-4111-8111-111111111111';
function setup(overrides={}){
 const state={enabled:'true',approved:owner,user:{id:owner,email_confirmed_at:'2026-01-01'},active:true,quotaAllowed:true,quotaReason:'reserved',used:1,turns:[],answer:'Obrigado por compartilhar. Qual história você gostaria de contar?',failHistory:false,failAI:false,failComplete:false,...overrides};
 const calls=[];
 const status=()=>({environment:'Sandbox',active:state.active,allowance:state.active?100:0,used_count:state.used,remaining:state.active?100-state.used:0,active_until:state.active?new Date(Date.now()+86400000).toISOString():null});
 const backend={
  authenticate:async token=>{calls.push(['auth',token]);return state.user},
  rpc:async(name,args)=>{
   calls.push([name,args]);assert.match(name,/^legacy_apple_review_/);assert.equal(args.p_owner,owner);
   if(name.endsWith('_status'))return state.failStatus?{data:null,error:{message:'Unavailable'}}:{data:[status()]};
   if(name.endsWith('_reserve'))return {data:[{allowed:state.quotaAllowed,used_count:state.used,allowance:state.active?100:0,remaining:99,reason:state.quotaReason,response_saved:false}]};
   if(name.endsWith('_complete')){if(state.failComplete)throw Error('Commit outcome unknown');return {data:true}}
   if(name.endsWith('_refund'))return {data:true};
   throw Error('Unexpected RPC');
  },
  turns:async(account,limit)=>{calls.push(['turns',{account,limit}]);assert.equal(account,owner);if(state.failHistory)throw Error('history unavailable');return state.turns},
 };
 const deps={
  env:name=>({APPLE_IAP_SANDBOX_REVIEW_ENABLED:state.enabled,APPLE_IAP_SANDBOX_TESTERS:state.approved})[name]||'',
  backend:()=>{calls.push(['backend']);return backend},
  complete:async(history,message)=>{calls.push(['AI',{history,message}]);if(state.failAI)throw Error('AI unavailable');return state.answer},
  uuid:()=> '22222222-2222-4222-8222-222222222222',
 };
 const handler=createReviewHandler(deps);
 const request=(body={},headers={authorization:'Bearer unit-test-token'})=>handler(new Request('https://example.invalid',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
 return {state,calls,handler,request};
}
Deno.test('review endpoint is disabled by default and does not initialize a privileged client',async()=>{
 const t=setup({enabled:''});const r=await t.request({action:'message',message:'Teste'});assert.equal(r.status,403);assert.equal(t.calls.length,0);
});
Deno.test('review endpoint rejects third-party origins before reading credentials',async()=>{
 const t=setup();const r=await t.request({}, {authorization:'Bearer unit-test-token',origin:'https://outside.invalid'});assert.equal(r.status,403);assert.equal(t.calls.length,0);
});
Deno.test('review endpoint requires authenticated and confirmed users',async()=>{
 const t=setup();assert.equal((await t.request({},{})).status,401);assert.equal(t.calls.length,0);
 const unconfirmed=setup({user:{id:owner,email_confirmed_at:null}});assert.equal((await unconfirmed.request()).status,401);assert.equal(unconfirmed.calls.filter(c=>c[0].startsWith('legacy_')).length,0);
});
Deno.test('review endpoint retains the existing allowlist even for a confirmed user',async()=>{
 const t=setup({approved:'22222222-2222-4222-8222-222222222222'});assert.equal((await t.request()).status,403);assert.equal(t.calls.filter(c=>c[0].startsWith('legacy_')).length,0);
});
Deno.test('status is authoritative and client owner/environment claims cannot grant Sandbox benefits',async()=>{
 const t=setup();const r=await t.request({action:'status',owner_id:'another-account',active:true,allowance:999});const body=await r.json();
 assert.equal(r.status,200);assert.equal(body.environment,'Sandbox');assert.equal(body.usage.limit,100);assert.equal(body.usage.used,1);
 const invalid=await t.request({environment:'Production',active:true});assert.equal(invalid.status,400);
});
Deno.test('expired or revoked subscription returns zero allowance and never falls back to Production',async()=>{
 const t=setup({active:false});const status=await (await t.request()).json();assert.equal(status.active,false);assert.equal(status.usage.limit,0);
 assert.equal((await t.request({action:'list'})).status,403);assert.equal((await t.request({action:'message',message:'Teste'})).status,403);
 assert.equal(t.calls.some(c=>c[0]==='AI'||c[0]==='turns'||c[0].endsWith('_reserve')),false);
});
Deno.test('active review message reserves, uses only isolated history, and commits the pair atomically',async()=>{
 const t=setup({turns:[{role:'user',content:'Uma história de teste'}]});const r=await t.request({action:'message',message:'  Outra história  '});const body=await r.json();
 assert.equal(r.status,200);assert.equal(body.environment,'Sandbox');assert.equal(body.usage.limit,100);
 assert.deepEqual(t.calls.map(c=>c[0]),['backend','auth','legacy_apple_review_status','legacy_apple_review_reserve','turns','AI','legacy_apple_review_complete']);
 const commit=t.calls.at(-1)[1];assert.equal(commit.p_owner,owner);assert.equal(commit.p_user_content,'Outra história');assert.equal(commit.p_assistant_content,t.state.answer);
});
Deno.test('exhausted Sandbox quota stops before history/AI and never consumes Production',async()=>{
 const t=setup({quotaAllowed:false,quotaReason:'monthly_limit',used:100});const r=await t.request({action:'message',message:'Teste'});assert.equal(r.status,429);assert.equal(t.calls.some(c=>c[0]==='AI'||c[0]==='turns'),false);
});
for(const reason of ['failHistory','failAI'])Deno.test(reason+' refunds the isolated reservation once before a response is saved',async()=>{
 const t=setup({[reason]:true});const r=await t.request({action:'message',message:'Teste'});assert.equal(r.status,503);
 assert.equal(t.calls.filter(c=>c[0]==='legacy_apple_review_refund').length,1);assert.equal(t.calls.some(c=>c[0]==='legacy_apple_review_complete'),false);
});
Deno.test('an uncertain atomic commit is not repeated or refunded by the handler',async()=>{
 const t=setup({failComplete:true});const r=await t.request({action:'message',message:'Teste'});assert.equal(r.status,503);
 assert.equal(t.calls.filter(c=>c[0]==='legacy_apple_review_complete').length,1);assert.equal(t.calls.some(c=>c[0].endsWith('_refund')),false);
});
Deno.test('unsupported actions and malformed messages never invoke AI',async()=>{
 const t=setup();assert.equal((await t.request({action:'review',approve:true})).status,400);assert.equal((await t.request({action:'message',message:{text:'Teste'}})).status,400);assert.equal(t.calls.some(c=>c[0]==='AI'),false);
});

Deno.test('status database failure fails closed before history, AI or any Production fallback',async()=>{
 const t=setup({failStatus:true});const r=await t.request({action:'message',message:'Teste'});assert.equal(r.status,503);
 assert.equal(t.calls.some(c=>c[0]==='turns'||c[0]==='AI'||c[0].endsWith('_reserve')),false);
});
Deno.test('default backend adapter reads only isolated tables and orders both turns correctly',async()=>{
 const keys=['APPLE_IAP_SANDBOX_REVIEW_ENABLED','APPLE_IAP_SANDBOX_TESTERS','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
 const values=['true',owner,'https://review-unit.example.invalid','unit-test-key'];
 const previous=keys.map(key=>Deno.env.get(key)),originalFetch=globalThis.fetch,urls=[];
 keys.forEach((key,i)=>Deno.env.set(key,values[i]));
 globalThis.fetch=async input=>{
  const url=new URL(String(input));urls.push(url);
  assert.equal(url.origin,'https://review-unit.example.invalid');
  let result;
  if(url.pathname==='/auth/v1/user')result={id:owner,email_confirmed_at:'2026-01-01'};
  else if(url.pathname==='/rest/v1/rpc/legacy_apple_review_status')result=[{environment:'Sandbox',active:true,allowance:100,used_count:1,remaining:99,active_until:new Date(Date.now()+86400000).toISOString()}];
  else if(url.pathname==='/rest/v1/legacy_apple_review_turns'){
   assert.equal(url.searchParams.get('owner_id'),'eq.'+owner);assert.equal(url.searchParams.get('order'),'ordinal.desc');
   result=[{role:'assistant',content:'Resposta isolada',ordinal:2},{role:'user',content:'Pergunta isolada',ordinal:1}];
  }else throw Error('Unexpected remote request: '+url.pathname);
  return new Response(JSON.stringify(result),{headers:{'Content-Type':'application/json'}});
 };
 try{
  const handler=createReviewHandler();const response=await handler(new Request('https://example.invalid',{method:'POST',headers:{authorization:'Bearer test-only-token','content-type':'application/json'},body:JSON.stringify({action:'list'})}));
  const body=await response.json();assert.equal(response.status,200);assert.equal(urls.length,3);assert.deepEqual(body.turns.map(turn=>turn.role),['user','assistant']);
  await new Promise(resolve=>setTimeout(resolve,0));
 }finally{
  globalThis.fetch=originalFetch;keys.forEach((key,i)=>previous[i]===undefined?Deno.env.delete(key):Deno.env.set(key,previous[i]));
 }
});
