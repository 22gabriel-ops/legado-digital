import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {prepareAppleBuild,appAssets} from './prepare_apple_build.mjs';
const source=fileURLToPath(new URL('../',import.meta.url));
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'legado-apple-bundle-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 for(const asset of appAssets){const target=path.join(root,asset);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,asset),target)}
 return root;
}
test('native bundle retains real Apple purchase and restore, excludes unfinished offers and marketing pages',t=>{
 const root=fixture(t),original=fs.readFileSync(path.join(root,'index.html'),'utf8');
 fs.mkdirSync(path.join(root,'web/site'),{recursive:true});fs.writeFileSync(path.join(root,'web/site/index.html'),'stale cached marketing');
 prepareAppleBuild(root);const html=fs.readFileSync(path.join(root,'web/index.html'),'utf8');
 assert.match(html,/LEGACY_APPLE_BILLING_READY = true/);assert.match(html,/id="subscribe-plus"/);assert.match(html,/id="restore-purchases"/);
 assert.match(html,/100 interações/);assert.match(html,/stdeula/);assert.doesNotMatch(html,/Meu Legado Completo|R\$ 99,90|R\$ 19,90|três planos|Assinaturas ainda em preparação/);
 assert.equal(fs.existsSync(path.join(root,'web/site/index.html')),false);assert.equal(fs.readFileSync(path.join(root,'index.html'),'utf8'),original);
 const first=fs.readFileSync(path.join(root,'web/index.html'));prepareAppleBuild(root);assert.deepEqual(fs.readFileSync(path.join(root,'web/index.html')),first);
 // Crawl the packaged HTML graph, resolving relative links as Capacitor does.
 for(const file of appAssets.filter(x=>x.endsWith('.html'))){
  const page=fs.readFileSync(path.join(root,'web',file),'utf8');
  for(const m of page.matchAll(/\bhref=["']([^"']+)["']/g)){
   const value=m[1];
   if(/^(?:https?:|mailto:)/.test(value)){
    assert.ok(value.startsWith('https://www.apple.com/legal/')||value.startsWith('https://wa.me/')||value.startsWith('mailto:'),'unexpected external navigation: '+value);continue;
   }
   const resolved=new URL(value,'https://native.invalid/'+file);
   if(resolved.pathname==='/')continue;
   assert.ok(fs.existsSync(path.join(root,'web',decodeURIComponent(resolved.pathname.slice(1)))),'missing app link: '+value);
  }
 }
});
test('missing product markers fail the build instead of silently shipping a mismatched app',t=>{
 const root=fixture(t),p=path.join(root,'index.html');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('window.LEGACY_APPLE_BILLING_READY = false;',''));
 assert.throws(()=>prepareAppleBuild(root),/app marker/);
});
test('every supported workflow builds the same Apple product before validation and native sync',()=>{
 const yaml=fs.readFileSync(path.join(source,'codemagic.yaml'),'utf8');
 const workflows=[...yaml.matchAll(/^  (ios-[\w-]+):\n([\s\S]*?)(?=^  ios-|$(?![\s\S]))/gm)];
 assert.deepEqual(workflows.map(m=>m[1]),['ios-simulator','ios-appstore','ios-apple-sandbox']);
 for(const [,name,body] of workflows){
  assert.equal((body.match(/node scripts\/prepare_apple_build\.mjs/g)||[]).length,1,name);
  assert.doesNotMatch(body,/prepare_ios_free|cp -R site/);
  assert.ok(body.indexOf('prepare_apple_build.mjs')<body.indexOf('npm run check'),name);
  assert.match(body,/prepare_apple_native\.mjs[\s\S]*npx cap sync ios/);
 }
});
