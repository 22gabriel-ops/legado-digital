import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareAppleBuild,appAssets} from './prepare_apple_build.mjs';
import {verifyAppleBundle} from './verify_apple_bundle.mjs';
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'legado-native-audit-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=fileURLToPath(new URL('../',import.meta.url));
 for(const asset of appAssets){const target=path.join(root,asset);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(source,asset),target)}
 prepareAppleBuild(root);fs.mkdirSync(path.join(root,'App'),{recursive:true});fs.cpSync(path.join(root,'web'),path.join(root,'App/public'),{recursive:true});
 fs.writeFileSync(path.join(root,'App/capacitor.config.json'),JSON.stringify({appId:'com.gabrielcruz.legadodigital',packageClassList:['LegacyStoreKitPlugin']}));
 return {root,args:{preparedDir:path.join(root,'web'),nativeDir:path.join(root,'App/public'),revision:'test-fixture'}};
}
test('native provenance records every prepared asset and rejects stale embedded HTML',t=>{
 const {args}=fixture(t);const result=verifyAppleBundle(args);assert.equal(Object.keys(result.files).length,appAssets.length);assert.equal(result.revision,'test-fixture');
 fs.appendFileSync(path.join(args.nativeDir,'index.html'),'stale appended text');assert.throws(()=>verifyAppleBundle(args),/does not match/);
});
test('native provenance rejects marketing pages and a missing StoreKit plugin',t=>{
 const {root,args}=fixture(t);fs.mkdirSync(path.join(args.nativeDir,'marketing'));fs.writeFileSync(path.join(args.nativeDir,'marketing/index.html'),'marketing');assert.throws(()=>verifyAppleBundle(args),/Unexpected native HTML/);
 fs.rmSync(path.join(args.nativeDir,'marketing'),{recursive:true});fs.writeFileSync(path.join(root,'App/capacitor.config.json'),JSON.stringify({appId:'com.gabrielcruz.legadodigital',packageClassList:[]}));assert.throws(()=>verifyAppleBundle(args),/StoreKit plugin missing/);
});
