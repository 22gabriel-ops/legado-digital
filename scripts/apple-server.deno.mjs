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
