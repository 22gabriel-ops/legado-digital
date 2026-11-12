/** Portable offline fixture for the real webhook. Every fetch is intercepted;
 * unknown routes, AI and quota calls fail rather than reaching a real service. */
import assert from 'node:assert/strict';
import { createHmac, webcrypto } from 'node:crypto';

export const OWNER = '11111111-1111-4111-8111-111111111111';
export const OTHER = '22222222-2222-4222-8222-222222222222';
export const PHONE = '5511900000000';
export const ALIAS = '551100000000';
const BASE = 'https://consent-fixture.invalid';
const SETTINGS = Object.freeze({
  SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: 'fixture-not-a-service-key',
  OPENAI_API_KEY: 'fixture-never-used', WHATSAPP_ACCESS_TOKEN: 'fixture-not-a-meta-token',
  WHATSAPP_PHONE_NUMBER_ID: 'fixture-phone-id', META_GRAPH_VERSION: 'fixture-version',
  META_APP_SECRET: 'fixture-only-hmac-secret', WHATSAPP_REQUIRE_VERIFICATION: 'true',
  WHATSAPP_MONTHLY_LIMITS_ENABLED: 'true',
});
let serial = 0;
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const clone = value => structuredClone(value);

function selected(row, select) {
  return select ? Object.fromEntries(select.split(',').map(key => [key, row[key]])) : clone(row);
}
function matches(row, params) {
  return [...params].every(([key, value]) => {
    if (['select', 'limit', 'order', 'on_conflict'].includes(key)) return true;
    if (value.startsWith('eq.')) return String(row[key]) === value.slice(3);
    if (value === 'is.null') return row[key] == null;
    if (value.startsWith('in.(') && value.endsWith(')')) return value.slice(4, -1).split(',').includes(String(row[key]));
    throw Error('Unmocked REST filter: ' + key);
  });
}

export async function fixture(t, options = {}) {
  const original = { fetch: globalThis.fetch, Deno: globalThis.Deno, envGet: globalThis.Deno?.env?.get, serve: globalThis.Deno?.serve, Date: globalThis.Date, error: console.error };
  const RealDate = original.Date;
  const state = {
    time: RealDate.parse('2026-11-11T12:00:00Z'), sequence: 0,
    tables: { legacy_phone_verifications: [], whatsapp_conversations: [], whatsapp_messages: [], legacy_whatsapp_optouts: [] },
    calls: [], meta: [], errors: [], ai: 0, quota: 0, patches: [],
    patchFailures: 0, patchZero: 0, sendFailures: 0, outboundStoreFailures: 0,
    patchMinimal: false, patchRemoveConversation: false, metaReceipt: undefined,
    ...options.faults,
  };
  const user = { id: OWNER, user_metadata: { whatsapp_phone: '+' + PHONE, whatsapp_opt_in: true }, ...options.user };
  function append(table, input) {
    const row = { ...clone(input) };
    row.id ??= 'fixture-row-' + (++state.sequence);
    row.created_at ??= new RealDate(++state.time).toISOString();
    if (table === 'whatsapp_conversations') row.consented_at ??= null;
    state.tables[table].push(row);
    return row;
  }
  for (const row of options.verifications ?? [{ owner_id: OWNER, phone_e164: '+' + PHONE, status: 'verified' }]) append('legacy_phone_verifications', row);
  for (const [table, rows] of Object.entries(options.rows ?? {})) for (const row of rows) append(table, row);
  const restore = () => {
    globalThis.fetch = original.fetch;
    if (original.Deno === undefined) delete globalThis.Deno;
    else { original.Deno.env.get = original.envGet; original.Deno.serve = original.serve; }
    globalThis.Date = original.Date;
    console.error = original.error;
  };
  t.after(restore);
  globalThis.crypto ??= webcrypto;
  console.error = (...args) => state.errors.push(args);
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    const headers = new Headers(init.headers);
    if (url.origin === 'https://api.openai.com') { state.ai++; throw Error('AI is forbidden in consent tests'); }
    if (url.origin === 'https://graph.facebook.com') {
      assert.equal(url.pathname, '/fixture-version/fixture-phone-id/messages');
      assert.equal(method, 'POST');
      state.meta.push({ to: body.to, content: body.text.body });
      if (state.sendFailures-- > 0) return json({ error: { message: 'fictional transport rejection' } }, 503);
      if (state.metaReceipt !== undefined) return json(state.metaReceipt);
      return json({ messages: [{ id: 'fixture-receipt-' + state.meta.length }] });
    }
    assert.equal(url.origin, BASE, 'No real network or unrecognized origin is allowed');
    if (url.pathname === '/auth/v1/admin/users/' + OWNER) { assert.equal(method, 'GET'); return json(user); }
    assert.ok(url.pathname.startsWith('/rest/v1/'), 'Unmocked Auth route');
    const table = url.pathname.slice('/rest/v1/'.length);
    if (table.startsWith('rpc/')) { state.quota++; throw Error('Quota RPC is forbidden in consent tests'); }
    assert.ok(Object.hasOwn(state.tables, table), 'Unmocked table: ' + table);
    state.calls.push({ table, method, query: url.searchParams, body });
    if (method === 'GET') {
      let rows = state.tables[table].filter(row => matches(row, url.searchParams));
      if (url.searchParams.has('order')) {
        const [field, direction, nulls] = url.searchParams.get('order').split('.');
        rows = [...rows].sort((a, b) => {
          if (nulls === 'nullslast' && (a[field] == null || b[field] == null)) return a[field] == null ? (b[field] == null ? 0 : 1) : -1;
          return String(a[field] ?? '').localeCompare(String(b[field] ?? '')) * (direction === 'desc' ? -1 : 1);
        });
      }
      rows = rows.slice(0, Number(url.searchParams.get('limit') ?? rows.length));
      return json(rows.map(row => selected(row, url.searchParams.get('select'))));
    }
    if (method === 'POST') {
      // A fixture constraint only; the deployed schema must be checked separately.
      if (table === 'whatsapp_messages' && body.meta_message_id && state.tables[table].some(row => row.meta_message_id === body.meta_message_id)) return json({ code: '23505' }, 409);
      if (table === 'whatsapp_messages' && body.direction === 'out' && state.outboundStoreFailures-- > 0) return json({ code: 'XX000', message: 'fictional private database detail' }, 503);
      const optout = table === 'legacy_whatsapp_optouts' && state.tables[table].find(row => row.phone_e164 === body.phone_e164);
      const row = optout ? Object.assign(optout, body) : append(table, body);
      return headers.get('prefer')?.includes('return=representation') ? json([selected(row, url.searchParams.get('select'))], 201) : new Response(null, { status: 201 });
    }
    if (method === 'PATCH') {
      assert.equal(table, 'whatsapp_conversations');
      state.patches.push({ query: url.searchParams, body, prefer: headers.get('prefer') });
      if (state.patchFailures-- > 0) return json({ code: 'XX000', message: 'fictional private database detail' }, 503);
      if (state.patchRemoveConversation) state.tables[table] = [];
      const rows = state.patchZero-- > 0 ? [] : state.tables[table].filter(row => matches(row, url.searchParams));
      rows.forEach(row => Object.assign(row, body));
      return state.patchMinimal ? new Response(null, { status: 204 }) : json(rows.map(row => selected(row, url.searchParams.get('select'))));
    }
    if (method === 'DELETE') { state.tables[table] = state.tables[table].filter(row => !matches(row, url.searchParams)); return new Response(null, { status: 204 }); }
    throw Error('Unmocked HTTP method');
  };
  let handler;
  if (!original.Deno) globalThis.Deno = { env: {}, serve: null };
  globalThis.Deno.env.get = key => SETTINGS[key] ?? '';
  globalThis.Deno.serve = value => { handler = value; };
  await import(new URL('../../supabase/functions/whatsapp-webhook/index.ts?fixture=' + (++serial), import.meta.url).href);
  assert.equal(typeof handler, 'function');
  async function deliver(text, id = 'fixture-message-' + (++state.sequence), from = PHONE, validSignature = true) {
    state.time += 1000;
    class FixtureDate extends RealDate {
      constructor(...args) { super(...(args.length ? args : [state.time])); }
      static now() { return state.time; }
    }
    const raw = JSON.stringify({ entry: [{ changes: [{ field: 'messages', value: { metadata: { phone_number_id: SETTINGS.WHATSAPP_PHONE_NUMBER_ID }, messages: [{ type: 'text', from, id, text: { body: text } }] } }] }] });
    const signature = createHmac('sha256', SETTINGS.META_APP_SECRET).update(raw).digest('hex');
    globalThis.Date = FixtureDate;
    try { return await handler(new Request('https://consent-handler.invalid/', { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=' + (validSignature ? signature : '0'.repeat(64)) }, body: raw })); }
    finally { globalThis.Date = RealDate; }
  }
  const conversation = () => state.tables.whatsapp_conversations.find(row => row.legacy_user_id === OWNER);
  const out = () => state.tables.whatsapp_messages.filter(row => row.direction === 'out');
  const thanks = () => state.meta.filter(row => row.content.startsWith('Obrigado por autorizar!'));
  const noConsent = () => { assert.ok(!conversation()?.consented_at); assert.equal(thanks().length, 0); assert.equal(state.ai, 0); assert.equal(state.quota, 0); };
  async function prompt(from = PHONE) {
    assert.equal((await deliver('Olá', 'fixture-prompt-' + (++state.sequence), from)).status, 200);
    assert.ok(out().at(-1)?.content.includes('Você concorda?'));
    noConsent();
  }
  return { state, append, deliver, conversation, out, thanks, noConsent, prompt };
}
