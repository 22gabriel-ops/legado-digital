import fs from 'node:fs';
const project='ios/App/App.xcodeproj/project.pbxproj';
fs.writeFileSync(project,fs.readFileSync(project,'utf8').replace(/IPHONEOS_DEPLOYMENT_TARGET = [0-9.]+/g,'IPHONEOS_DEPLOYMENT_TARGET = 16.0'));
const podfile='ios/App/Podfile';
fs.writeFileSync(podfile,fs.readFileSync(podfile,'utf8').replace(/platform :ios, '[0-9.]+'/g,"platform :ios, '16.0'"));

// The app only relies on encryption supplied by Apple's operating system
// (for example HTTPS). Declare the documented export-compliance exemption so
// App Store Connect does not stop every TestFlight build for the same answer.
const plist='ios/App/App/Info.plist';
let plistContent=fs.readFileSync(plist,'utf8');
const encryptionKey='<key>ITSAppUsesNonExemptEncryption</key>';
if(plistContent.includes(encryptionKey)){
  plistContent=plistContent.replace(
    /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<(?:true|false)\s*\/>/,
    `${encryptionKey}\n\t<false/>`,
  );
}else{
  const updated=plistContent.replace(
    /<\/dict>\s*<\/plist>\s*$/,
    `\t${encryptionKey}\n\t<false/>\n</dict>\n</plist>\n`,
  );
  if(updated===plistContent)throw Error('Info.plist root dictionary not found');
  plistContent=updated;
}
fs.writeFileSync(plist,plistContent);
