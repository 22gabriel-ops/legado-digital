import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Every iOS workflow packages the same product. Marketing pages and unfinished
// offers stay outside the native bundle; the website source is preserved.
export const appAssets = [
  'index.html', 'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png',
  'guardioes.html', 'privacidade.html', 'exclusao-de-dados.html', 'suporte.html',
  'site/favicon.svg',
];
export function prepareAppleBuild(root = process.cwd()) {
  const output = path.join(root, 'web');
  for (const asset of appAssets) {
    if (!fs.statSync(path.join(root, asset)).isFile()) throw Error('App asset missing: ' + asset);
  }
  let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const replace = (old, value) => {
    if (html.split(old).length !== 2) throw Error('Expected exactly one app marker: ' + old);
    html = html.replace(old, value);
  };
  replace('window.LEGACY_APPLE_BILLING_READY = false;', 'window.LEGACY_APPLE_BILLING_READY = true;');
  for (const id of ['future-complete-plan', 'future-exclusive-number']) {
    const pattern = new RegExp('^<div[^\\n]*id="' + id + '"[^\\n]*</div>\\n', 'gm');
    if ([...html.matchAll(pattern)].length !== 1) throw Error('Unavailable offer marker missing or duplicated: ' + id);
    html = html.replace(pattern, '');
  }
  replace('<span id="plus-price">R$ 19,90</span>', '<span id="plus-price">Consultando preço…</span>');
  replace('disabled>Contrate no aplicativo para iPhone ou iPad</button>', 'disabled>Consultando App Store…</button>');
  replace('disabled>Restaure sua assinatura no aplicativo iOS</button>', 'disabled>Restaurar compras</button>');
  replace('No iPhone e iPad, o Meu Legado Plus é contratado exclusivamente pelo sistema de compras da App Store. Este site não processa assinaturas.', 'Consulte o preço da assinatura na App Store. Você também pode restaurar uma compra existente.');
  replace('Seu plano Grátis prevê <strong>10 interações por mês</strong>. O Plus prevê <strong>100 interações por mês</strong> por R$ 19,90/mês.', 'O Grátis inclui <strong>10 interações por mês</strong>. O Meu Legado Plus inclui <strong>100 interações por mês</strong>; consulte o preço da assinatura acima.');
  for (const forbidden of ['R$ 99,90', 'R$ 19,90', 'Meu Legado Completo', 'três planos', 'Assinaturas ainda em preparação']) {
    if (html.includes(forbidden)) throw Error('Unfinished or stale offer in iOS bundle: ' + forbidden);
  }
  fs.rmSync(output, { recursive: true, force: true });
  for (const asset of appAssets) {
    const target = path.join(output, asset);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(root, asset), target);
  }
  fs.writeFileSync(path.join(output, 'index.html'), html);
  return output;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepareAppleBuild();
  console.log('iOS Apple subscription bundle prepared (no upload or submission).');
}
