import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
export function respond(data,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json'}})}
export async function context(req){
 const bearer=req.headers.get('Authorization')||'';
 if(!bearer.startsWith('Bearer '))throw Error('Autenticação obrigatória.');
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const client=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false}});
 const {data:{user},error}=await client.auth.getUser();
 if(error||!user)throw Error('Sessão inválida.');
 return {user,admin:createClient(url,service,{auth:{persistSession:false}})};
}
export function fail(e:unknown){return respond({error:e instanceof Error?e.message:'Erro no processamento'},400)}
export function phone(value:unknown){const v=String(value||'').replace(/[\s()\-]/g,'');if(!/^\+[1-9]\d{6,14}$/.test(v))throw Error('Informe o número internacional, por exemplo +5531999999999.');return v}
