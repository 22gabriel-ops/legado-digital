// WhatsApp onboarding - TEST ONLY. Never send to arbitrary client-supplied numbers.
const env=(k:string)=>Deno.env.get(k)||"";
const allowedOrigins=new Set(["https://legadodigitalapp.com.br","https://www.legadodigitalapp.com.br","capacitor://localhost","http://localhost","https://localhost"]);
const origin="https://legadodigitalapp.com.br";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"OPTIONS, POST","Vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json",...cors}});
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"Método inválido"},405);
 if(req.headers.get("origin")&&!allowedOrigins.has(req.headers.get("origin")!))return reply({error:"Origem não autorizada"},403);
 const bearer=req.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return reply({error:"Faça login"},401);
 const base=env("SUPABASE_URL"),svc=env("SUPABASE_SERVICE_ROLE_KEY");
 if(!base||!svc)return reply({error:"Configuração de autenticação incompleta"},503);
 try{
  const userRes=await fetch(base+"/auth/v1/user",{headers:{apikey:svc,authorization:bearer}});
  if(!userRes.ok)return reply({error:"Sessão inválida"},401);
  const user=await userRes.json();
  if(!user.id||!user.email_confirmed_at)return reply({error:"Confirme seu e-mail antes do teste"},403);
  const phone=String(user.user_metadata?.whatsapp_phone||"").replace(/\D/g,"");
  if(user.user_metadata?.whatsapp_opt_in!==true||!/^\d{7,15}$/.test(phone))return reply({error:"Cadastre e autorize um WhatsApp válido"},403);
  const verification=await fetch(base+"/rest/v1/legacy_phone_verifications?select=id&owner_id=eq."+encodeURIComponent(user.id)+"&phone_e164=eq."+encodeURIComponent("+"+phone)+"&status=eq.verified&limit=1",{headers:{apikey:svc,Authorization:"Bearer "+svc}});
  if(!verification.ok)throw Error("Consulta de verificação falhou: "+verification.status);
  const verified=await verification.json();
  if(!Array.isArray(verified)||verified.length!==1)return reply({error:"Seu número ainda não consta como verificado. Confirme o WhatsApp na sua conta."},403);
  const optedOut=await fetch(base+"/rest/v1/legacy_whatsapp_optouts?select=phone_e164&phone_e164=eq."+encodeURIComponent("+"+phone)+"&limit=1",{headers:{apikey:svc,Authorization:"Bearer "+svc}});
  if(!optedOut.ok)throw Error("Consulta de bloqueio falhou: "+optedOut.status);
  if((await optedOut.json()).length)return reply({error:"Este número solicitou PARAR. Reative o consentimento antes de receber mensagens."},403);
  if(!env("WHATSAPP_ACCESS_TOKEN")||!env("WHATSAPP_PHONE_NUMBER_ID"))return reply({error:"WhatsApp não configurado"},503);
  // O modelo legado_digital_boas_vindas deve ser cadastrado e APROVADO na Meta antes do deploy.
  const graph=env("META_GRAPH_VERSION")||"v26.0";
  const sent=await fetch("https://graph.facebook.com/"+graph+"/"+env("WHATSAPP_PHONE_NUMBER_ID")+"/messages",{
    method:"POST",headers:{Authorization:"Bearer "+env("WHATSAPP_ACCESS_TOKEN"),"Content-Type":"application/json"},
    body:JSON.stringify({messaging_product:"whatsapp",to:phone,type:"template",template:{name:"legado_digital_boas_vindas",language:{code:"pt_BR"}}})
  });
  if(!sent.ok){const body=await sent.json().catch(()=>({}));console.error("Welcome template failure",sent.status,body?.error?.code||"unknown");return reply({error:"Meta recusou o envio. Consulte os logs da função.",meta_code:body?.error?.code||null},502)}
  return reply({ok:true,message:"Apresentação do Legado Digital solicitada à Meta. Confira seu WhatsApp."});
 }catch(e){console.error("Welcome unexpected failure",e instanceof Error?e.message:String(e));return reply({error:"Não foi possível realizar o teste"},500)}
});