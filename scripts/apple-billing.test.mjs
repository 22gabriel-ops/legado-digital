import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const billing=html.slice(html.indexOf('const appleNative='),html.indexOf('function setLoggedIn(s){'));
function setup({status='purchased',verified=true,environment='Sandbox'}={}){
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{textContent:'',disabled:true});return elements.get(id)};
 const calls=[];
 const store={products:async()=>({products:[{id:'br.com.meulegado.plus.mensal',price:'R$ 19,90'}]}),purchase:async()=>({status,transactionId:'123456789',environment}),pending:async()=>({transactions:[]}),restore:async()=>({transactions:[]}),addListener:async()=>{},finish:async item=>calls.push(['finish',item])};
 const context=vm.createContext({window:{LEGACY_APPLE_BILLING_READY:true,Capacitor:{getPlatform:()=> 'ios',isPluginAvailable:()=>true,registerPlugin:()=>store}},session:{user:{id:'owner'}},$:element,loadLegacyPlan:async()=>calls.push(['refresh']),authorized:async(endpoint,options)=>{calls.push(['verify',options.body]);if(!verified)throw Error('Validation failed');return {verified:true,active:true,environment}}});
 vm.runInContext(billing,context);
 return {context,element,calls,store};
}
test('purchase is verified before StoreKit finish, with explicit sandbox environment',async()=>{
 const t=setup();await vm.runInContext('setupAppleBilling()',t.context);await t.element('subscribe-plus').onclick();
 assert.deepEqual(t.calls.map(c=>c[0]),['verify','finish','refresh']);assert.equal(t.calls[0][1].environment,'Sandbox');
 assert.match(t.element('subscription-feedback').textContent,/Nenhuma cobrança real/);
});
test('failed server verification preserves unfinished purchase for retry',async()=>{
 const t=setup({verified:false});await vm.runInContext('setupAppleBilling()',t.context);await t.element('subscribe-plus').onclick();
 assert.deepEqual(t.calls.map(c=>c[0]),['verify']);assert.equal(t.element('subscribe-plus').disabled,false);
});
for(const status of ['pending','cancelled'])test(status+' never grants or finishes a transaction',async()=>{
 const t=setup({status});await vm.runInContext('setupAppleBilling()',t.context);await t.element('subscribe-plus').onclick();assert.equal(t.calls.length,0);
});
test('web browser never exposes native checkout',async()=>{
 const t=setup();t.context.window.Capacitor.getPlatform=()=> 'web';
 // Create fresh context so platform decision is evaluated on the browser surface.
 const ctx=vm.createContext({...t.context,window:t.context.window});vm.runInContext(billing,ctx);await vm.runInContext('setupAppleBilling()',ctx);
 assert.equal(t.element('subscribe-plus').disabled,true);assert.equal(t.calls.length,0);
});
