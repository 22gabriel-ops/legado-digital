import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const billing=html.slice(html.indexOf('const appleNative='),html.indexOf('function setLoggedIn(s){'));
function setup({status='purchased',verified=true,environment='Sandbox',active=true,platform='ios'}={}){
 const elements=new Map();const element=id=>{
  if(!elements.has(id)) {const classes=new Set();elements.set(id,{textContent:'',disabled:['subscribe-plus','restore-purchases'].includes(id),classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)}})}
  return elements.get(id);
 };
 const calls=[];let listener;
 const store={products:async()=>({products:[{id:'br.com.meulegado.plus.mensal',price:'R$ 19,90'}]}),purchase:async item=>{calls.push(['purchase',item]);return {status,transactionId:'123456789',environment}},pending:async()=>({transactions:[]}),restore:async()=>({transactions:[]}),addListener:async(_,fn)=>{listener=fn},finish:async item=>calls.push(['finish',item])};
 const context=vm.createContext({window:{LEGACY_APPLE_BILLING_READY:true,Capacitor:{getPlatform:()=>platform,isPluginAvailable:()=>true,Plugins:{LegacyStoreKit:store}}},session:{user:{id:'owner'}},$:element,loadLegacyPlan:async()=>calls.push(['refresh']),loadChat:async()=>{},authorized:async(endpoint,options)=>{calls.push(['verify',options.body]);if(!verified)throw Error('Validation failed');return {verified:true,active,environment}}});
 vm.runInContext(billing,context);
 return {context,element,calls,store,setup:()=>vm.runInContext('setupAppleBilling()',context),notify:()=>listener()};
}
test('purchase is verified before StoreKit finish, with the logged-in owner and Sandbox environment',async()=>{
 const t=setup();await t.setup();await t.element('subscribe-plus').onclick();
 assert.deepEqual(t.calls.map(c=>c[0]),['purchase','verify','finish','refresh']);
 assert.equal(t.calls[0][1].owner,'owner');assert.equal(t.calls[1][1].environment,'Sandbox');
 assert.match(t.element('subscription-feedback').textContent,/Nenhuma cobrança real/);
});
test('failed server verification preserves unfinished purchase for retry',async()=>{
 const t=setup({verified:false});await t.setup();await t.element('subscribe-plus').onclick();
 assert.deepEqual(t.calls.map(c=>c[0]),['purchase','verify']);assert.equal(t.element('subscribe-plus').disabled,false);
});
for(const status of ['pending','cancelled'])test(status+' never validates or finishes a transaction',async()=>{
 const t=setup({status});await t.setup();await t.element('subscribe-plus').onclick();assert.deepEqual(t.calls.map(c=>c[0]),['purchase']);
});
test('web browser never exposes native checkout or restore',async()=>{
 const t=setup({platform:'web'});await t.setup();assert.equal(t.element('subscribe-plus').disabled,true);assert.equal(t.calls.length,0);
});
test('restore still validates and finishes a purchase when the catalog returns no products',async()=>{
 const t=setup();t.store.products=async()=>({products:[]});t.store.restore=async()=>({transactions:[{transactionId:'123456789',environment:'Sandbox'}]});
 await t.setup();assert.equal(t.element('subscribe-plus').disabled,true);assert.equal(t.element('restore-purchases').disabled,false);
 await t.element('restore-purchases').onclick();assert.deepEqual(t.calls.map(c=>c[0]),['verify','finish','refresh']);
 assert.equal(t.element('subscribe-plus').disabled,true);
});
test('catalog failures are retryable and only the configured product supplies the visible price',async()=>{
 const t=setup();t.store.products=async()=>{throw Error('offline')};await t.setup();
 assert.equal(t.element('retry-apple-products').classList.contains('hidden'),false);
 assert.equal(t.element('restore-purchases').disabled,false);
 t.store.products=async()=>({products:[{id:'wrong.product',price:'R$ 1,00'},{id:'br.com.meulegado.plus.mensal',price:'US$ 3.99'}]});
 await t.element('retry-apple-products').onclick();
 assert.equal(t.element('plus-price').textContent,'US$ 3.99');assert.match(t.element('subscribe-plus').textContent,/US\$ 3.99/);
 assert.equal(t.element('subscribe-plus').disabled,false);assert.equal(t.element('retry-apple-products').classList.contains('hidden'),true);
});
test('expired Sandbox subscription never displays an active purchase confirmation',async()=>{
 const t=setup({active:false});await t.setup();await t.element('subscribe-plus').onclick();assert.match(t.element('subscription-feedback').textContent,/não está ativa/);
});
test('transaction updates after logout do not use a previous account',async()=>{
 const t=setup();await t.setup();t.context.session=null;await t.notify();assert.equal(t.calls.length,0);
});
test('plan and quota use the same active Production Apple source as the server',async()=>{
 const start=html.indexOf('async function loadLegacyPlan(){'),end=html.indexOf('// Conversa autenticada',start);
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id)};
 let purchases=[];const requests=[];
 const context=vm.createContext({$:element,chatContext:()=>({review:false}),sameChatContext:()=>true,authorized:async route=>{requests.push(route);return route.includes('legacy_apple_subscriptions')?purchases:[{included_used:3}]}});
 vm.runInContext(html.slice(start,end),context);
 await vm.runInContext('loadLegacyPlan()',context);
 assert.match(element('chat-quota').textContent,/3 de 10/);
 purchases=[{active:true,active_until:new Date(Date.now()+86400000).toISOString()}];
 await vm.runInContext('loadLegacyPlan()',context);assert.match(element('chat-quota').textContent,/3 de 100/);
 purchases=[{active:true,active_until:'2000-01-01T00:00:00Z'}];
 await vm.runInContext('loadLegacyPlan()',context);assert.match(element('chat-quota').textContent,/3 de 10/);
 assert.ok(requests.some(x=>x.includes('environment=eq.Production')));assert.ok(!requests.some(x=>x.includes('legacy_user_entitlements')));
});
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
for(const action of ['purchase','restore'])test('switching accounts while '+action+' is pending leaves the original transaction unfinished',async()=>{
 const t=setup();await t.setup();const wait=deferred();
 t.store[action]=async()=>{t.calls.push([action]);return wait.promise};
 const pending=t.element(action==='purchase'?'subscribe-plus':'restore-purchases').onclick();
 t.context.session={user:{id:'another-owner'}};
 wait.resolve(action==='purchase'?{status:'purchased',transactionId:'123456789',environment:'Sandbox'}:{transactions:[{transactionId:'123456789',environment:'Sandbox'}]});
 await pending;assert.deepEqual(t.calls.map(c=>c[0]),[action]);
 assert.match(t.element('subscription-feedback').textContent,/conta original/);
});
test('account change during server validation never finalizes the transaction in the new account',async()=>{
 const t=setup();await t.setup();const wait=deferred(),entered=deferred();
 t.context.authorized=async(_,options)=>{t.calls.push(['verify',options.expectedOwner]);entered.resolve();return wait.promise};
 const pending=t.element('subscribe-plus').onclick();await entered.promise;
 t.context.session={user:{id:'another-owner'}};wait.resolve({verified:true,active:true,environment:'Sandbox'});await pending;
 assert.deepEqual(t.calls.map(c=>c[0]),['purchase','verify']);assert.equal(t.calls[1][1],'owner');
});
test('repeated buy and restore clicks cannot create concurrent StoreKit operations',async()=>{
 const t=setup();await t.setup();const wait=deferred();
 t.store.purchase=async()=>{t.calls.push(['purchase']);return wait.promise};
 t.store.restore=async()=>{t.calls.push(['restore']);return {transactions:[]}};
 const first=t.element('subscribe-plus').onclick();
 assert.equal(t.element('subscribe-plus').disabled,true);assert.equal(t.element('restore-purchases').disabled,true);
 await t.element('subscribe-plus').onclick();await t.element('restore-purchases').onclick();
 wait.resolve({status:'cancelled'});await first;
 assert.deepEqual(t.calls.map(c=>c[0]),['purchase']);assert.equal(t.element('subscribe-plus').disabled,false);assert.equal(t.element('restore-purchases').disabled,false);
 assert.match(t.element('subscription-feedback').textContent,/cancelada/);
});


test('Sandbox purchase only offers an isolated conversation when the server enables it; opt-in is explicit',async()=>{
 const t=setup();await t.setup();
 t.context.authorized=async(route)=>route.includes('apple-review-conversation')?{environment:'Sandbox',active:true,usage:{used:0,limit:100,remaining:100}}:{verified:true,active:true,environment:'Sandbox',sandboxReviewAvailable:true};
 await t.element('subscribe-plus').onclick();
 assert.equal(t.element('apple-review-card').classList.contains('hidden'),false);
 assert.equal(vm.runInContext('chatContext().endpoint',t.context),'/functions/v1/legacy-conversation');
 await t.element('enter-apple-review').onclick();
 assert.equal(vm.runInContext('chatContext().endpoint',t.context),'/functions/v1/apple-review-conversation');
 assert.match(t.element('legacy-chat-title').textContent,/teste Apple/);
});
test('test quota outage and expiry do not fall back to the Production quota',async()=>{
 const t=setup();await t.setup();
 const start=html.indexOf('async function loadLegacyPlan(){'),end=html.indexOf('// Conversa autenticada',start);
 vm.runInContext(html.slice(start,end),t.context);vm.runInContext("appleReviewOwner='owner'",t.context);
 const routes=[];t.context.authorized=async route=>{routes.push(route);throw Error('offline')};
 await vm.runInContext('loadLegacyPlan()',t.context);
 assert.equal(t.element('chat-send').disabled,true);assert.deepEqual(routes,['/functions/v1/apple-review-conversation']);
 t.context.authorized=async route=>{routes.push(route);return {environment:'Sandbox',active:false,usage:{used:10,limit:0,remaining:0}}};
 await vm.runInContext('loadLegacyPlan()',t.context);
 assert.match(t.element('legacy-plan-label').textContent,/inativo/);assert.ok(routes.every(x=>x==='/functions/v1/apple-review-conversation'));
});
test('a delayed test opt-in response cannot activate test mode for another account',async()=>{
 const t=setup();await t.setup();vm.runInContext("appleReviewAvailableOwner='owner'",t.context);
 const wait=deferred();t.context.authorized=()=>wait.promise;
 const pending=t.element('enter-apple-review').onclick();t.context.session={user:{id:'another-owner'}};
 wait.resolve({environment:'Sandbox',active:true,usage:{used:0,limit:100,remaining:100}});await pending;
 assert.equal(vm.runInContext('isAppleReview()',t.context),false);assert.equal(t.element('apple-review-card').classList.contains('hidden'),true);
});
