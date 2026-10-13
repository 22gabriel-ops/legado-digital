// WhatsApp onboarding - TEST ONLY. Never send to arbitrary client-supplied numbers.
const env=(k:string)=>Deno.env.get(k)||"";
const origin="https://legadodigitalapp.com.br";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"OPTIONS, POST","Vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"Método inválido"},405);
 if(req.headers.get("origin")!==origin)return reply({error:"Origem não autorizada"},403);
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return reply({error:"Faça login"},401);
 const base=env("SUPABASE_URL"),svc=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!base||!svc)return reply({error:"Configuração de autenticação incompleta"},503);
 try{
  const userRes=await fetch(base+"/auth/v1/user",{headers:{apikey:svc,authorization:bearer}});
  if(!userRes.ok)return reply({error:"Sessão inválida"},401);
  const user=await userRes.json();
  if(!user.id||!user.email_confirmed_at)return reply({error:"Confirme seu e-mail antes do teste"},403);
  if(user.id!==env("LEGACY_OWNER_ID"))return reply({error:"Disparo ainda disponível somente para titular de teste"},403);
  const phone=String(user.user_metadata?.whatsapp_phone||"").replace(/\D/g,"");
  const allowed=env("WHATSAPP_TEST_RECIPIENT").replace(/\D/g,"");
  if(!user.user_metadata?.whatsapp_opt_in||!phone||!allowed||phone!==allowed)return reply({error:"Cadastre e autorize o mesmo WhatsApp liberado na Meta"},403);
  if(!env("WHATSAPP_ACCESS_TOKEN")||!env("WHATSAPP_PHONE_NUMBER_ID"))return reply({error:"WhatsApp não configurado"},503);
  // Meta test account ships a pre-approved English template called hello_world.
  const graph=env("META_GRAPH_VERSION")||"v26.0";
  const sent=await fetch("https://graph.facebook.com/"+graph+"/"+env("WHATSAPP_PHONE_NUMBER_ID")+"/messages",{
    method:"POST",headers:{Authorization:"Bearer "+env("WHATSAPP_ACCESS_TOKEN"),"Content-Type":"application/json"},
    body:JSON.stringify({messaging_product:"whatsapp",to:allowed,type:"template",template:{name:"hello_world",language:{code:"en_US"}}})
  });
  if(!sent.ok){const body=await sent.json().catch(()=>({}));console.error("Welcome template failure",sent.status,body?.error?.code||"unknown");return reply({error:"Meta recusou o envio. Consulte os logs da função.",meta_code:body?.error?.code||null},502)}
  return reply({ok:true,message:"Mensagem de teste solicitada à Meta. Confira seu WhatsApp."});
 }catch(e){console.error("Welcome unexpected failure",e instanceof Error?e.message:String(e));return reply({error:"Não foi possível realizar o teste"},500)}
});