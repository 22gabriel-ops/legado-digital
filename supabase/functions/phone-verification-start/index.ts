import {context,cors,respond,fail,phone} from '../_shared/legacy.ts';
const digest=async(input:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))).map(b=>b.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return respond({error:'Método não aceito'},405);
 try{
  const {user,admin}=await context(req);const body=await req.json();const number=phone(body.phone);
  const {data:old}=await admin.from('legacy_phone_otp').select('sent_at').eq('owner_id',user.id).maybeSingle();
  if(old?.sent_at&&Date.now()-Date.parse(old.sent_at)<60000)return respond({error:'Espere 60 segundos antes de solicitar outro código.'},429);
  const token=Deno.env.get('META_WA_ACCESS_TOKEN'),id=Deno.env.get('META_WA_PHONE_NUMBER_ID'),template=Deno.env.get('META_WA_OTP_TEMPLATE');
  if(!token||!id||!template)throw Error('Serviço de confirmação do WhatsApp ainda não configurado.');
  const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0');
  const expires_at=new Date(Date.now()+5*60*1000).toISOString();
  const secret=Deno.env.get('PHONE_OTP_PEPPER');if(!secret)throw Error('PHONE_OTP_PEPPER ausente.');
  const code_hash=await digest(user.id+':'+number+':'+code+':'+secret);
  const {error:up}=await admin.from('legacy_phone_otp').upsert({owner_id:user.id,phone:number,code_hash,expires_at,sent_at:new Date().toISOString(),attempts:0});if(up)throw up;
  const out=await fetch('https://graph.facebook.com/v22.0/'+id+'/messages',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:number.slice(1),type:'template',template:{name:template,language:{code:Deno.env.get('META_WA_OTP_TEMPLATE_LANGUAGE')||'pt_BR'},components:[{type:'body',parameters:[{type:'text',text:code}]},{type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:code}]}]}})});
  if(!out.ok){await admin.from('legacy_phone_otp').delete().eq('owner_id',user.id);throw Error('Não foi possível enviar o código pelo WhatsApp. Confirme o template aprovado na Meta.')}
  return respond({message:'Código enviado pelo WhatsApp. Válido por 5 minutos.'});
 }catch(e){return fail(e)}
});
