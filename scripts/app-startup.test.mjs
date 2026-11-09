import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function startup(capacitor){
 const elements=new Map(),requests=[];
 function element(id){
  if(!elements.has(id)){
   const hidden=new Set();
   elements.set(id,{value:'',textContent:'',disabled:false,options:[],style:{},
    classList:{add:x=>hidden.add(x),remove:x=>hidden.delete(x),contains:x=>hidden.has(x),toggle:(x,on)=>on?hidden.add(x):hidden.delete(x)},
    addEventListener(){},checkValidity:()=>true,scrollIntoView(){},focus(){},replaceChildren(){},appendChild(){},getAttribute:()=>null});
  }
  return elements.get(id);
 }
 const store={products:async()=>({products:[{id:'br.com.meulegado.plus.mensal',price:'R$ 19,90'}]}),pending:async()=>({transactions:[]}),addListener:async()=>{}};
 const cap=capacitor(store);
 const context=vm.createContext({window:{Capacitor:cap},document:{getElementById:element,querySelectorAll:()=>[],createElement:()=>element('generated')},
  location:{hostname:'localhost',pathname:'/index.html',search:'',hash:''},history:{replaceState(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},URLSearchParams,
  fetch:async(url,options)=>{requests.push({url,options});const data=url.includes('/auth/v1/token')?{access_token:'test-only-token',user:{id:'test-only-owner',email:'tester@example.invalid',user_metadata:{}}}:url.includes('/legacy-conversation')?{turns:[]}:[];return {ok:true,text:async()=>JSON.stringify(data)}}});
 for(const script of scripts)vm.runInContext(script.replace('window.LEGACY_APPLE_BILLING_READY = false;','window.LEGACY_APPLE_BILLING_READY = true;'),context);
 return {element,requests,context};
}

test('full iOS startup and login work with the injected Capacitor plugin and no registerPlugin',async()=>{
 const t=startup(store=>({getPlatform:()=> 'ios',isPluginAvailable:()=>true,Plugins:{LegacyStoreKit:store}}));
 assert.equal(typeof t.element('auth-submit').onclick,'function');
 t.element('email').value='tester@example.invalid';t.element('password').value='test-only-password';
 await t.element('auth-submit').onclick();
 assert.equal(t.requests[0].url.endsWith('/auth/v1/token?grant_type=password'),true);
 assert.equal(t.element('status').textContent,'Login realizado.');
 assert.equal(t.element('auth').classList.contains('hidden'),true);
 assert.equal(t.element('auth-submit').disabled,false);
});

test('a broken optional purchase bridge cannot disable login or recovery controls',()=>{
 const t=startup(()=>({getPlatform:()=> 'ios',isPluginAvailable:()=>true,registerPlugin(){throw Error('Native bridge unavailable')}}));
 assert.equal(typeof t.element('auth-submit').onclick,'function');
 assert.equal(typeof t.element('forgot').onclick,'function');
});


test('a delayed refresh cannot replace a newly signed-in account or send its transaction',async()=>{
 const t=startup(store=>({getPlatform:()=> 'ios',isPluginAvailable:()=>true,Plugins:{LegacyStoreKit:store}}));
 let complete;const refresh=new Promise(resolve=>{complete=resolve});const routes=[];
 t.context.fetch=async url=>{routes.push(url);return refresh};
 vm.runInContext("keepSession({access_token:'old',refresh_token:'refresh-A',expires_at:1,user:{id:'owner-A'}})",t.context);
 const pending=vm.runInContext("authorized('/functions/v1/apple-subscription',{method:'POST',body:{transactionId:'123456789'},expectedOwner:'owner-A'})",t.context);
 vm.runInContext("keepSession({access_token:'new',user:{id:'owner-B'}})",t.context);
 complete({ok:true,text:async()=>JSON.stringify({access_token:'refreshed-old',user:{id:'owner-A'}})});
 await assert.rejects(pending,/conta mudou/);
 assert.equal(vm.runInContext('session.user.id',t.context),'owner-B');
 assert.equal(routes.length,1);assert.match(routes[0],/grant_type=refresh_token/);
});


test('concurrent requests for the same account share one refresh and retain their owner',async()=>{
 const t=startup(store=>({getPlatform:()=> 'ios',isPluginAvailable:()=>true,Plugins:{LegacyStoreKit:store}}));
 let complete;const refresh=new Promise(resolve=>{complete=resolve});const routes=[];
 t.context.fetch=async url=>{routes.push(url);return url.includes('refresh_token')?refresh:{ok:true,text:async()=>JSON.stringify({ok:true})}};
 vm.runInContext("keepSession({access_token:'old',refresh_token:'refresh-A',expires_at:1,user:{id:'owner-A'}})",t.context);
 const first=vm.runInContext("authorized('/first')",t.context),second=vm.runInContext("authorized('/second')",t.context);
 complete({ok:true,text:async()=>JSON.stringify({access_token:'refreshed-A',expires_at:9999999999,user:{id:'owner-A'}})});
 await Promise.all([first,second]);
 assert.equal(routes.filter(x=>x.includes('refresh_token')).length,1);assert.equal(routes.length,3);
 assert.equal(vm.runInContext('session.user.id',t.context),'owner-A');
});


test('logout or account switch clears isolated test context and its availability',async()=>{
 const t=startup(store=>({getPlatform:()=> 'ios',isPluginAvailable:()=>true,Plugins:{LegacyStoreKit:store}}));
 vm.runInContext("keepSession({access_token:'old',user:{id:'owner-A'}});appleReviewOwner='owner-A';appleReviewAvailableOwner='owner-A';setLoggedIn({access_token:'new',user:{id:'owner-B',user_metadata:{}}})",t.context);
 assert.equal(vm.runInContext('appleReviewOwner',t.context),null);assert.equal(vm.runInContext('appleReviewAvailableOwner',t.context),null);
 assert.equal(vm.runInContext('chatContext().endpoint',t.context),'/functions/v1/legacy-conversation');
});
