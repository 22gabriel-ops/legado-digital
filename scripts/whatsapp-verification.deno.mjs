import assert from 'node:assert/strict';
// Replace only the external SDK import; the real handler uses injected adapters.
// The default client is deliberately unusable, so no cache download or network is needed.
const source=await Deno.readTextFile(new URL('../supabase/functions/verify-whatsapp/index.ts',import.meta.url));
const sdkImport="import { createClient } from 'npm:@supabase/supabase-js@2';";
assert.equal(source.split(sdkImport).length,2);
const offlineSource=source.replace(sdkImport,"function createClient(..._args: unknown[]): any { throw new Error('Offline test requires an injected client'); }");
const moduleURL='data:application/typescript;base64,'+btoa(String.fromCharCode(...new TextEncoder().encode(offlineSource)));
const savedServe=Deno.serve;Deno.serve=()=>({});
const {createPhoneVerificationHandler}=await import(moduleURL);
Deno.serve=savedServe;

const owner='11111111-1111-4111-8111-111111111111';
const phone='+12025550123'; // Fictional fixture, never used outside the fake adapter.
const start=Date.parse('2026-11-11T12:00:00Z');
const fakeCode='FIXTURE_NOT_A_VALID_OTP';
const fakeSecret='fixture-only-not-production-secret-0123456789';
const rejection={error:{code:100,message:'Fictional rejected request',is_transient:false}};
function pending(overrides={}){
 return {id:'22222222-2222-4222-8222-222222222222',owner_id:owner,phone_e164:phone,status:'pending',created_at:new Date(start-120000).toISOString(),expires_at:new Date(start+480000).toISOString(),attempts:0,...overrides};
}
function setup(overrides={}){
 const state={now:start,secret:fakeSecret,token:'fixture-token-not-valid',sender:'fixture-sender-not-valid',enabled:'true',rows:[],codes:[],user:{id:owner,email_confirmed_at:'2026-01-01',user_metadata:{whatsapp_phone:phone.slice(1),whatsapp_opt_in:true}},httpStatus:200,receipt:{messages:[{id:'fixture-message-id',message_status:'accepted'}]},...overrides};
 const calls=[],logs=[];let serial=0;
 function table(name){
  assert.ok(['legacy_phone_verifications','legacy_phone_codes'].includes(name));
  let op='select',value,columns='*',single=false,order,limit;
  const filters=[];
  const q={select(c){columns=c;return q},eq(k,v){filters.push(['eq',k,v]);return q},gt(k,v){filters.push(['gt',k,v]);return q},order(k,{ascending}){order={k,ascending};return q},limit(n){limit=n;return q},insert(v){op='insert';value=v;return q},update(v){op='update';value=v;return q},delete(){op='delete';return q},single(){single=true;return execute()},then(resolve,reject){return execute().then(resolve,reject)}};
  async function execute(){
   calls.push({kind:'db',table:name,op,filters:structuredClone(filters),value:structuredClone(value),columns});
   const collection=name==='legacy_phone_verifications'?state.rows:state.codes;
   const matches=row=>filters.every(([kind,key,v])=>kind==='eq'?row[key]===v:row[key]>v);
   if(op==='insert'){
    if(name==='legacy_phone_verifications'){
     if(state.insertError)return {data:null,error:{code:'fixture-insert-error'}};
     const row={id:'fixture-attempt-'+(++serial),status:'pending',attempts:0,created_at:new Date(state.now).toISOString(),...value};
     collection.push(row);return {data:single?{id:row.id}:[{id:row.id}],error:null};
    }
    if(state.storeError)return {data:null,error:{code:'fixture-store-error'}};
    collection.push({...value});return {data:null,error:null};
   }
   let rows=collection.filter(matches);
   if(op==='update'){
    if(value.status==='cancelled'){
     if(state.cancelThrows)throw Error('fixture cancellation transport failure');
     if(state.cancelError)return {data:null,error:{code:'fixture-cancel-error'}};
     if(state.cancelNoRows)return {data:[],error:null};
    }
    if('attempts' in value&&state.claimConflict)return {data:[],error:null};
    for(const row of rows)Object.assign(row,value);
   }
   if(op==='delete'){for(const row of rows)collection.splice(collection.indexOf(row),1);return {data:null,error:null}}
   if(order)rows.sort((a,b)=>(String(a[order.k]).localeCompare(String(b[order.k])))*(order.ascending?1:-1));
   if(limit!==undefined)rows=rows.slice(0,limit);
   let data=rows.map(row=>columns==='*'?row:Object.fromEntries(columns.split(',').map(k=>[k,row[k]])));
   if(single)return data.length===1?{data:structuredClone(data[0]),error:null}:{data:null,error:{code:'fixture-single-row'}};
   return {data:structuredClone(data),error:null};
  }
  return q;
 }
 const deps={
  env:name=>({SUPABASE_URL:'https://verification-unit.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-service-key',SUPABASE_ANON_KEY:'fixture-public-key',OTP_HASH_SECRET:state.secret,WHATSAPP_ACCESS_TOKEN:state.token,WHATSAPP_PHONE_NUMBER_ID:state.sender,PHONE_VERIFICATION_ENABLED:state.enabled})[name]||'',
  createClient:(_url,key)=>key==='fixture-public-key'?{auth:{getUser:async()=>({data:{user:state.user},error:null})}}:{from:table},
  now:()=>state.now,
  generateCode:()=>{calls.push({kind:'generate-fixture'});return fakeCode},
  hashCode:async()=>{calls.push({kind:'hash-fixture'});if(state.hashThrows)throw Error(fakeSecret+' '+fakeCode);return 'fixture-hash-not-a-real-HMAC'},
  fetch:async(url,options)=>{
   assert.equal(new URL(String(url)).origin,'https://graph.facebook.com');
   const payload=JSON.parse(options.body);assert.equal(payload.template.components[0].parameters[0].text,fakeCode);assert.doesNotMatch(fakeCode,/^\d{6}$/);
   calls.push({kind:'transport-fixture'});
   if(state.fetchThrows)throw Error('fixture transport outcome unknown');
   return {ok:state.httpStatus>=200&&state.httpStatus<300,status:state.httpStatus,json:async()=>{if(state.unreadable)throw Error('fixture unreadable body');return state.receipt}};
  },
  logError:(...args)=>logs.push(args),logInfo:(...args)=>logs.push(args),
 };
 const handler=createPhoneVerificationHandler(deps);
 const request=(body={action:'request',phone},headers={authorization:'Bearer fixture-not-a-jwt'})=>handler(new Request('https://verification-unit.invalid',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}));
 const count=kind=>calls.filter(c=>c.kind===kind).length;
 return {state,calls,logs,request,count};
}
for(const missing of ['secret','token','sender'])Deno.test('request preflight '+missing+' failure never reserves or generates a code',async()=>{
 const t=setup({[missing]:''});const r=await t.request();assert.equal(r.status,503);assert.equal(t.count('db'),0);assert.equal(t.count('generate-fixture'),0);assert.equal(t.count('transport-fixture'),0);
});
Deno.test('unconfirmed, anonymous and disabled requests do not create verification state',async()=>{
 for(const t of [setup({user:null}),setup({user:{id:owner,email_confirmed_at:null}}),setup({enabled:''})]){
  assert.ok([401,403,503].includes((await t.request()).status));assert.equal(t.count('db'),0);assert.equal(t.count('generate-fixture'),0);
 }
 const t=setup();assert.equal((await t.request(undefined,{})).status,401);assert.equal(t.calls.length,0);
});
for(const failure of ['hashThrows','storeError'])Deno.test(failure+' before transport cancels only the reserved pending owner row',async()=>{
 const t=setup({[failure]:true});const r=await t.request();assert.equal(r.status,503);assert.equal((await r.json()).code,'verification_prepare_failed');assert.equal(t.state.rows[0].status,'cancelled');assert.equal(t.count('transport-fixture'),0);
 const cancel=t.calls.find(c=>c.kind==='db'&&c.op==='update'&&c.value?.status==='cancelled');assert.deepEqual(cancel.filters,[['eq','id','fixture-attempt-1'],['eq','owner_id',owner],['eq','status','pending']]);assert.equal(cancel.columns,'id');
 assert.ok(!JSON.stringify(t.logs).includes(fakeCode));assert.ok(!JSON.stringify(t.logs).includes(fakeSecret));assert.ok(!JSON.stringify(t.logs).includes(phone));
});
for(const failure of ['cancelError','cancelNoRows','cancelThrows'])Deno.test(failure+' cannot claim a failed preparation released its reservation',async()=>{
 const t=setup({storeError:true,[failure]:true});const r=await t.request();const body=await r.json();assert.equal(r.status,503);assert.equal(body.code,'verification_state_unconfirmed');assert.equal(t.state.rows[0].status,'pending');assert.equal(body.retry_after_seconds,600);assert.equal(t.count('transport-fixture'),0);
 assert.match(body.error,/envio do código não foi iniciado/);assert.doesNotMatch(body.error,/Se recebeu|recebida para processamento|confirmar o envio/);
 assert.equal((await t.request()).status,429);assert.equal(t.state.rows.length,1);assert.equal(t.count('generate-fixture'),1);
});
Deno.test('hash failure with failed cancellation never suggests a provider request or delivery happened',async()=>{
 const t=setup({hashThrows:true,cancelError:true});const r=await t.request();const body=await r.json();assert.equal(r.status,503);assert.equal(body.code,'verification_state_unconfirmed');assert.match(body.error,/envio do código não foi iniciado/);assert.doesNotMatch(body.error,/Se recebeu|recebida para processamento|confirmar o envio/);assert.equal(t.count('transport-fixture'),0);assert.equal(t.state.rows[0].status,'pending');
});
Deno.test('explicit rejection with failed cancellation states refusal without implying uncertain acceptance',async()=>{
 const t=setup({httpStatus:400,receipt:rejection,cancelError:true});const r=await t.request();const body=await r.json();assert.equal(r.status,503);assert.equal(body.code,'verification_state_unconfirmed');assert.match(body.error,/WhatsApp recusou/);assert.doesNotMatch(body.error,/Se recebeu|recebida para processamento|confirmar o envio/);assert.equal(t.count('transport-fixture'),1);assert.equal(t.state.rows[0].status,'pending');
});
for(const status of [400,401,403,429])Deno.test('explicit non-transient Graph '+status+' rejection cancels, then retains the 60-second cooldown',async()=>{
 const t=setup({httpStatus:status,receipt:rejection});const r=await t.request();assert.equal(r.status,502);assert.equal((await r.json()).code,'verification_send_rejected');assert.equal(t.state.rows[0].status,'cancelled');assert.equal(t.count('transport-fixture'),1);
 assert.equal((await t.request()).status,429);assert.equal(t.count('transport-fixture'),1);
});
for(const status of [408,500,502,504])Deno.test('uncertain HTTP '+status+' retains pending even with an error-shaped body',async()=>{
 const t=setup({httpStatus:status,receipt:rejection});const r=await t.request();assert.equal(r.status,503);assert.equal((await r.json()).code,'verification_submission_unknown');assert.equal(t.state.rows[0].status,'pending');assert.equal(t.calls.some(c=>c.value?.status==='cancelled'),false);
 assert.equal((await t.request()).status,429);assert.equal(t.count('transport-fixture'),1);
});
for(const state of [{httpStatus:400,unreadable:true},{httpStatus:400,receipt:{}},{httpStatus:400,receipt:{error:{code:100,message:'fixture transient',is_transient:true}}},{httpStatus:400,receipt:{error:{code:100,message:'fixture malformed transient',is_transient:'false'}}},{httpStatus:400,receipt:{...rejection,messages:[{id:'fixture-id'}]}},{httpStatus:200,receipt:{...rejection,messages:[{id:'fixture-id'}]}},{httpStatus:200,receipt:{messages:[]}},{httpStatus:200,receipt:{messages:{0:{id:'fixture-id'}}}},{httpStatus:200,unreadable:true},{fetchThrows:true}])Deno.test('ambiguous provider payload or transport keeps the existing request: '+JSON.stringify(state),async()=>{
 const t=setup(state);const r=await t.request();assert.equal(r.status,503);assert.equal((await r.json()).code,'verification_submission_unknown');assert.equal(t.state.rows[0].status,'pending');assert.equal(t.count('transport-fixture'),1);assert.equal(t.calls.some(c=>c.value?.status==='cancelled'),false);
});
Deno.test('provider receipt means processing, not delivery or phone verification',async()=>{
 const t=setup();const r=await t.request();const body=await r.json();assert.equal(r.status,200);assert.equal(body.ok,true);assert.match(body.message,/entrega ainda não foi confirmada/);assert.equal(body.expires_in_seconds,600);assert.equal(t.state.rows[0].status,'pending');assert.equal(t.state.rows[0].expires_at,new Date(start+600000).toISOString());assert.equal(t.state.rows[0].attempts,0);
 assert.equal(t.state.codes[0].code_hash,'fixture-hash-not-a-real-HMAC');assert.ok(!JSON.stringify(body).includes(fakeCode));assert.ok(!JSON.stringify(t.logs).includes(fakeCode));assert.ok(!JSON.stringify(t.logs).includes(phone));assert.ok(!JSON.stringify(t.logs).includes(t.state.token));
});
Deno.test('existing pending request returns remaining TTL, never resends and never claims delivery',async()=>{
 const t=setup({rows:[pending()]});const r=await t.request();const body=await r.json();assert.equal(r.status,429);assert.equal(body.code,'verification_pending');assert.equal(body.retry_after_seconds,480);assert.equal(body.expires_at,pending().expires_at);assert.match(body.error,/Se você recebeu/);assert.equal(t.count('transport-fixture'),0);assert.equal(t.count('generate-fixture'),0);assert.equal(t.state.rows.length,1);
});
Deno.test('expired pending permits a new request only after the unchanged cooldown',async()=>{
 const row=pending({expires_at:new Date(start).toISOString()});const t=setup({rows:[row]});assert.equal((await t.request()).status,200);assert.equal(row.status,'expired');assert.equal(t.state.rows.length,2);assert.equal(t.count('transport-fixture'),1);
 const recent=setup({rows:[pending({created_at:new Date(start-30000).toISOString(),expires_at:new Date(start).toISOString()})]});assert.equal((await recent.request()).status,429);assert.equal(recent.count('transport-fixture'),0);
});
Deno.test('another verified owner prevents all new verification mutations',async()=>{
 const t=setup({rows:[pending({owner_id:'33333333-3333-4333-8333-333333333333',status:'verified'})]});assert.equal((await t.request()).status,409);assert.equal(t.state.rows.length,1);assert.equal(t.count('generate-fixture'),0);assert.equal(t.count('transport-fixture'),0);
});
for(const action of ['request','confirm'])Deno.test(action+' with two pending rows fails closed before any mutation or code operation',async()=>{
 const rows=[pending({id:'fixture-old-pending',expires_at:new Date(start-1).toISOString()}),pending({id:'fixture-current-pending'})];
 const t=setup({rows});const r=await t.request(action==='request'?{action,phone}:{action,code:'000000'});const body=await r.json();
 assert.equal(r.status,409);assert.equal(body.code,'verification_pending_ambiguous');assert.match(body.error,/única verificação pendente/);assert.equal(t.count('generate-fixture'),0);assert.equal(t.count('hash-fixture'),0);assert.equal(t.count('transport-fixture'),0);assert.equal(t.calls.some(c=>c.kind==='db'&&c.op!=='select'),false);assert.deepEqual(rows,[pending({id:'fixture-old-pending',expires_at:new Date(start-1).toISOString()}),pending({id:'fixture-current-pending'})]);
});
Deno.test('confirm preflight does not consume an attempt when HMAC configuration is missing',async()=>{
 const row=pending();const t=setup({secret:'',rows:[row]});assert.equal((await t.request({action:'confirm',code:'000000'})).status,503);assert.equal(row.attempts,0);assert.equal(t.count('db'),0);assert.equal(t.count('hash-fixture'),0);
});
Deno.test('confirm retains expiry, five-attempt limit and atomic claim conflict',async()=>{
 const expired=setup({rows:[pending({expires_at:new Date(start).toISOString()})]});assert.equal((await expired.request({action:'confirm',code:'000000'})).status,410);assert.equal(expired.state.rows[0].status,'expired');assert.equal(expired.count('hash-fixture'),0);
 const exhausted=setup({rows:[pending({attempts:5})]});assert.equal((await exhausted.request({action:'confirm',code:'000000'})).status,429);assert.equal(exhausted.state.rows[0].attempts,5);assert.equal(exhausted.count('hash-fixture'),0);
 const conflict=setup({rows:[pending()],claimConflict:true});assert.equal((await conflict.request({action:'confirm',code:'000000'})).status,409);assert.equal(conflict.state.rows[0].status,'pending');assert.equal(conflict.count('transport-fixture'),0);
});
Deno.test('fixed non-real confirmation data cannot verify a mismatched hash',async()=>{
 const t=setup({rows:[pending()],codes:[{verification_id:pending().id,code_hash:'fixture-wrong-hash'}]});assert.equal((await t.request({action:'confirm',code:'000000'})).status,400);assert.equal(t.state.rows[0].attempts,1);assert.equal(t.state.rows[0].status,'pending');assert.equal(t.count('generate-fixture'),0);assert.equal(t.count('transport-fixture'),0);
});
Deno.test('confirming a previously received fixture does not require sender config or a new send',async()=>{
 const t=setup({token:'',sender:'',enabled:'',rows:[pending()],codes:[{verification_id:pending().id,code_hash:'fixture-hash-not-a-real-HMAC'}]});const r=await t.request({action:'confirm',code:'000000'});assert.equal(r.status,200);assert.equal((await r.json()).verified,true);assert.equal(t.state.rows[0].status,'verified');assert.equal(t.state.codes.length,0);assert.equal(t.count('generate-fixture'),0);assert.equal(t.count('transport-fixture'),0);
});
