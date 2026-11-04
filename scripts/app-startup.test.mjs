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
 return {element,requests};
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
