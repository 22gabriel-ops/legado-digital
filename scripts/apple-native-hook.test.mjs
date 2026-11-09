import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../',import.meta.url));
const cli=path.join(source,'node_modules/@capacitor/cli/bin/capacitor');
const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
function fixture(t,{hook=true}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'legado-fresh-native-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const pkg=JSON.parse(fs.readFileSync(path.join(source,'package.json'),'utf8'));
 assert.equal(pkg.scripts['capacitor:sync:before'],'node scripts/prepare_native_sync.mjs');
 if(!hook)delete pkg.scripts['capacitor:sync:before'];
 fs.writeFileSync(path.join(root,'package.json'),JSON.stringify(pkg));
 fs.copyFileSync(path.join(source,'capacitor.config.json'),path.join(root,'capacitor.config.json'));
 fs.symlinkSync(path.join(source,'node_modules'),path.join(root,'node_modules'),'dir');
 fs.cpSync(path.join(source,'plugins'),path.join(root,'plugins'),{recursive:true});
 fs.mkdirSync(path.join(root,'scripts'));
 for(const script of ['prepare_native_sync.mjs','prepare_apple_native.mjs'])fs.copyFileSync(path.join(source,'scripts',script),path.join(root,'scripts',script));
 fs.mkdirSync(path.join(root,'web'));fs.writeFileSync(path.join(root,'web/index.html'),'<!doctype html><title>Legado test assets</title>');
 const bin=path.join(root,'bin');fs.mkdirSync(bin);
 const log=path.join(root,'native-commands.log');
 // Run the real Capacitor CLI and hooks. Stubs inspect the generated state at
 // dependency-install time; they never install dependencies, build, sign or open UI.
 fs.writeFileSync(path.join(bin,'inspect-pod.mjs'),`import fs from 'node:fs';
if(process.argv.includes('--version')){console.log('1.16.2');process.exit(0)}
if(process.argv.includes('install')){
 const pod=fs.readFileSync('Podfile','utf8');const version=pod.match(/platform :ios, '([0-9.]+)'/)?.[1];
 fs.appendFileSync(process.env.NATIVE_TEST_LOG,'pod-install:'+version+'\\n');
 if(Number.parseFloat(version)<16){console.error('Pod requires iOS 16 before installation');process.exit(17)}
 if(!pod.includes('# Legado minimum iOS version'))throw Error('Missing pod target hook');
}
`);
 fs.writeFileSync(path.join(bin,'pod'),'#!/bin/sh\nexec '+quote(process.execPath)+' '+quote(path.join(bin,'inspect-pod.mjs'))+' "$@"\n',{mode:0o755});
 fs.writeFileSync(path.join(bin,'xcodebuild'),'#!/bin/sh\nprintf "%s\\n" "xcodebuild:$*" >> "$NATIVE_TEST_LOG"\nexit 0\n',{mode:0o755});
 const env={...process.env,PATH:bin+path.delimiter+path.dirname(process.execPath)+path.delimiter+(process.env.PATH||''),NATIVE_TEST_LOG:log,CI:'1'};
 delete env.CAPACITOR_PLATFORM_NAME;
 const run=(...args)=>spawnSync(process.execPath,[cli,...args],{cwd:root,env,encoding:'utf8',timeout:30000});
 return {root,log,run};
}
test('fresh cap add reproduces deployment mismatch when the native preparation hook is missing',t=>{
 const f=fixture(t,{hook:false});const result=f.run('add','ios');
 assert.notEqual(result.status,0,result.stdout+result.stderr);
 assert.match(fs.readFileSync(f.log,'utf8'),/pod-install:14\.0/);
 assert.match(result.stdout+result.stderr,/Pod requires iOS 16 before installation/);
});
test('fresh cap add runs the official preparation hook before its first pod install, and sync is repeatable',t=>{
 const f=fixture(t);const result=f.run('add','ios');assert.equal(result.status,0,result.stdout+result.stderr);
 assert.match(fs.readFileSync(f.log,'utf8'),/pod-install:16\.0/);
 const podfile=path.join(f.root,'ios/App/Podfile');
 const before=fs.readFileSync(podfile,'utf8');
 assert.equal((before.match(/# Legado minimum iOS version/g)||[]).length,1);
 const repeat=f.run('sync','ios');assert.equal(repeat.status,0,repeat.stdout+repeat.stderr);
 assert.equal(fs.readFileSync(podfile,'utf8'),before);
});
test('native sync hook does not touch iOS for another platform',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'legado-other-platform-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const result=spawnSync(process.execPath,[path.join(source,'scripts/prepare_native_sync.mjs')],{cwd:root,env:{...process.env,CAPACITOR_PLATFORM_NAME:'android'},encoding:'utf8'});
 assert.equal(result.status,0,result.stdout+result.stderr);assert.deepEqual(fs.readdirSync(root),[]);
});
