import {PGlite} from 'npm:@electric-sql/pglite@0.3.14';
import assert from 'node:assert/strict';
const owner='11111111-1111-4111-8111-111111111111';
const other='22222222-2222-4222-8222-222222222222';
const future=()=>new Date(Date.now()+86400000).toISOString();
async function fixture(){
 const db=new PGlite();
 await db.exec(`CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('test.role',true) $$;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.uid',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE legacy_user_entitlements(owner_id uuid PRIMARY KEY REFERENCES auth.users(id),plan text NOT NULL CHECK(plan IN ('essential','complete')),active_until timestamptz,updated_at timestamptz DEFAULT now());
 SET test.role='service_role';
 INSERT INTO auth.users VALUES('${owner}'),('${other}');`);
 const base=new URL('../supabase/migrations/',import.meta.url);
 const monthly=await Deno.readTextFile(new URL('20261014_monthly_credits.sql',base));
 await db.exec(monthly.slice(0,monthly.indexOf('-- Charge one completed')));
 await db.exec(await Deno.readTextFile(new URL('20261103_apple_billing.sql',base)));
 const productionDefinition=(await db.query("SELECT pg_get_functiondef('legacy_reserve_interaction(uuid,text,text)'::regprocedure) AS body")).rows[0].body;
 await db.exec(await Deno.readTextFile(new URL('20261109_apple_review_sandbox.sql',base)));
 const apply=s=>db.query('SELECT legacy_apply_apple_subscription($1::jsonb)',[JSON.stringify({owner_id:owner,original_transaction_id:'10001',transaction_id:'10002',environment:'Sandbox',product_id:'br.com.meulegado.plus.mensal',active_until:future(),active:true,signed_at:new Date().toISOString(),...s})]);
 const status=async(who=owner)=>(await db.query('SELECT * FROM legacy_apple_review_status($1)',[who])).rows[0];
 const reserve=async(id,who=owner)=>(await db.query('SELECT * FROM legacy_apple_review_reserve($1,$2)',[who,id])).rows[0];
 const complete=async(id,user='Mensagem de teste',assistant='Resposta de teste',who=owner)=>(await db.query('SELECT legacy_apple_review_complete($1,$2,$3,$4) AS saved',[who,id,user,assistant])).rows[0].saved;
 const refund=async(id,who=owner)=>(await db.query('SELECT legacy_apple_review_refund($1,$2) AS refunded',[who,id])).rows[0].refunded;
 return {db,apply,status,reserve,complete,refund,productionDefinition};
}
Deno.test('Sandbox requires its own active purchase, grants exactly 100 and never spends Production quota',async()=>{
 const t=await fixture();try{
 await t.apply({environment:'Production'});
 for(let i=0;i<3;i++)await t.db.query('SELECT * FROM legacy_reserve_interaction($1,$2)',[owner,'production-'+i]);
 let s=await t.status();assert.equal(s.active,false);assert.equal(s.allowance,0);
 assert.equal((await t.reserve('no-sandbox')).reason,'inactive');
 await t.apply({});s=await t.status();assert.equal(s.active,true);assert.equal(s.allowance,100);assert.equal(s.environment,'Sandbox');
 let r=await t.reserve('production-0');assert.equal(r.allowed,true);assert.equal(r.used_count,1,'Message IDs have independent namespaces');
 assert.equal((await t.reserve('production-0')).reason,'in_progress');
 await t.complete('production-0');r=await t.reserve('production-0');assert.equal(r.allowed,true);assert.equal(r.reason,'duplicate');assert.equal(r.response_saved,true);assert.equal(r.used_count,1);
 for(let i=1;i<100;i++){r=await t.reserve('sandbox-'+i);assert.equal(r.allowed,true)}
 r=await t.reserve('sandbox-101');assert.equal(r.allowed,false);assert.equal(r.used_count,100);assert.equal(r.remaining,0);assert.equal(r.reason,'monthly_limit');
 assert.equal((await t.status(other)).allowance,0);assert.equal((await t.reserve('other-message',other)).reason,'inactive');
 const prod=await t.db.query('SELECT included_used FROM legacy_usage_months WHERE owner_id=$1',[owner]);assert.equal(prod.rows[0].included_used,3);
 const prodEvent=await t.db.query('SELECT count(*)::int AS count FROM legacy_usage_events');assert.equal(prodEvent.rows[0].count,3);
 const entitlement=await t.db.query('SELECT plan FROM legacy_user_entitlements WHERE owner_id=$1',[owner]);assert.equal(entitlement.rows[0].plan,'complete');
 const after=(await t.db.query("SELECT pg_get_functiondef('legacy_reserve_interaction(uuid,text,text)'::regprocedure) AS body")).rows[0].body;
 assert.equal(after,t.productionDefinition,'The migration must not replace the Production quota function');
 }finally{await t.db.close()}
});
Deno.test('Sandbox refunds are single use, preserve history and cannot undo a saved response',async()=>{
 const t=await fixture();try{
 await t.apply({});await t.reserve('failed-message');assert.equal(await t.refund('failed-message'),true);assert.equal(await t.refund('failed-message'),false);assert.equal((await t.status()).used_count,0);
 assert.equal((await t.reserve('failed-message')).reason,'refunded');
 await assert.rejects(()=>t.complete('failed-message'),/refunded/);
 await t.reserve('saved-message');assert.equal(await t.complete('saved-message'),true);assert.equal(await t.complete('saved-message'),false);assert.equal(await t.refund('saved-message'),false);
 const rows=await t.db.query('SELECT role,content,ordinal FROM legacy_apple_review_turns ORDER BY ordinal');assert.deepEqual(rows.rows.map(r=>r.role),['user','assistant']);
 const event=await t.db.query('SELECT response_saved,refunded_at IS NOT NULL AS refunded FROM legacy_apple_review_events WHERE message_id=$1',['failed-message']);assert.equal(event.rows[0].refunded,true);
 assert.equal((await t.status()).used_count,1);
 const production=await t.db.query('SELECT count(*)::int AS count FROM legacy_usage_months');assert.equal(production.rows[0].count,0);
 }finally{await t.db.close()}
});
Deno.test('saving a response pair is atomic and a failed save can be refunded exactly once',async()=>{
 const t=await fixture();try{
 await t.apply({});await t.reserve('atomic-message');
 await t.db.exec("ALTER TABLE legacy_apple_review_turns ADD CONSTRAINT reject_test_assistant CHECK(content<>'reject this response');");
 await assert.rejects(()=>t.complete('atomic-message','Test message','reject this response'));
 const turns=await t.db.query('SELECT count(*)::int AS count FROM legacy_apple_review_turns');assert.equal(turns.rows[0].count,0,'The user turn must roll back together with the failed assistant turn');
 const event=await t.db.query('SELECT response_saved FROM legacy_apple_review_events');assert.equal(event.rows[0].response_saved,false);
 assert.equal(await t.refund('atomic-message'),true);assert.equal(await t.refund('atomic-message'),false);
 assert.equal((await t.status()).used_count,0);
 }finally{await t.db.close()}
});
Deno.test('expiry, revocation and stale signed events cannot grant Sandbox benefits or change ownership',async()=>{
 const t=await fixture();try{
 await t.apply({});await t.reserve('pending-at-revocation');
 const latest=new Date(Date.now()+1000).toISOString();
 await t.apply({active:false,signed_at:latest});
 await t.apply({active:true,signed_at:new Date(Date.now()-1000).toISOString()});
 assert.equal((await t.status()).active,false);assert.equal((await t.reserve('after-revocation')).reason,'inactive');
 await assert.rejects(()=>t.complete('pending-at-revocation'),/inactive/);assert.equal(await t.refund('pending-at-revocation'),true);
 await t.apply({active:true,active_until:new Date(Date.now()-1000).toISOString(),signed_at:new Date(Date.now()+2000).toISOString()});
 assert.equal((await t.status()).allowance,0,'Even active=true cannot override an expired date');
 await assert.rejects(()=>t.apply({owner_id:other,active:true,signed_at:new Date(Date.now()+3000).toISOString()}),/owned/);
 assert.equal((await t.status(other)).allowance,0);
 }finally{await t.db.close()}
});
Deno.test('RLS exposes only own Sandbox data and clients cannot write or execute service RPCs',async()=>{
 const t=await fixture();try{
 await t.apply({});await t.reserve('rls-message');await t.complete('rls-message');
 await t.db.exec("SET ROLE authenticated; SET test.role='authenticated';");
 await t.db.query("SELECT set_config('test.uid',$1,false)",[other]);
 for(const table of ['legacy_apple_review_months','legacy_apple_review_events','legacy_apple_review_turns']){
  assert.equal((await t.db.query('SELECT * FROM '+table)).rows.length,0);await assert.rejects(()=>t.db.query('DELETE FROM '+table));
 }
 await t.db.query("SELECT set_config('test.uid',$1,false)",[owner]);
 assert.equal((await t.db.query('SELECT * FROM legacy_apple_review_turns')).rows.length,2);
 await assert.rejects(()=>t.status());await assert.rejects(()=>t.reserve('client-message'));await assert.rejects(()=>t.complete('client-message'));await assert.rejects(()=>t.refund('client-message'));
 await t.db.exec("RESET ROLE; SET test.role='service_role';");
 await assert.rejects(()=>t.complete('rls-message','test','reply',other),/not found/);
 }finally{await t.db.close()}
});
Deno.test('rollback disables Sandbox review and preserves audit history and Production behavior',async()=>{
 const t=await fixture();try{
 await t.apply({});await t.reserve('rollback-message');await t.complete('rollback-message');
 await t.db.exec(await Deno.readTextFile(new URL('../supabase/rollback/20261109_apple_review_sandbox.sql',import.meta.url)));
 await assert.rejects(()=>t.status(),/disabled/);await assert.rejects(()=>t.reserve('after-rollback'),/disabled/);await assert.rejects(()=>t.refund('rollback-message'),/disabled/);
 assert.equal((await t.db.query('SELECT count(*)::int AS count FROM legacy_apple_review_turns')).rows[0].count,2);
 assert.equal((await t.db.query('SELECT count(*)::int AS count FROM legacy_apple_review_events')).rows[0].count,1);
 const after=(await t.db.query("SELECT pg_get_functiondef('legacy_reserve_interaction(uuid,text,text)'::regprocedure) AS body")).rows[0].body;assert.equal(after,t.productionDefinition);
 const prod=await t.db.query('SELECT * FROM legacy_reserve_interaction($1,$2)',[owner,'production-after-rollback']);assert.equal(prod.rows[0].allowance,10);
 await t.db.exec("SET ROLE service_role;");
 await assert.rejects(()=>t.db.query('SELECT * FROM legacy_apple_review_turns'));
 await t.db.exec('RESET ROLE');
 }finally{await t.db.close()}
});
