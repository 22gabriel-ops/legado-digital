// Legado Digital — confirmação de WhatsApp por código de 6 dígitos.

// Requer template de autenticação aprovado na Meta: legado_digital_verificacao (pt_BR).
// O botão OTP 'copiar código' pode requerer parâmetro URL (conferir após aprovação).

// NÃO habilitar envio até configurar PHONE_VERIFICATION_ENABLED=true e OTP_HASH_SECRET.

import { createClient } from 'npm:@supabase/supabase-js@2';



const env = (name: string) => Deno.env.get(name) || '';

const allowedOrigins = new Set(['https://legadodigitalapp.com.br', 'https://www.legadodigitalapp.com.br', 'capacitor://localhost', 'http://localhost', 'https://localhost']);
const cors = (origin: string | null) => ({
  'Access-Control-Allow-Origin': allowedOrigins.has(origin || '') ? origin! : 'https://legadodigitalapp.com.br',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  Vary: 'Origin',
});

const jsonReply = (data: unknown, status = 200, origin: string | null = null) => new Response(JSON.stringify(data), { status, headers: cors(origin) });

const bytes = new TextEncoder();

const tenMinutes = 10 * 60 * 1000;

const delayBetweenSends = 60 * 1000;

const maxAttempts = 5;



type VerifyRow = {

  id: string; owner_id: string; phone_e164: string; status: string;

  created_at: string; expires_at: string; attempts: number;

};



async function hashCode(id: string, code: string) {

  const secret = env('OTP_HASH_SECRET');

  if (secret.length < 32) throw new Error('OTP_HASH_SECRET must have at least 32 characters');

  const key = await crypto.subtle.importKey('raw', bytes.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes.encode(`${id}:${code}`)));

  return Array.from(digest).map(v => v.toString(16).padStart(2, '0')).join('');

}

function equalHash(a: string, b: string) {

  if (a.length !== b.length) return false;

  let diff = 0;

  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);

  return diff === 0;

}

function generateCode() {

  const arr = new Uint32Array(1);

  crypto.getRandomValues(arr);

  // Rejection sampling avoids modulo bias.

  const ceiling = Math.floor(0x100000000 / 1000000) * 1000000;

  while (arr[0] >= ceiling) crypto.getRandomValues(arr);

  return String(arr[0] % 1000000).padStart(6, '0');

}



Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  const reply = (data: unknown, status = 200) => jsonReply(data, status, origin);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: 'Origem não autorizada' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  if (req.method !== 'POST') return reply({ error: 'Método inválido' }, 405);



  const authHeader = req.headers.get('authorization') || '';

  if (!/^Bearer\s+\S+$/i.test(authHeader)) return reply({ error: 'Faça login' }, 401);

  const url = env('SUPABASE_URL');

  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');

  const publicKey = env('SUPABASE_ANON_KEY');

  if (!url || !serviceKey || !publicKey) return reply({ error: 'Configuração incompleta' }, 503);

  const authClient = createClient(url, publicKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: identity, error: identityError } = await authClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));

  if (identityError || !identity.user) return reply({ error: 'Sessão inválida' }, 401);

  const user = identity.user;

  if (!user.email_confirmed_at) return reply({ error: 'Confirme seu e-mail' }, 403);

  let body: { action?: unknown; phone?: unknown; code?: unknown };

  try { body = await req.json(); } catch { return reply({ error: 'JSON inválido' }, 400); }

  const action = body.action;

  try {

    if (action === 'request') {

      if (env('PHONE_VERIFICATION_ENABLED') !== 'true') return reply({ error: 'Verificação de telefone aguardando liberação' }, 503);

      const phone = String(body.phone || '');

      if (!/^\+[1-9]\d{6,14}$/.test(phone)) return reply({ error: 'Telefone inválido. Use +DDI e número.' }, 400);

      if (user.user_metadata?.whatsapp_opt_in !== true) return reply({ error: 'Autorize o contato pelo WhatsApp antes de solicitar o código' }, 403);

      const accountPhone = String(user.user_metadata?.whatsapp_phone || '').replace(/\D/g, '');

      if (accountPhone !== phone.slice(1)) return reply({ error: 'O telefone deve ser o cadastrado na sua conta' }, 403);

      // Prevent takeover of numbers already verified by another owner.

      const { data: verified, error: verifiedError } = await admin.from('legacy_phone_verifications').select('id,owner_id').eq('phone_e164', phone).eq('status', 'verified').limit(1);

      if (verifiedError) throw verifiedError;

      if (verified?.some(v => v.owner_id !== user.id)) return reply({ error: 'Número já vinculado a outra conta' }, 409);

      const { data: pending, error: pendingError } = await admin.from('legacy_phone_verifications').select('id,owner_id,phone_e164,status,created_at,expires_at,attempts').eq('owner_id', user.id).eq('status', 'pending').limit(1);

      if (pendingError) throw pendingError;

      const existing = pending?.[0] as VerifyRow | undefined;

      // No resend while an unexpired request exists, including across function restarts.

      if (existing && new Date(existing.expires_at).getTime() > Date.now())

        return reply({ error: 'Existe uma confirmação pendente. Aguarde até o vencimento para solicitar outra.' }, 429);

      if (existing) {

        const { error } = await admin.from('legacy_phone_verifications').update({ status: 'expired' }).eq('id', existing.id).eq('status', 'pending');

        if (error) throw error;

      }

      // A small cooldown also applies after expiration/cancellation when possible.

      const { data: recent, error: recentError } = await admin.from('legacy_phone_verifications').select('created_at').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1);

      if (recentError) throw recentError;

      if (recent?.[0] && Date.now() - new Date(recent[0].created_at).getTime() < delayBetweenSends)

        return reply({ error: 'Aguarde antes de solicitar outro código' }, 429);

      const expiry = new Date(Date.now() + tenMinutes).toISOString();

      const { data: attempt, error: createError } = await admin.from('legacy_phone_verifications').insert({ owner_id: user.id, phone_e164: phone, expires_at: expiry }).select('id').single();

      if (createError) throw createError;

      const code = generateCode();

      const hash = await hashCode(attempt.id, code);

      const { error: storeError } = await admin.from('legacy_phone_codes').insert({ verification_id: attempt.id, code_hash: hash });

      if (storeError) throw storeError;

      const token = env('WHATSAPP_ACCESS_TOKEN');

      const numberId = env('WHATSAPP_PHONE_NUMBER_ID');

      if (!token || !numberId) throw new Error('WhatsApp unavailable');

      const graph = env('META_GRAPH_VERSION') || 'v26.0';

      const sent = await fetch(`https://graph.facebook.com/${graph}/${numberId}/messages`, {

        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },

        body: JSON.stringify({

          messaging_product: 'whatsapp', to: phone.slice(1), type: 'template',

          template: {

            name: 'legado_digital_verificacao', language: { code: 'pt_BR' },

            components: [

              { type: 'body', parameters: [{ type: 'text', text: code }] },

              { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },

            ],

          },

        }),

      });

      if (!sent.ok) {

        console.error('Meta verification template error', sent.status);

        await admin.from('legacy_phone_verifications').update({ status: 'cancelled' }).eq('id', attempt.id).eq('status', 'pending');

        return reply({ error: 'Não foi possível enviar o código. Consulte o status do modelo na Meta.' }, 502);

      }

      return reply({ ok: true, message: 'Código enviado para o WhatsApp cadastrado', expires_in_seconds: 600 });

    }

    if (action === 'confirm') {

      const code = String(body.code || '');

      if (!/^\d{6}$/.test(code)) return reply({ error: 'Informe os 6 dígitos' }, 400);

      const { data: pending, error: lookupError } = await admin.from('legacy_phone_verifications').select('id,owner_id,phone_e164,status,created_at,expires_at,attempts').eq('owner_id', user.id).eq('status', 'pending').limit(1);

      if (lookupError) throw lookupError;

      const row = pending?.[0] as VerifyRow | undefined;

      if (!row) return reply({ error: 'Nenhuma verificação pendente' }, 404);

      if (Date.now() >= new Date(row.expires_at).getTime()) {

        await admin.from('legacy_phone_verifications').update({ status: 'expired' }).eq('id', row.id).eq('status', 'pending');

        return reply({ error: 'Código expirado' }, 410);

      }

      if (row.attempts >= maxAttempts) return reply({ error: 'Limite de tentativas atingido' }, 429);

      // Atomic attempt counter: concurrent requests cannot both consume the same attempt count.

      const { data: claimed, error: claimError } = await admin.from('legacy_phone_verifications')

        .update({ attempts: row.attempts + 1 }).eq('id', row.id).eq('status', 'pending').eq('attempts', row.attempts).select('id');

      if (claimError) throw claimError;

      if (!claimed?.length) return reply({ error: 'Tente novamente' }, 409);

      const { data: secretRow, error: codeError } = await admin.from('legacy_phone_codes').select('code_hash').eq('verification_id', row.id).single();

      if (codeError) throw codeError;

      if (!equalHash(secretRow.code_hash, await hashCode(row.id, code))) return reply({ error: 'Código incorreto' }, 400);

      const timestamp = new Date().toISOString();

      // Check expiration again on update; the database trigger also enforces it.

      const { data: updated, error: updateError } = await admin.from('legacy_phone_verifications').update({ status: 'verified', verified_at: timestamp })

        .eq('id', row.id).eq('owner_id', user.id).eq('status', 'pending').gt('expires_at', timestamp).select('id');

      if (updateError) throw updateError;

      if (!updated?.length) return reply({ error: 'Confirmação não disponível' }, 409);

      await admin.from('legacy_phone_codes').delete().eq('verification_id', row.id);

      return reply({ ok: true, verified: true });

    }

    return reply({ error: 'Ação inválida' }, 400);

  } catch (error) {

    console.error('Phone verification failed', error instanceof Error ? error.message : String(error));

    return reply({ error: 'Não foi possível concluir a verificação' }, 500);

  }

});