import { createClient } from 'npm:@supabase/supabase-js@2';
import { subscription } from '../_shared/apple-billing.ts';
const origins = new Set(['capacitor://localhost','http://localhost','https://localhost','https://legadodigitalapp.com.br','https://www.legadodigitalapp.com.br']);
Deno.serve(async req => {
  const origin = req.headers.get('origin') || '';
  const headers = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin', 'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'capacitor://localhost', 'Access-Control-Allow-Headers':'authorization,apikey,content-type', 'Access-Control-Allow-Methods':'POST,OPTIONS' };
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers});
  if (origin && !origins.has(origin)) return reply({error:'Origem não autorizada'},403);
  if (req.method === 'OPTIONS') return new Response(null,{headers});
  if (req.method !== 'POST') return reply({error:'Método não permitido'},405);
  try {
    const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return reply({error:'Entre na sua conta.'},401);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const {data:{user},error} = await admin.auth.getUser(token);
    if (error || !user?.email_confirmed_at) return reply({error:'Confirme seu e-mail e entre novamente.'},401);
    const {transactionId,environment = 'Production'} = await req.json();
    if (!/^\d{5,30}$/.test(String(transactionId))) return reply({error:'Transação inválida.'},400);
    if (environment === 'Sandbox' && !(Deno.env.get('APPLE_IAP_SANDBOX_TESTERS') || '').split(',').map(x=>x.trim()).includes(user.id)) return reply({error:'Conta não autorizada para testes Apple.'},403);
    const result = await subscription(String(transactionId), environment, user.id);
    const {error:saveError} = await admin.rpc('legacy_apply_apple_subscription',{p_subscription:result});
    if (saveError) throw Error('Persistence failed');
    return reply({verified:true,active:result.active,environment,activeUntil:result.active_until,productionEntitlement:environment==='Production' && result.active,sandboxReviewAvailable:environment==='Sandbox' && result.active && Deno.env.get('APPLE_IAP_SANDBOX_REVIEW_ENABLED')==='true'});
  } catch {
    // Never return signed payloads, private keys or SDK exceptions to clients/logs.
    return reply({error:'Não foi possível validar sua assinatura. A compra pode ser restaurada para tentar novamente.'},502);
  }
});
