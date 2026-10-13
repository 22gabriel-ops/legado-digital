import {context,cors,respond,fail,phone} from '../_shared/legacy.ts';
const digest=async(input:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(input)))).map(b=>b.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return respond({error:'Método não aceito'},405);
 try{
 const {user,admin}=await context(req),body=await req.json(),number=phone(body.phone),code=String(body.code||'');
 if(!/^\d{6}$/.test(code))throw Error('Código inválido.');
 const {data:r,error}=await admin.from('legacy_phone_otp').select('*').eq('owner_id',user.id).maybeSingle();
 if(error)throw error;if(!r||r.phone!==number||Date.now()>Date.parse(r.expires_at))throw Error('Código inválido ou expirado.');
 if(r.attempts>=5)throw Error('Limite de tentativas atingido. Peça outro código.');
 const secret=Deno.env.get('PHONE_OTP_PEPPER');if(!secret)throw Error('Serviço não configurado.');
 const hash=await digest(user.id+':'+number+':'+code+':'+secret);
 if(hash!==r.code_hash){await admin.from('legacy_phone_otp').update({attempts:r.attempts+1}).eq('owner_id',user.id);throw Error('Código incorreto.')}
 const {error:saveErr}=await admin.from('legacy_phone_verifications').upsert({owner_id:user.id,phone:number,verified_at:new Date().toISOString()});if(saveErr)throw saveErr;
 await admin.from('legacy_phone_otp').delete().eq('owner_id',user.id);
 return respond({verified:true});
 }catch(e){return fail(e)}
});
