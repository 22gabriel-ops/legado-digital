import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
function deferred(){let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}}
function page(){
 const known=new Map([...html.matchAll(/<[^>]+\bid=["']([^"']+)["'][^>]*>/g)].map(m=>[m[1],m[0]]));
 const elements=new Map(),requests=[],state={active:true,used:0,failStatus:false,hook:null};
 function node(tag='div',attrs=''){
  const classes=new Set((attrs.match(/\bclass="([^"]*)"/)?.[1]||'').split(/\s+/).filter(Boolean));
  const attributes=new Map();const n={tag,value:'',textContent:'',disabled:/\sdisabled(?:\s|>|=)/.test(attrs),options:[],style:{},children:[],parentNode:null,type:'text',
   classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle:(x,on)=>{if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x)}},
   addEventListener(){},checkValidity:()=>true,scrollIntoView(){},focus(){},
   setAttribute:(key,value)=>attributes.set(key,value),getAttribute:key=>attributes.get(key)||null,removeAttribute:key=>attributes.delete(key),
   appendChild(child){child.parentNode=n;n.children.push(child)},
   replaceChildren(...children){for(const c of n.children)c.parentNode=null;n.children=[];for(const c of children)n.appendChild(c)},
   remove(){if(n.parentNode)n.parentNode.children=n.parentNode.children.filter(c=>c!==n);n.parentNode=null},
  };Object.defineProperty(n,'lastElementChild',{get:()=>n.children.at(-1)});return n;
 }
 function element(id){
  assert.ok(known.has(id),'JavaScript requested an id absent from the actual HTML: '+id);
  if(!elements.has(id))elements.set(id,node('div',known.get(id)));
  return elements.get(id);
 }
 const store={products:async()=>({products:[{id:'br.com.meulegado.plus.mensal',price:'R$ 19,90'}]}),pending:async()=>({transactions:[]}),addListener:async()=>{},purchase:async()=>({status:'purchased',transactionId:'123456789',environment:'Sandbox'}),finish:async()=>{}};
 const response=(body,status=200)=>({ok:status>=200&&status<300,status,text:async()=>JSON.stringify(body)});
 const status=()=>({environment:'Sandbox',active:state.active,usage:{used:state.used,limit:state.active?100:0,remaining:state.active?100-state.used:0}});
 const context=vm.createContext({window:{Capacitor:{getPlatform:()=> 'ios',isPluginAvailable:()=>true,Plugins:{LegacyStoreKit:store}}},
  document:{getElementById:element,querySelectorAll:()=>[],createElement:tag=>node(tag)},location:{hostname:'localhost',pathname:'/index.html',search:'',hash:''},history:{replaceState(){}},
  localStorage:{getItem:()=>null,setItem(){},removeItem(){}},URLSearchParams,requestAnimationFrame:fn=>fn(),
  fetch:async(url,options={})=>{
   const route=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;requests.push({route,body});
   if(state.hook){const overridden=await state.hook(route,body);if(overridden)return overridden}
   if(route==='/functions/v1/apple-subscription')return response({verified:true,active:true,environment:'Sandbox',sandboxReviewAvailable:true});
   if(route==='/functions/v1/apple-review-conversation'){
    if(body.action==='status')return state.failStatus?response({error:'Teste indisponível'},503):response(status());
    if(!state.active)return response({error:'Assinatura inativa'},403);
    if(body.action==='list')return response({...status(),turns:[{role:'user',content:'História fictícia',created_at:'2026-11-09T00:00:00Z'},{role:'assistant',content:'Resposta fictícia',created_at:'2026-11-09T00:00:01Z'}]});
    if(body.action==='message'){state.used++;return response({...status(),reply:'Resposta da conversa isolada'})}
    throw Error('Unexpected review action');
   }
   if(route==='/functions/v1/legacy-conversation')return response({turns:[],reply:'Resposta da conversa normal'});
   return response([]);
  }});
 for(const script of scripts)vm.runInContext(script.replace('window.LEGACY_APPLE_BILLING_READY = false;','window.LEGACY_APPLE_BILLING_READY = true;'),context);
 const run=code=>vm.runInContext(code,context),flush=()=>new Promise(resolve=>setImmediate(resolve));
 async function signIn(owner='owner-A'){run(`setLoggedIn(${JSON.stringify({access_token:'test-token-'+owner,user:{id:owner,email:'test@example.invalid',user_metadata:{}}})})`);await flush()}
 async function enter(){await element('subscribe-plus').onclick();await element('enter-apple-review').onclick();await flush()}
 return {context,element,requests,state,run,flush,signIn,enter,response};
}

test('complete page keeps native purchase opt-in and all test status/list/message traffic isolated',async()=>{
 const t=page();await t.signIn();await t.element('subscribe-plus').onclick();
 assert.equal(t.run('isAppleReview()'),false,'Purchasing must not silently switch the conversation');
 assert.equal(t.element('apple-review-card').classList.contains('hidden'),false);
 const before=t.requests.length;await t.element('enter-apple-review').onclick();await t.flush();
 assert.equal(t.run('isAppleReview()'),true);
 assert.deepEqual(t.requests.slice(before).map(r=>r.route),Array(3).fill('/functions/v1/apple-review-conversation'));
 assert.match(t.element('chat-quota').textContent,/0 de 100/);
 t.element('chat-input').value='Uma história fictícia';await t.element('chat-send').onclick();await t.flush();
 assert.equal(t.element('chat-messages').lastElementChild.textContent,'Resposta da conversa isolada');
 assert.match(t.element('chat-quota').textContent,/1 de 100/);
 assert.ok(t.requests.slice(before).every(r=>r.route==='/functions/v1/apple-review-conversation'));
 assert.ok(t.requests.some(r=>r.route==='/functions/v1/apple-review-conversation'&&r.body.action==='message'&&r.body.message==='Uma história fictícia'));
});
for(const failure of ['expiry','outage'])test('complete page blocks '+failure+' without Production fallback and restores controls for a new account',async()=>{
 const t=page();await t.signIn();await t.enter();const before=t.requests.length;
 if(failure==='expiry')t.state.active=false;else t.state.failStatus=true;
 await t.run('loadLegacyPlan()');
 assert.equal(t.element('chat-send').disabled,true);assert.equal(t.element('chat-input').disabled,true);
 t.element('chat-input').value='Não enviar';await t.element('chat-send').onclick();await t.flush();
 assert.ok(t.requests.slice(before).every(r=>r.route==='/functions/v1/apple-review-conversation'));
 assert.equal(t.requests.slice(before).some(r=>r.body?.action==='message'),false);
 await t.element('logout').onclick();await t.signIn('owner-B');
 assert.equal(t.run('isAppleReview()'),false);assert.equal(t.run('appleReviewAvailableOwner'),null);
 assert.equal(t.element('chat-send').disabled,false);assert.equal(t.element('chat-input').disabled,false);
 assert.equal(t.element('apple-review-card').classList.contains('hidden'),true);
});
test('a normal quota response arriving after Sandbox opt-in cannot overwrite its authoritative quota',async()=>{
 const t=page();await t.signIn();await t.element('subscribe-plus').onclick();
 const wait=deferred(),entered=deferred();t.state.hook=async route=>{
  if(route==='/rest/v1/legacy_usage_months'){entered.resolve();return wait.promise}
 };
 const pendingNormal=t.run('loadLegacyPlan()');await entered.promise;
 await t.element('enter-apple-review').onclick();await t.flush();
 assert.match(t.element('chat-quota').textContent,/0 de 100/);
 wait.resolve(t.response([{included_used:9}]));await pendingNormal;await t.flush();
 assert.match(t.element('chat-quota').textContent,/0 de 100/);assert.match(t.element('legacy-plan-label').textContent,/teste Apple/);
});
