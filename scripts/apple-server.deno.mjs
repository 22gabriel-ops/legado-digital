import assert from 'node:assert/strict';
Deno.env.set('APPLE_IAP_PRIVATE_KEY','invalid-test-key');
Deno.env.set('APPLE_IAP_KEY_ID','test');
Deno.env.set('APPLE_IAP_ISSUER_ID','test');
let handler;
const originalServe=Deno.serve;
Deno.serve=(fn)=>{handler=fn;return {}};
await import('../supabase/functions/apple-subscription/index.ts');
const subscriptionHandler=handler;
await import('../supabase/functions/apple-notifications/index.ts');
const notificationHandler=handler;
Deno.serve=originalServe;
Deno.test('verification rejects requests without a logged-in account',async()=>{
 const r=await subscriptionHandler(new Request('http://localhost',{method:'POST',body:'{}'}));assert.equal(r.status,401);
});
Deno.test('verification rejects third-party origins',async()=>{
 const r=await subscriptionHandler(new Request('http://localhost',{method:'POST',headers:{origin:'https://example.com'},body:'{}'}));assert.equal(r.status,403);
});
Deno.test('notification cannot activate a subscription using unsigned JSON',async()=>{
 const r=await notificationHandler(new Request('http://localhost',{method:'POST',body:JSON.stringify({active:true,owner_id:'someone'})}));assert.equal(r.status,400);
});
Deno.test('notification rejects a forged signed payload',async()=>{
 const r=await notificationHandler(new Request('http://localhost',{method:'POST',body:JSON.stringify({signedPayload:'fake.payload.signature'})}));assert.equal(r.status,400);
});
Deno.test('a confirmed reviewer account outside the Sandbox allowlist is rejected before Apple validation',async()=>{
 const originalFetch=globalThis.fetch;
 const requests=[];
 const keys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','APPLE_IAP_SANDBOX_TESTERS'];
 const previous=keys.map(key=>Deno.env.get(key));
 Deno.env.set(keys[0],'https://unit-test.example.invalid');
 Deno.env.set(keys[1],'unit-test-key');
 Deno.env.set(keys[2],'11111111-1111-4111-8111-111111111111');
 globalThis.fetch=async url=>{
  requests.push(String(url));
  assert.equal(String(url),'https://unit-test.example.invalid/auth/v1/user');
  return new Response(JSON.stringify({id:'22222222-2222-4222-8222-222222222222',email_confirmed_at:'2026-01-01T00:00:00Z'}),{headers:{'Content-Type':'application/json'}});
 };
 try{
  const response=await subscriptionHandler(new Request('http://localhost',{method:'POST',headers:{authorization:'Bearer unit-test-token'},body:JSON.stringify({transactionId:'123456789',environment:'Sandbox'})}));
  assert.equal(response.status,403);
  assert.match((await response.json()).error,/não autorizada para testes/);
  assert.equal(requests.length,1,'No Apple API or entitlement write may run');
  await new Promise(resolve=>setTimeout(resolve,0)); // Complete the SDK's deferred initialization.
 }finally{
  globalThis.fetch=originalFetch;
  keys.forEach((key,i)=>previous[i]===undefined?Deno.env.delete(key):Deno.env.set(key,previous[i]));
 }
});
