import { createClient } from 'npm:@supabase/supabase-js@2';
import { apple, subscription } from '../_shared/apple-billing.ts';
Deno.serve(async req => {
  if(req.method!=='POST')return new Response(null,{status:405});
  try {
    const {signedPayload} = await req.json();
    if(typeof signedPayload!=='string' || signedPayload.length>100000)return new Response(null,{status:400});
    // Try trusted verifiers; untrusted payload fields never select the trust anchor.
    let notification;
    for(const environment of ['Production','Sandbox']) {
      try { notification=await apple(environment).verifier.verifyAndDecodeNotification(signedPayload); break; } catch { /* try other trusted Apple environment */ }
    }
    if(!notification)return new Response(null,{status:400});
    if(notification.notificationType==='TEST')return new Response(null,{status:200});
    const environment=notification.data?.environment;
    const signed=notification.data?.signedTransactionInfo;
    if(!signed || !environment)return new Response(null,{status:200});
    const t=await apple(environment).verifier.verifyAndDecodeTransaction(signed);
    if(!t.transactionId)return new Response(null,{status:400});
    const result=await subscription(t.transactionId,environment);
    if(environment==='Sandbox' && !(Deno.env.get('APPLE_IAP_SANDBOX_TESTERS')||'').split(',').map(x=>x.trim()).includes(result.owner_id))return new Response(null,{status:200});
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
    const {error}=await admin.rpc('legacy_apply_apple_subscription',{p_subscription:result});
    if(error)throw Error('Persistence failed');
    return new Response(null,{status:200});
  } catch { return new Response(null,{status:503}); }
});
