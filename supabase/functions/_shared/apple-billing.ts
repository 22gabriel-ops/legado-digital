import { Buffer } from 'node:buffer';
import { Environment, SignedDataVerifier } from 'npm:@apple/app-store-server-library@3.1.0';
import { rootCertificates } from './apple-roots.ts';
export const productId = 'br.com.meulegado.plus.mensal';
const bundleId = 'com.gabrielcruz.legadodigital';
export function apple(environment: string) {
  if (!['Production', 'Sandbox'].includes(environment)) throw Error('Invalid environment');
  const env = environment === 'Production' ? Environment.PRODUCTION : Environment.SANDBOX;
  const key = Deno.env.get('APPLE_IAP_PRIVATE_KEY');
  const keyId = Deno.env.get('APPLE_IAP_KEY_ID');
  const issuer = Deno.env.get('APPLE_IAP_ISSUER_ID');
  if (!key || !keyId || !issuer) throw Error('Apple credentials not configured');
  return {
    client: {
      getTransactionInfo: (id: string) => appleRequest('/inApps/v1/transactions/'+encodeURIComponent(id), environment, key, keyId, issuer),
      getAllSubscriptionStatuses: (id: string) => appleRequest('/inApps/v1/subscriptions/'+encodeURIComponent(id), environment, key, keyId, issuer)
    },
    verifier: new SignedDataVerifier(rootCertificates.map(c => Buffer.from(c, 'base64')), true, env, bundleId, 6821712229)
  };
}
// Only Apple's authenticated API response and verified signatures can supply claims.
export async function subscription(transactionId: string, environment: string, owner?: string) {
  const { client, verifier } = apple(environment);
  const info = await client.getTransactionInfo(transactionId);
  if (!info.signedTransactionInfo) throw Error('Missing transaction');
  const initial = await verifier.verifyAndDecodeTransaction(info.signedTransactionInfo);
  if (initial.productId !== productId || !initial.appAccountToken || !initial.originalTransactionId) throw Error('Unsupported subscription');
  const account = initial.appAccountToken.toLowerCase();
  if (owner && account !== owner.toLowerCase()) throw Error('Subscription belongs to another account');
  const statuses = await client.getAllSubscriptionStatuses(transactionId);
  const entries = [];
  for (const group of statuses.data || []) {
    for (const item of group.lastTransactions || []) {
      if (!item.signedTransactionInfo) continue;
      const t = await verifier.verifyAndDecodeTransaction(item.signedTransactionInfo);
      if (t.originalTransactionId !== initial.originalTransactionId || t.productId !== productId || t.appAccountToken?.toLowerCase() !== account) continue;
      const active = item.status === 1 && !t.revocationDate && Number(t.expiresDate) > Date.now();
      entries.push({
        owner_id: account, original_transaction_id: t.originalTransactionId,
        transaction_id: t.transactionId, environment, product_id: productId,
        active_until: new Date(Number(t.expiresDate)).toISOString(), active,
        signed_at: new Date(Number(t.signedDate)).toISOString()
      });
    }
  }
  if (entries.length !== 1) throw Error('Ambiguous subscription status');
  return entries[0];
}

function base64url(bytes: Uint8Array) {
 return Buffer.from(bytes).toString('base64url');
}
export async function appleRequest(route: string, environment: string, key: string, keyId: string, issuer: string, body?: unknown) {
 const now=Math.floor(Date.now()/1000);
 const header=base64url(new TextEncoder().encode(JSON.stringify({alg:'ES256',kid:keyId,typ:'JWT'})));
 const claims=base64url(new TextEncoder().encode(JSON.stringify({iss:issuer,iat:now,exp:now+300,aud:'appstoreconnect-v1',bid:bundleId})));
 const pem=key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
 const signingKey=await crypto.subtle.importKey('pkcs8',Buffer.from(pem,'base64'),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const input=header+'.'+claims;
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},signingKey,new TextEncoder().encode(input)));
 const host=environment==='Production'?'https://api.storekit.apple.com':'https://api.storekit-sandbox.apple.com';
 const response=await fetch(host+route,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+input+'.'+base64url(signature),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Apple API HTTP '+response.status);
 return await response.json();
}
