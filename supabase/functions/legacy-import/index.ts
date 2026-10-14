// Importacao em lotes revisaveis: nao persiste arquivos brutos nem dados de interlocutores.
import {createClient} from "npm:@supabase/supabase-js@2";
const env=(k:string)=>Deno.env.get(k)||"";
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"https://legadodigitalapp.com.br","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:{"Access-Control-Allow-Origin":"https://legadodigitalapp.com.br","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"}});
 if(req.method!=="POST")return respond({error:"Método não permitido"},405);
 // Versao 1: importacoes bloqueadas no servidor ate liberacao deliberada da versao 2.
 if(env("LEGACY_IMPORT_V2_ENABLED")!=="true")return respond({error:"Importações do WhatsApp e ChatGPT estarão disponíveis na versão 2 do Legado Digital."},403);
 if(req.headers.get("origin")&&req.headers.get("origin")!=="https://legadodigitalapp.com.br")return respond({error:"Origem não autorizada"},403);
 const url=env("SUPABASE_URL"),svc=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!svc)return respond({error:"Configuração incompleta"},503);
 try{
  const token=req.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];if(!token)return respond({error:"Autenticação necessária"},401);
  const auth=createClient(url,env("SUPABASE_ANON_KEY")||env("SUPABASE_PUBLISHABLE_KEY"));
  const {data:{user},error}=await auth.auth.getUser(token);if(error||!user?.email_confirmed_at)return respond({error:"Sessão inválida"},401);
  const admin=createClient(url,svc,{auth:{persistSession:false}});
  const {data:plan}=await admin.from("legacy_user_entitlements").select("plan,active_until").eq("owner_id",user.id).maybeSingle();
  if(!["complete","shared"].includes(String(plan?.plan||""))||!plan?.active_until||Date.parse(plan.active_until)<Date.now())return respond({error:"Importação disponível somente com assinatura Completo ou Compartilhado ativa"},403);
  const body=await req.json();const source=body.source,filename=String(body.filename||"arquivo").slice(0,180);
  if(!["whatsapp","chatgpt"].includes(source))return respond({error:"Fonte inválida"},400);
  const items=body.items;
  if(!Array.isArray(items)||items.length<1||items.length>50)return respond({error:"Envie lotes de 1 a 50 trechos"},400);
  const normalized=items.map((it:unknown)=>String(it||"").trim()).filter((v:string)=>v.length>=8&&v.length<=1200);
  if(!normalized.length)return respond({error:"Nenhum trecho válido"},400);
  const {data:batch,error:batchError}=await admin.from("legacy_import_batches").insert({owner_id:user.id,source,filename,selected_count:normalized.length}).select("id").single();if(batchError)throw batchError;
  const {error:writeError}=await admin.from("legacy_memory_suggestions").insert(normalized.map((content:string)=>({owner_id:user.id,content,source:source==="chatgpt"?"chatgpt_import":"whatsapp_import"})));if(writeError)throw writeError;
  return respond({ok:true,batch_id:batch.id,review_items:normalized.length,notice:"Trechos enviados apenas para revisão. Nenhuma memória foi aprovada automaticamente."});
 }catch(e){console.error("legacy-import",e instanceof Error?e.message:String(e));return respond({error:"Não foi possível processar importação"},500)}
});
