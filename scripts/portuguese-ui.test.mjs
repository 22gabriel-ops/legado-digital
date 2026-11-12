import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const page=fs.readFileSync(new URL('../guardioes.html',import.meta.url),'utf8');
const code=page.slice(page.indexOf('function guardianErrorMessage('),page.indexOf('async function refresh(){'));
test('technical WhatsApp failures use actionable Portuguese without changing unrelated validation',()=>{
 const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const translation=index.slice(index.indexOf('function mensagemEmPortugues('),index.indexOf('async function api('));
 const state=vm.createContext({});vm.runInContext(translation,state);
 assert.equal(state.mensagemEmPortugues('Meta recusou o envio. Consulte os logs da função.'),'Não foi possível enviar a apresentação pelo WhatsApp agora. Tente novamente mais tarde.');
 assert.equal(state.mensagemEmPortugues('Não foi possível enviar o código. Consulte o status do modelo na Meta.'),'Não foi possível solicitar o código pelo WhatsApp agora. Tente novamente mais tarde.');
 assert.equal(state.mensagemEmPortugues('Confirme o número antes de continuar.'),'Confirme o número antes de continuar.');
});
function context(fetch){
 const state={BASE:'https://example.invalid',KEY:'public-test-key',session:{access_token:'old',refresh_token:'refresh',expires_at:Date.now()/1000+3600},fetch,refreshCalls:0};
 state.refresh=async()=>{state.refreshCalls++;state.session.access_token='renewed'};
 return vm.createContext(state);
}
test('guardian server failures use Portuguese messages without exposing database details',()=>{
 const state=context();vm.runInContext(code,state);
 for(const text of ['Confirme seu e-mail antes de responder','Convite não disponível para esta conta','Resposta inválida','Faça login para responder ao convite'])assert.equal(state.guardianErrorMessage({message:text},400),text);
 assert.equal(state.guardianErrorMessage({code:'23505',message:'duplicate key value violates constraint private_constraint'},409),'Já existe uma indicação com estes dados. Revise seus guardiões.');
 assert.equal(state.guardianErrorMessage({code:'42501',message:'permission denied for table private_table'},403),'Não foi possível realizar esta ação nesta conta.');
 assert.equal(state.guardianErrorMessage({message:'Internal Server Error'},500),'Não foi possível concluir esta ação. Tente novamente.');
 assert.equal(state.guardianErrorMessage({},429),'Muitas tentativas. Aguarde um pouco e tente novamente.');
});
test('translated expired JWT still refreshes once and retries with the renewed session',async()=>{
 const tokens=[];const state=context(async(_url,options)=>{
  tokens.push(options.headers.Authorization);
  if(tokens.length===1)return {ok:false,status:401,json:async()=>({code:'PGRST301',message:'JWT expired'})};
  return {ok:true,status:200,text:async()=>'[]'};
 });vm.runInContext(code,state);
 const result=await state.api('/rest/v1/legacy_guardians');
 assert.equal(result.length,0);assert.equal(state.refreshCalls,1);assert.deepEqual(tokens,['Bearer old','Bearer renewed']);
});
test('permission and network failures remain in Portuguese and do not refresh the session',async()=>{
 const denied=context(async()=>({ok:false,status:403,json:async()=>({message:'permission denied for table private_table'})}));vm.runInContext(code,denied);
 await assert.rejects(denied.api('/rest/v1/legacy_guardians'),/Não foi possível realizar esta ação nesta conta/);assert.equal(denied.refreshCalls,0);
 const offline=context(async()=>{throw TypeError('Failed to fetch')});vm.runInContext(code,offline);
 await assert.rejects(offline.api('/rest/v1/legacy_guardians'),/Verifique sua conexão/);assert.equal(offline.refreshCalls,0);
});

const mainPage=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const authCode=mainPage.slice(mainPage.indexOf('function mensagemEmPortugues('),mainPage.indexOf('function busy('));
const response=(status,data)=>({ok:status<400,status,text:async()=>JSON.stringify(data)});
function authContext(handler){
 const state={BASE:'https://example.invalid',session:{access_token:'old',refresh_token:'old-refresh',expires_at:Date.now()/1000+3600,user:{id:'owner'}},baseHeaders:()=>({'Content-Type':'application/json'}),fetch:handler};
 state.keepSession=value=>{state.session=value};vm.createContext(state);vm.runInContext(authCode,state);return state;
}
test('main authorized request refreshes a future-dated session after reactive JWT rejection',async()=>{
 const tokens=[];let refreshes=0;
 const state=authContext(async(url,options)=>{
  if(url.includes('/auth/v1/token')){refreshes++;return response(200,{access_token:'renewed',refresh_token:'new-refresh',expires_at:Date.now()/1000+3600,user:{id:'owner'}})}
  tokens.push(options.headers.Authorization);
  return tokens.length===1?response(401,{code:'PGRST301',message:'JWT expired'}):response(200,{ok:true});
 });
 const result=await state.authorized('/rest/v1/test',{expectedOwner:'owner'});
 assert.equal(result.ok,true);assert.equal(refreshes,1);assert.deepEqual(tokens,['Bearer old','Bearer renewed']);
});
test('main authorized request retries only once when the renewed token is also rejected',async()=>{
 let refreshes=0,requests=0;
 const state=authContext(async url=>{
  if(url.includes('/auth/v1/token')){refreshes++;return response(200,{access_token:'renewed',refresh_token:'new-refresh',user:{id:'owner'}})}
  requests++;return response(401,{code:'PGRST301'});
 });
 await assert.rejects(state.authorized('/rest/v1/test'),/Sua sessão expirou/);
 assert.equal(refreshes,1);assert.equal(requests,2);
});
for(const changed of ['other-owner','logout'])test('reactive refresh preserves '+changed+' during an in-flight response',async()=>{
 let refreshes=0,requests=0;let state;
 state=authContext(async url=>{
  if(url.includes('/auth/v1/token')){
   refreshes++;state.session=changed==='logout'?null:{access_token:'other-token',refresh_token:'other-refresh',user:{id:'other'}};
   return response(200,{access_token:'stale-owner-token',refresh_token:'new-refresh',user:{id:'owner'}});
  }
  requests++;return response(401,{code:'PGRST301',message:'JWT expired'});
 });
 await assert.rejects(state.authorized('/rest/v1/test',{expectedOwner:'owner'}),/A conta mudou/);
 assert.equal(refreshes,1);assert.equal(requests,1);
 assert.equal(state.session?.user?.id,changed==='logout'?undefined:'other');
});
