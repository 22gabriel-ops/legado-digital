import fs from 'node:fs';
const project='ios/App/App.xcodeproj/project.pbxproj';
fs.writeFileSync(project,fs.readFileSync(project,'utf8').replace(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+)/g,(match,version)=>Number.parseFloat(version)<16?'IPHONEOS_DEPLOYMENT_TARGET = 16.0':match));
const podfile='ios/App/Podfile';
let podContent=fs.readFileSync(podfile,'utf8').replace(/platform :ios, '([0-9.]+)'/g,(match,version)=>Number.parseFloat(version)<16?"platform :ios, '16.0'":match);
const podMarker='# Legado minimum iOS version for every generated pod target.';
if(!podContent.includes(podMarker)){
 const anchor='  assertDeploymentTarget(installer)';
 if(podContent.split(anchor).length!==2)throw Error('Podfile post_install anchor missing or duplicated');
 podContent=podContent.replace(anchor,`${anchor}
  ${podMarker}
  installer.pods_project.targets.each do |target|
    target.build_configurations.each do |config|
      current = config.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
      if current.nil? || (current.match?(/^[0-9.]+$/) && Gem::Version.new(current) < Gem::Version.new('16.0'))
        config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
      end
    end
  end`);
}
fs.writeFileSync(podfile,podContent);

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
