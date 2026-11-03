import fs from 'node:fs';
const project='ios/App/App.xcodeproj/project.pbxproj';
fs.writeFileSync(project,fs.readFileSync(project,'utf8').replace(/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+/g,'IPHONEOS_DEPLOYMENT_TARGET = 16.0'));
const podfile='ios/App/Podfile';
fs.writeFileSync(podfile,fs.readFileSync(podfile,'utf8').replace(/platform :ios, '[0-9.]+'/g,"platform :ios, '16.0'"));
