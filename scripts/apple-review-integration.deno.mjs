import assert from 'node:assert/strict';
import { PGlite } from 'npm:@electric-sql/pglite@0.3.14';
const serve=Deno.serve;Deno.serve=()=>({});
const {createReviewHandler}=await import('../supabase/functions/apple-review-conversation/index.ts');
Deno.serve=serve;
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 CREATE TABLE legacy_user_entitlements(owner_id uuid PRIMARY KEY REFERENCES auth.users(id),plan text NOT NULL CHECK(plan IN ('essential','complete')),active_until timestamptz,updated_at timestamptz DEFAULT now());
 CREATE TABLE legacy_chat_turns(owner_id uuid,role text,content text);
 INSERT INTO legacy_chat_turns VALUES('${owner}','user','PRIVATE PRODUCTION SENTINEL');
 SET test.role='service_role'; INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 const migrations=new URL('../supabase/migrations/',import.meta.url);
 const monthly=await Deno.readTextFile(new URL('20261014_monthly_credits.sql',migrations));
 await db.exec(monthly.slice(0,monthly.indexOf('-- Charge one completed')));
 await db.exec(await Deno.readTextFile(new URL('20261103_apple_billing.sql',migrations)));
 await db.exec(await Deno.readTextFile(new URL('20261109_apple_review_sandbox.sql',migrations)));
 const future=new Date(Date.now()+86400000).toISOString();
 const apply=async changes=>db.query('SELECT legacy_apply_apple_subscription($1::jsonb)',[JSON.stringify({owner_id:owner,original_transaction_id:'10001',transaction_id:'10002',environment:'Sandbox',product_id:'br.com.meulegado.plus.mensal',active_until:future,active:true,signed_at:new Date().toISOString(),...changes})]);
 await apply({environment:'Production'});
 for(let i=0;i<3;i++)await db.query('SELECT * FROM legacy_reserve_interaction($1,$2)',[owner,'prod-seed-'+i]);
 const productionSnapshot=async()=>JSON.stringify({
  months:(await db.query('SELECT * FROM legacy_usage_months ORDER BY owner_id,month_start')).rows,
  events:(await db.query('SELECT * FROM legacy_usage_events ORDER BY owner_id,message_id')).rows,
  entitlements:(await db.query('SELECT * FROM legacy_user_entitlements ORDER BY owner_id')).rows,
  subscriptions:(await db.query("SELECT * FROM legacy_apple_subscriptions WHERE environment='Production' ORDER BY owner_id,original_transaction_id")).rows,
  turns:(await db.query('SELECT * FROM legacy_chat_turns ORDER BY owner_id')).rows,
  quotaDefinition:(await db.query("SELECT pg_get_functiondef('legacy_reserve_interaction(uuid,text,text)'::regprocedure) AS body")).rows[0].body,
 });
 const productionBefore=await productionSnapshot();
 const state={enabled:'true',approved:owner,user:{id:owner,email_confirmed_at:'2026-01-01'},failAI:false,revokeDuringAI:false};
 const calls=[],histories=[];let serial=0;
 const rpcContracts={
  legacy_apple_review_status:{sql:'SELECT * FROM legacy_apple_review_status($1)',keys:['p_owner']},
  legacy_apple_review_reserve:{sql:'SELECT * FROM legacy_apple_review_reserve($1,$2)',keys:['p_owner','p_message_id']},
  legacy_apple_review_complete:{sql:'SELECT legacy_apple_review_complete($1,$2,$3,$4) AS value',keys:['p_owner','p_message_id','p_user_content','p_assistant_content'],scalar:true},
  legacy_apple_review_refund:{sql:'SELECT legacy_apple_review_refund($1,$2) AS value',keys:['p_owner','p_message_id'],scalar:true},
 };
 const backend={
  authenticate:async()=>state.user,
  rpc:async(name,args)=>{
   const contract=rpcContracts[name];assert.ok(contract,'Endpoint must never invoke a Production RPC');calls.push(name);
   try{
    const result=await db.query(contract.sql,contract.keys.map(key=>args[key]));
    // Supabase RPC returns JSON over HTTP, including ISO strings for timestamptz.
    // Apply only that transport serialization to the real PostgreSQL result.
    return {data:JSON.parse(JSON.stringify(contract.scalar?result.rows[0].value:result.rows))};
   }
   catch(error){return {data:null,error:{message:String(error)}}}
  },
  turns:async(who,limit)=>{
   assert.equal(who,owner);calls.push('isolated-turns');
   return (await db.query('SELECT role,content,created_at,ordinal FROM legacy_apple_review_turns WHERE owner_id=$1 ORDER BY ordinal DESC LIMIT $2',[who,limit])).rows.reverse();
  },
 };
 const handler=createReviewHandler({
  env:name=>({APPLE_IAP_SANDBOX_REVIEW_ENABLED:state.enabled,APPLE_IAP_SANDBOX_TESTERS:state.approved})[name]||'',
  backend:()=>backend,
  complete:async(history,message)=>{
   histories.push(structuredClone(history));assert.ok(history.every(turn=>!turn.content.includes('PRIVATE PRODUCTION SENTINEL')));
   if(state.failAI)throw Error('Simulated AI failure');
   if(state.revokeDuringAI)await apply({active:false,signed_at:new Date(Date.now()+1000).toISOString()});
   return 'Resposta de teste isolada: '+message;
  },
  uuid:()=> 'test-'+String(++serial).padStart(8,'0'),
 });
 const request=async body=>{const response=await handler(new Request('https://test.invalid',{method:'POST',headers:{authorization:'Bearer mock-auth-only','content-type':'application/json'},body:JSON.stringify(body)}));return {status:response.status,body:await response.json()}};
 return {db,state,calls,histories,apply,request,productionSnapshot,productionBefore};
}
Deno.test('HTTP handler and real SQL complete 100 isolated interactions without touching Production',async()=>{
 const t=await fixture();try{
 let response=await t.request({action:'status'});assert.equal(response.status,200);assert.equal(response.body.active,false);assert.equal(response.body.usage.limit,0,'Production purchase cannot activate Sandbox');
 await t.apply({});response=await t.request({action:'status'});assert.equal(response.body.active,true);assert.deepEqual(response.body.usage,{used:0,limit:100,remaining:100});
 response=await t.request({action:'message',message:'Primeira história de teste',owner_id:other});assert.equal(response.status,200);assert.equal(response.body.usage.used,1);assert.equal(response.body.environment,'Sandbox');
 let listed=await t.request({action:'list'});assert.equal(listed.status,200);assert.deepEqual(listed.body.turns.map(turn=>turn.role),['user','assistant']);
 assert.deepEqual(t.histories[0],[]);
 response=await t.request({action:'message',message:'Segunda história de teste'});assert.equal(response.status,200);assert.equal(t.histories[1].length,2);
 for(let i=2;i<100;i++){response=await t.request({action:'message',message:'História de teste '+i});assert.equal(response.status,200);assert.equal(response.body.usage.used,i+1)}
 const aiCalls=t.histories.length;response=await t.request({action:'message',message:'Além do limite'});assert.equal(response.status,429);assert.equal(t.histories.length,aiCalls);
 response=await t.request({action:'status'});assert.deepEqual(response.body.usage,{used:100,limit:100,remaining:0});
 const rows=await t.db.query('SELECT owner_id,count(*)::int AS count FROM legacy_apple_review_turns GROUP BY owner_id');assert.deepEqual(rows.rows,[{owner_id:owner,count:200}]);
 assert.equal(await t.productionSnapshot(),t.productionBefore);
 }finally{await t.db.close()}
});
Deno.test('real persisted subscription updates for revocation, stale events and expiry deny the isolated handler',async()=>{
 const t=await fixture();try{
 await t.apply({});assert.equal((await t.request({action:'message',message:'Antes da revogação'})).status,200);
 await t.apply({active:false,signed_at:new Date(Date.now()+1000).toISOString()});
 await t.apply({active:true,signed_at:new Date(Date.now()-1000).toISOString()});
 let result=await t.request({action:'status'});assert.equal(result.body.active,false);assert.equal(result.body.usage.limit,0);
 const calls=t.histories.length;assert.equal((await t.request({action:'list'})).status,403);assert.equal((await t.request({action:'message',message:'Após revogação'})).status,403);assert.equal(t.histories.length,calls);
 await t.apply({active:true,active_until:new Date(Date.now()-1000).toISOString(),signed_at:new Date(Date.now()+2000).toISOString()});
 result=await t.request({action:'status'});assert.equal(result.body.active,false);assert.equal(result.body.usage.limit,0);assert.equal((await t.request({action:'message',message:'Após expiração'})).status,403);
 assert.equal(await t.productionSnapshot(),t.productionBefore);
 }finally{await t.db.close()}
});
Deno.test('flag, allowlist and email gates stop real Sandbox access without executing SQL',async()=>{
 const t=await fixture();try{
 await t.apply({});t.state.enabled='';let count=t.calls.length;assert.equal((await t.request({action:'status'})).status,403);assert.equal(t.calls.length,count);
 t.state.enabled='true';t.state.approved=other;assert.equal((await t.request({action:'list'})).status,403);assert.equal(t.calls.length,count);
 t.state.approved=owner;t.state.user={id:owner,email_confirmed_at:null};assert.equal((await t.request({action:'message',message:'Teste'})).status,401);assert.equal(t.calls.length,count);
 t.state.user={id:owner,email_confirmed_at:'2026-01-01'};assert.equal((await t.request({action:'status',environment:'Production'})).status,400);assert.equal(t.calls.length,count);
 assert.equal(await t.productionSnapshot(),t.productionBefore);
 }finally{await t.db.close()}
});
Deno.test('AI failure uses the real single-use refund while revoked commit preserves uncertain reservation',async()=>{
 const t=await fixture();try{
 await t.apply({});t.state.failAI=true;assert.equal((await t.request({action:'message',message:'Falha simulada'})).status,503);
 let result=await t.request({action:'status'});assert.equal(result.body.usage.used,0);
 let events=(await t.db.query('SELECT response_saved,refunded_at IS NOT NULL AS refunded FROM legacy_apple_review_events ORDER BY message_id')).rows;assert.deepEqual(events,[{response_saved:false,refunded:true}]);
 t.state.failAI=false;t.state.revokeDuringAI=true;assert.equal((await t.request({action:'message',message:'Revogada durante IA'})).status,503);
 assert.equal((await t.db.query('SELECT count(*)::int AS count FROM legacy_apple_review_turns')).rows[0].count,0);
 events=(await t.db.query('SELECT response_saved,refunded_at IS NOT NULL AS refunded FROM legacy_apple_review_events ORDER BY message_id')).rows;assert.deepEqual(events,[{response_saved:false,refunded:true},{response_saved:false,refunded:false}]);
 result=await t.request({action:'status'});assert.equal(result.body.active,false);assert.equal(result.body.usage.limit,0);
 assert.equal(await t.productionSnapshot(),t.productionBefore);
 }finally{await t.db.close()}
});
