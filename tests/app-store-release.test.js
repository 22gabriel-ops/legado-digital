import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const index = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const workflow = readFileSync(new URL('../codemagic.yaml', import.meta.url), 'utf8');
const maestro = readFileSync(new URL('../.maestro/ipad-post-login.yaml', import.meta.url), 'utf8');

test('versão pública não anuncia teste no destaque principal', () => {
  assert.doesNotMatch(index, /VERSÃO 1\.0 · TESTE/);
  assert.match(index, /MEMÓRIAS QUE CONTINUAM/);
});

test('ofertas e integrações incompletas não aparecem na conta', () => {
  assert.match(index, /\.hidden\s*\{[^}]*display\s*:\s*none/s);
  for (const heading of ['Meu plano', 'Minhas interações 🌳', 'Meu número exclusivo', 'Meu Legado no WhatsApp 🌳']) {
    assert.ok(index.includes('class="card hidden" aria-hidden="true"><h2>' + heading), heading);
  }
});

test('conversa real e exclusão de conta permanecem presentes', () => {
  assert.match(index, /async function loadChat\(\)/);
  assert.match(index, /\/functions\/v1\/legacy-conversation/);
  assert.match(index, /delete_my_account/);
  assert.match(index, /Não informe senhas, dados bancários/);
});

test('simulador não adultera páginas para capturas da App Store', () => {
  assert.doesNotMatch(workflow, /Preparar capturas fictícias|Pessoa convidada \(demonstração\)/);
  assert.doesNotMatch(maestro, /Pessoa convidada \(demonstração\)/);
  assert.match(workflow, /xcrun simctl io/);
});
