import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {appAssets} from './prepare_apple_build.mjs';
export function verifyAppleBundle({preparedDir,nativeDir,revision}){
 const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
 const files={};
 for(const asset of appAssets){
  const prepared=fs.readFileSync(path.join(preparedDir,asset)),native=fs.readFileSync(path.join(nativeDir,asset));
  if(!prepared.equals(native))throw Error('Native asset does not match prepared candidate: '+asset);
  files[asset]=sha(native);
 }
 const html=fs.readFileSync(path.join(nativeDir,'index.html'),'utf8');
 if(!html.includes('window.LEGACY_APPLE_BILLING_READY = true;')||!html.includes('id="subscribe-plus"')||!html.includes('id="restore-purchases"'))throw Error('Native Apple purchase edition missing');
 if(/Meu Legado Completo|R\$ 99,90|R\$ 19,90|três planos/.test(html))throw Error('Unfinished or hardcoded offer in native candidate');
 const visit=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?visit(path.join(dir,e.name)):[path.join(dir,e.name)]);
 for(const file of visit(nativeDir).filter(f=>f.endsWith('.html'))){
  const relative=path.relative(nativeDir,file).split(path.sep).join('/');
  if(!appAssets.includes(relative))throw Error('Unexpected native HTML page: '+relative);
 }
 const config=JSON.parse(fs.readFileSync(path.join(path.dirname(nativeDir),'capacitor.config.json'),'utf8'));
 if(config.appId!=='com.gabrielcruz.legadodigital'||!config.packageClassList?.includes('LegacyStoreKitPlugin'))throw Error('Native bundle identifier or StoreKit plugin missing');
 return {revision,bundleId:config.appId,productId:'br.com.meulegado.plus.mensal',appleBilling:true,files};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.cwd();
 if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim())throw Error('Commit the reviewed candidate before recording release provenance');
 const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const result=verifyAppleBundle({preparedDir:path.join(root,'web'),nativeDir:path.resolve(process.argv[2]||'ios/App/App/public'),revision});
 fs.mkdirSync('build/verification',{recursive:true});fs.writeFileSync('build/verification/apple-bundle.json',JSON.stringify(result,null,2)+'\n');
 console.log('Native Apple assets verified for commit '+revision);
}
