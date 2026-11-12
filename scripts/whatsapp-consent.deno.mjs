import assert from 'node:assert/strict';
import { fixture, OWNER, OTHER, PHONE, ALIAS } from './test-helpers/whatsapp-consent-fixture.mjs';

// Register before the fixture temporarily replaces Deno.serve/env. Cleanup also
// runs after failed assertions; no test can leave its fake globals in another.
const test = (name, fn) => Deno.test(name, async () => {
  const cleanup = [];
  try { await fn({ after: callback => cleanup.push(callback) }); }
  finally { for (const callback of cleanup.reverse()) callback(); }
});

for (const reply of ['Sim', 'SIM!', 'Eu concordo', '  Eu   concordo! ', 'Sim, eu concordo', 'concordo', 'eu aceito', 'autorizo', 'Ｓｉｍ', 'sim,\neu concordo']) test('complete affirmative after recorded disclosure: ' + JSON.stringify(reply), async t => {
  const h = await fixture(t); await h.prompt();
  assert.equal((await h.deliver(reply, 'fixture-accept')).status, 200);
  assert.ok(h.conversation().consented_at); assert.equal(h.thanks().length, 1);
  assert.equal(h.state.ai, 0); assert.equal(h.state.quota, 0);
  const patch = h.state.patches[0];
  assert.equal(patch.query.get('legacy_user_id'), 'eq.' + OWNER);
  assert.equal(patch.query.get('sender_wa_id'), 'eq.' + PHONE);
  assert.equal(patch.query.get('consented_at'), 'is.null');
  assert.ok(patch.prefer.includes('return=representation'));
});

for (const reply of ['Não', 'Eu não concordo', 'não autorizo', 'talvez', 'Sim?', 'Sim, mas não concordo', 'Eu concordo se não guardar mensagens', 'Concordo apenas se...', 'sim, quero excluir esta conversa']) test('negative, ambiguous or conditional input cannot authorize: ' + JSON.stringify(reply), async t => {
  const h = await fixture(t); await h.prompt(); await h.deliver(reply); h.noConsent(); assert.equal(h.state.patches.length, 0);
});

test('bare affirmative requires an immediately preceding accepted and recorded disclosure', async t => {
  const h = await fixture(t); await h.deliver('Sim'); h.noConsent();
  assert.ok(h.out().at(-1).content.includes('Você concorda?'));
  await h.deliver('Não'); await h.deliver('Sim'); h.noConsent();
  assert.ok(h.out().at(-1).content.includes('Você concorda?'), 'Refusal followed by Sim asks again rather than inheriting old consent context');
  await h.deliver('Eu concordo'); assert.ok(h.conversation().consented_at);
});

test('intervening operational response invalidates an old disclosure', async t => {
  const h = await fixture(t); await h.prompt();
  h.append('whatsapp_messages', { conversation_id: h.conversation().id, direction: 'out', content: 'Fictional unrelated operational response' });
  await h.deliver('Sim'); h.noConsent();
});

for (const from of [PHONE, ALIAS]) test('PARAR through a validated phone alias invalidates only pending consent context: ' + (from === PHONE ? 'canonical' : 'alias'), async t => {
  const h = await fixture(t); await h.prompt();
  await h.deliver('PARAR', 'fixture-stop', from);
  const stop = structuredClone(h.state.tables.legacy_whatsapp_optouts[0]);
  await h.deliver('Sim'); h.noConsent();
  assert.deepEqual(h.state.tables.legacy_whatsapp_optouts[0], stop, 'Consent does not reactivate marketing or rewrite opt-out');
  await h.deliver('Eu concordo'); assert.ok(h.conversation().consented_at);
  assert.deepEqual(h.state.tables.legacy_whatsapp_optouts[0], stop);
});

test('interrupted conditional PATCH can resume the same latest message exactly once in this serial fixture', async t => {
  const h = await fixture(t); await h.prompt(); h.state.patchFailures = 1;
  assert.equal((await h.deliver('Sim', 'fixture-retry')).status, 500); h.noConsent();
  assert.equal((await h.deliver('Sim', 'fixture-retry')).status, 200);
  assert.ok(h.conversation().consented_at); assert.equal(h.thanks().length, 1);
  const timestamp = h.conversation().consented_at;
  await h.deliver('Sim', 'fixture-retry');
  assert.equal(h.thanks().length, 1); assert.equal(h.conversation().consented_at, timestamp);
  assert.equal(h.state.ai, 0); assert.equal(h.state.quota, 0);
  assert.ok(!JSON.stringify(h.state.errors).includes('fictional private database detail'));
});

for (const later of ['Não', 'Olá', 'PARAR']) test('old failed consent retry cannot overtake a later event: ' + later, async t => {
  const h = await fixture(t); await h.prompt(); h.state.patchFailures = 1;
  await h.deliver('Sim', 'fixture-stale'); await h.deliver(later, 'fixture-later');
  await h.deliver('Sim', 'fixture-stale'); h.noConsent();
});

test('HTTP204/zero PATCH without persisted consent never acknowledges success', async t => {
  const h = await fixture(t); await h.prompt(); h.state.patchZero = 1; h.state.patchMinimal = true;
  assert.equal((await h.deliver('Eu concordo')).status, 500); h.noConsent();
});

test('PATCH with ignored representation is confirmed by a scoped reread', async t => {
  const h = await fixture(t); await h.prompt(); h.state.patchMinimal = true;
  assert.equal((await h.deliver('Eu concordo')).status, 200); assert.ok(h.conversation().consented_at); assert.equal(h.thanks().length, 1);
});

test('a conversation removed during conditional PATCH cannot be acknowledged', async t => {
  const h = await fixture(t); await h.prompt(); h.state.patchRemoveConversation = true;
  assert.equal((await h.deliver('Eu concordo')).status, 500); h.noConsent();
});

test('failed Meta acknowledgement retries the existing consent without a second timestamp or AI', async t => {
  const h = await fixture(t); await h.prompt(); h.state.sendFailures = 1;
  assert.equal((await h.deliver('Sim', 'fixture-send-retry')).status, 500);
  const timestamp = h.conversation().consented_at;
  assert.ok(timestamp); assert.equal(h.out().filter(row => row.content.startsWith('Obrigado')).length, 0);
  assert.equal((await h.deliver('Sim', 'fixture-send-retry')).status, 200);
  assert.equal(h.conversation().consented_at, timestamp); assert.equal(h.state.patches.length, 1);
  assert.equal(h.out().filter(row => row.content.startsWith('Obrigado')).length, 1);
  assert.equal(h.state.ai, 0); assert.equal(h.state.quota, 0);
});

for (const receipt of [{}, { messages: [] }, { messages: [{ id: '' }] }, { messages: [{ id: ' ' }] }, { messages: [{ id: 123 }] }, { messages: [{ id: 'fixture-receipt' }], error: { code: 100 } }]) test('ambiguous HTTP2xx receipt cannot establish disclosure context: ' + JSON.stringify(receipt), async t => {
  const h = await fixture(t); h.state.metaReceipt = receipt;
  assert.equal((await h.deliver('Olá')).status, 500);
  assert.equal(h.out().length, 0);
  assert.equal((await h.deliver('Sim')).status, 500); h.noConsent();
  assert.equal(h.out().length, 0); assert.equal(h.state.patches.length, 0);
});

test('accepted Meta disclosure with failed history storage does not become consent context', async t => {
  const h = await fixture(t); h.state.outboundStoreFailures = 1;
  assert.equal((await h.deliver('Olá')).status, 500); assert.equal(h.out().length, 0);
  await h.deliver('Sim'); h.noConsent(); assert.equal(h.state.patches.length, 0);
});

test('unique verified phone aliases reuse canonical conversation and preserve its consent', async t => {
  const h = await fixture(t); await h.prompt(ALIAS); await h.deliver('Eu concordo', 'fixture-alias-accept', PHONE);
  assert.equal(h.state.tables.whatsapp_conversations.length, 1); assert.equal(h.conversation().sender_wa_id, PHONE);
  const timestamp = h.conversation().consented_at;
  await h.deliver('apagar', 'fixture-next', ALIAS);
  assert.ok(h.out().at(-1).content.startsWith('Posso excluir o histórico'));
  assert.equal(h.conversation().consented_at, timestamp); assert.equal(h.state.ai, 0); assert.equal(h.state.quota, 0);
  assert.equal(h.state.meta.at(-1).to, ALIAS, 'Raw sender is retained as Meta recipient only');
});

test('a unique existing legacy alias conversation is reused without rewriting sender or timestamp', async t => {
  const h = await fixture(t, { rows: { whatsapp_conversations: [{ id: 'fixture-legacy', legacy_user_id: OWNER, sender_wa_id: ALIAS, consented_at: '2026-01-01T00:00:00Z' }] } });
  await h.deliver('apagar'); assert.equal(h.state.tables.whatsapp_conversations.length, 1);
  assert.equal(h.conversation().sender_wa_id, ALIAS); assert.equal(h.conversation().consented_at, '2026-01-01T00:00:00Z'); assert.equal(h.state.patches.length, 0);
});

test('ambiguous conversations fail closed even if one already has consent', async t => {
  const h = await fixture(t, { rows: { whatsapp_conversations: [
    { id: 'fixture-first', legacy_user_id: OWNER, sender_wa_id: PHONE, consented_at: null },
    { id: 'fixture-second', legacy_user_id: OWNER, sender_wa_id: ALIAS, consented_at: '2026-01-01T00:00:00Z' },
  ] } });
  assert.equal((await h.deliver('Eu concordo')).status, 500);
  assert.equal(h.state.patches.length, 0); assert.equal(h.state.meta.length, 0); assert.equal(h.state.tables.whatsapp_messages.length, 0);
});

for (const secondOwner of [OWNER, OTHER]) test('multiple verified alias records preserve single-record identity guard: ' + (secondOwner === OWNER ? 'same owner' : 'different owner'), async t => {
  const h = await fixture(t, { verifications: [
    { owner_id: OWNER, phone_e164: '+' + PHONE, status: 'verified' },
    { owner_id: secondOwner, phone_e164: '+' + ALIAS, status: 'verified' },
  ] });
  await h.deliver('Eu concordo'); h.noConsent(); assert.equal(h.state.tables.whatsapp_conversations.length, 0);
});

for (const user of [{ id: OTHER }, { user_metadata: { whatsapp_phone: '+442000000000', whatsapp_opt_in: true } }, { user_metadata: { whatsapp_phone: '+' + PHONE, whatsapp_opt_in: false } }]) test('Auth owner, validated phone and opt-in must all match: ' + JSON.stringify(user), async t => {
  const h = await fixture(t, { user }); await h.deliver('Eu concordo'); h.noConsent(); assert.equal(h.state.tables.whatsapp_conversations.length, 0);
});

test('a duplicate message belonging to another conversation cannot read its content or grant consent', async t => {
  const h = await fixture(t, { rows: {
    whatsapp_conversations: [{ id: 'fixture-foreign', legacy_user_id: OTHER, sender_wa_id: '442000000000', consented_at: null }],
    whatsapp_messages: [{ conversation_id: 'fixture-foreign', direction: 'in', content: 'Fictional unrelated private content', meta_message_id: 'fixture-collision' }],
  } });
  await h.prompt(); assert.equal((await h.deliver('Sim', 'fixture-collision')).status, 500); h.noConsent();
  const contentReads = h.state.calls.filter(call => call.table === 'whatsapp_messages' && call.method === 'GET' && call.query.get('select')?.includes('content'));
  assert.ok(contentReads.every(call => call.query.get('conversation_id') === 'eq.' + h.conversation().id));
});

test('commercial PARAR preserves an already stored profile consent timestamp', async t => {
  const timestamp = '2026-01-01T00:00:00Z';
  const h = await fixture(t, { rows: { whatsapp_conversations: [{ id: 'fixture-consented', legacy_user_id: OWNER, sender_wa_id: PHONE, consented_at: timestamp }] } });
  await h.deliver('PARAR'); assert.equal(h.conversation().consented_at, timestamp); assert.equal(h.state.patches.length, 0);
  assert.equal(h.state.tables.whatsapp_messages.length, 0); assert.equal(h.state.tables.legacy_whatsapp_optouts.length, 1);
});

test('invalid webhook signature does not read identity, write history or send a reply', async t => {
  const h = await fixture(t); assert.equal((await h.deliver('Eu concordo', 'fixture-bad-signature', PHONE, false)).status, 401);
  assert.equal(h.state.calls.length, 0); assert.equal(h.state.meta.length, 0); h.noConsent();
});
