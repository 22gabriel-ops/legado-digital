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



async function hashCode(id: string, code: string, secret: string) {

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



export type PhoneVerificationDependencies = {
  env: (name: string) => string;
  createClient: typeof createClient;
  fetch: typeof fetch;
  now: () => number;
  generateCode: () => string;
  hashCode: (id: string, code: string, secret: string) => Promise<string>;
  logError: (...values: unknown[]) => void;
  logInfo: (...values: unknown[]) => void;
};
const defaultDependencies: PhoneVerificationDependencies = {
  env, createClient, fetch: (input, init) => fetch(input, init), now: () => Date.now(), generateCode, hashCode,
  logError: (...values) => console.error(...values), logInfo: (...values) => console.info(...values),
};

export function createPhoneVerificationHandler(deps: PhoneVerificationDependencies = defaultDependencies) {
  return async (req: Request) => {
  const origin = req.headers.get('origin');
  const reply = (data: unknown, status = 200) => jsonReply(data, status, origin);
  if (origin && !allowedOrigins.has(origin)) return reply({ error: 'Origem não autorizada' }, 403);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });

  if (req.method !== 'POST') return reply({ error: 'Método inválido' }, 405);



  const authHeader = req.headers.get('authorization') || '';

  if (!/^Bearer\s+\S+$/i.test(authHeader)) return reply({ error: 'Faça login' }, 401);

  const url = deps.env('SUPABASE_URL');

  const serviceKey = deps.env('SUPABASE_SERVICE_ROLE_KEY');

  const publicKey = deps.env('SUPABASE_ANON_KEY');

  if (!url || !serviceKey || !publicKey) return reply({ error: 'Configuração incompleta' }, 503);

  const authClient = deps.createClient(url, publicKey, { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false, autoRefreshToken: false } });

  const admin = deps.createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: identity, error: identityError } = await authClient.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));

  if (identityError || !identity.user) return reply({ error: 'Sessão inválida' }, 401);

  const user = identity.user;

  if (!user.email_confirmed_at) return reply({ error: 'Confirme seu e-mail' }, 403);

  let body: { action?: unknown; phone?: unknown; code?: unknown };

  try { body = await req.json(); } catch { return reply({ error: 'JSON inválido' }, 400); }

  const action = body.action;

  let reservation: { id: string; owner: string; expiresAt: string } | null = null;
  let submissionStarted = false;
  const pendingFields = (expiresAt: string) => ({ expires_at: expiresAt, retry_after_seconds: Math.max(0, Math.ceil((Date.parse(expiresAt) - deps.now()) / 1000)) });
  const uncertainReply = (code: string) => reply({
    error: 'Não foi possível confirmar o envio do pedido ao WhatsApp. Se recebeu o código, ele pode ser usado. Aguarde a verificação expirar antes de solicitar outro.',
    code, ...(reservation ? pendingFields(reservation.expiresAt) : {}),
  }, 503);
  const unconfirmedStateReply = (phase: 'before_send' | 'rejected') => reply({
    error: (phase === 'before_send' ? 'O envio do código não foi iniciado. ' : 'O WhatsApp recusou o pedido de código. ') +
      'Não foi possível confirmar o cancelamento da verificação. Aguarde a verificação expirar antes de solicitar outro código.',
    code: 'verification_state_unconfirmed', ...(reservation ? pendingFields(reservation.expiresAt) : {}),
  }, 503);
  async function cancelReservation() {
    if (!reservation) return false;
    try {
      const { data, error } = await admin.from('legacy_phone_verifications').update({ status: 'cancelled' })
        .eq('id', reservation.id).eq('owner_id', reservation.owner).eq('status', 'pending').select('id');
      if (error || !Array.isArray(data) || data.length !== 1 || data[0]?.id !== reservation.id) {
        deps.logError('OTP cancellation not confirmed'); return false;
      }
      reservation = null;
      return true;
    } catch { deps.logError('OTP cancellation unavailable'); return false; }
  }


  try {

    if (action === 'request') {

      if (deps.env('PHONE_VERIFICATION_ENABLED') !== 'true') return reply({ error: 'Verificação de telefone aguardando liberação' }, 503);

      const phone = String(body.phone || '');

      if (!/^\+[1-9]\d{6,14}$/.test(phone)) return reply({ error: 'Telefone inválido. Use +DDI e número.' }, 400);

      if (user.user_metadata?.whatsapp_opt_in !== true) return reply({ error: 'Autorize o contato pelo WhatsApp antes de solicitar o código' }, 403);

      const accountPhone = String(user.user_metadata?.whatsapp_phone || '').replace(/\D/g, '');

      if (accountPhone !== phone.slice(1)) return reply({ error: 'O telefone deve ser o cadastrado na sua conta' }, 403);

      // Validate configuration before reserving a verification or creating a code.
      const secret = deps.env('OTP_HASH_SECRET');
      const token = deps.env('WHATSAPP_ACCESS_TOKEN');
      const numberId = deps.env('WHATSAPP_PHONE_NUMBER_ID');
      if (secret.length < 32 || !token || !numberId)
        return reply({ error: 'A confirmação pelo WhatsApp está temporariamente indisponível. Tente novamente mais tarde.', code: 'verification_unavailable' }, 503);

      // Prevent takeover of numbers already verified by another owner.

      const { data: verified, error: verifiedError } = await admin.from('legacy_phone_verifications').select('id,owner_id').eq('phone_e164', phone).eq('status', 'verified').limit(1);

      if (verifiedError) throw verifiedError;

      if (verified?.some((v: { owner_id: string }) => v.owner_id !== user.id)) return reply({ error: 'Número já vinculado a outra conta' }, 409);

      const { data: pending, error: pendingError } = await admin.from('legacy_phone_verifications').select('id,owner_id,phone_e164,status,created_at,expires_at,attempts').eq('owner_id', user.id).eq('status', 'pending').limit(2);

      if (pendingError) throw pendingError;
      if (pending && pending.length > 1) return reply({ error: 'Não foi possível identificar uma única verificação pendente. Tente novamente mais tarde ou contate o suporte.', code: 'verification_pending_ambiguous' }, 409);

      const existing = pending?.[0] as VerifyRow | undefined;

      // No resend while an unexpired request exists, including across function restarts.

      if (existing && new Date(existing.expires_at).getTime() > deps.now())
        return reply({ error: 'Existe uma verificação pendente. Se você recebeu o código, ele ainda pode ser usado. Aguarde o vencimento para solicitar outro.', code: 'verification_pending', ...pendingFields(existing.expires_at) }, 429);

      if (existing) {

        const { error } = await admin.from('legacy_phone_verifications').update({ status: 'expired' }).eq('id', existing.id).eq('status', 'pending');

        if (error) throw error;

      }

      // A small cooldown also applies after expiration/cancellation when possible.

      const { data: recent, error: recentError } = await admin.from('legacy_phone_verifications').select('created_at').eq('owner_id', user.id).order('created_at', { ascending: false }).limit(1);

      if (recentError) throw recentError;

      if (recent?.[0] && deps.now() - new Date(recent[0].created_at).getTime() < delayBetweenSends)

        return reply({ error: 'Aguarde antes de solicitar outro código' }, 429);

      const expiry = new Date(deps.now() + tenMinutes).toISOString();

      const { data: attempt, error: createError } = await admin.from('legacy_phone_verifications').insert({ owner_id: user.id, phone_e164: phone, expires_at: expiry }).select('id').single();

      if (createError) throw createError;
      if (!attempt?.id) throw new Error('Verification reservation unavailable');
      reservation = { id: attempt.id, owner: user.id, expiresAt: expiry };

      const code = deps.generateCode();

      const hash = await deps.hashCode(attempt.id, code, secret);

      const { error: storeError } = await admin.from('legacy_phone_codes').insert({ verification_id: attempt.id, code_hash: hash });

      if (storeError) throw storeError;

      const graph = deps.env('META_GRAPH_VERSION') || 'v26.0';

      // Once transport begins, a thrown/ambiguous result may already have been accepted.
      submissionStarted = true;
      const sent = await deps.fetch(`https://graph.facebook.com/${graph}/${numberId}/messages`, {

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

      const receipt = await sent.json().catch(() => null);
      const messageId = Array.isArray(receipt?.messages) && typeof receipt.messages[0]?.id === 'string' && receipt.messages[0].id.trim() ? receipt.messages[0].id : null;
      const graphError = receipt?.error;
      // Gateways/timeouts/5xx and contradictory or unreadable bodies are uncertain.
      const explicitRejection = sent.status >= 400 && sent.status < 500 && sent.status !== 408 && !messageId &&
        Number.isInteger(graphError?.code) && graphError.code > 0 && typeof graphError.message === 'string' &&
        graphError.message.trim().length > 0 && (graphError.is_transient === false || graphError.is_transient === undefined);
      if (!sent.ok && explicitRejection) {
        deps.logError('OTP request explicitly rejected', { httpStatus: sent.status, providerCode: graphError.code });
        if (!await cancelReservation()) return unconfirmedStateReply('rejected');
        return reply({ error: 'O WhatsApp não aceitou a solicitação do código. Tente novamente mais tarde.', code: 'verification_send_rejected' }, 502);
      }
      if (!sent.ok || !messageId || graphError) return uncertainReply('verification_submission_unknown');

      // An accepted request is not proof of delivery; do not expose code, phone or token.
      const messageStatus = typeof receipt?.messages?.[0]?.message_status === 'string' ? receipt.messages[0].message_status : 'accepted';
      deps.logInfo('OTP request accepted for processing', { messageId, messageStatus, httpStatus: sent.status });
      return reply({ ok: true, message: 'Solicitação do código recebida para processamento. Aguarde no WhatsApp; a entrega ainda não foi confirmada.', expires_in_seconds: 600 });

    }

    if (action === 'confirm') {

      const code = String(body.code || '');

      if (!/^\d{6}$/.test(code)) return reply({ error: 'Informe os 6 dígitos' }, 400);

      const secret = deps.env('OTP_HASH_SECRET');
      if (secret.length < 32) return reply({ error: 'A confirmação pelo WhatsApp está temporariamente indisponível. Tente novamente mais tarde.', code: 'verification_unavailable' }, 503);

      const { data: pending, error: lookupError } = await admin.from('legacy_phone_verifications').select('id,owner_id,phone_e164,status,created_at,expires_at,attempts').eq('owner_id', user.id).eq('status', 'pending').limit(2);

      if (lookupError) throw lookupError;
      if (pending && pending.length > 1) return reply({ error: 'Não foi possível identificar uma única verificação pendente. Tente novamente mais tarde ou contate o suporte.', code: 'verification_pending_ambiguous' }, 409);

      const row = pending?.[0] as VerifyRow | undefined;

      if (!row) return reply({ error: 'Nenhuma verificação pendente' }, 404);

      if (deps.now() >= new Date(row.expires_at).getTime()) {

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

      if (!equalHash(secretRow.code_hash, await deps.hashCode(row.id, code, secret))) return reply({ error: 'Código incorreto' }, 400);

      const timestamp = new Date(deps.now()).toISOString();

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

    // Do not log provider payloads, OTPs, phones, tokens or arbitrary error details.
    deps.logError('Phone verification failed', { submissionStarted, reserved: !!reservation });
    if (reservation) {
      if (submissionStarted) return uncertainReply('verification_submission_unknown');
      if (!await cancelReservation()) return unconfirmedStateReply('before_send');
      return reply({ error: 'Não foi possível preparar a solicitação do código. Tente novamente mais tarde.', code: 'verification_prepare_failed' }, 503);
    }
    return reply({ error: 'Não foi possível concluir a verificação' }, 500);

  }


  };
}

Deno.serve(createPhoneVerificationHandler());
