import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
const project='ios/App/App.xcodeproj/project.pbxproj';
let projectContent=fs.readFileSync(project,'utf8').replace(/IPHONEOS_DEPLOYMENT_TARGET = ([0-9.]+)/g,(match,version)=>Number.parseFloat(version)<16?'IPHONEOS_DEPLOYMENT_TARGET = 16.0':match);
// Capacitor's template defaults to English. The app supplies its localized UI
// in HTML, so declare that language in the native bundle as well.
const developmentRegion=/developmentRegion\s*=\s*(?:"[^"]+"|[^;\s]+);/g;
const knownRegions=/knownRegions\s*=\s*\([\s\S]*?\);/g;
if([...projectContent.matchAll(developmentRegion)].length!==1||[...projectContent.matchAll(knownRegions)].length!==1)throw Error('Xcode localization anchors missing or duplicated');
projectContent=projectContent.replace(developmentRegion,'developmentRegion = "pt-BR";').replace(knownRegions,'knownRegions = (\n\t\t\t\t"pt-BR",\n\t\t\t\tBase,\n\t\t\t);');
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
const plist='ios/App/App/Info.plist';
// This iOS-only step runs on macOS locally and in all iOS CI workflows. Use
// Apple's plist parser for nested dictionaries, without installing a dependency.
const info=JSON.parse(execFileSync('/usr/bin/plutil',['-convert','json','-o','-',plist],{encoding:'utf8'}));
const sceneManifest={UIApplicationSupportsMultipleScenes:false,UISceneConfigurations:{UIWindowSceneSessionRoleApplication:[{UISceneConfigurationName:'Legado Main',UISceneDelegateClassName:'$(PRODUCT_MODULE_NAME).LegadoSceneDelegate',UISceneStoryboardFile:'Main'}]}};
if(info.UIApplicationSceneManifest&&!isDeepStrictEqual(info.UIApplicationSceneManifest,sceneManifest))throw Error('Existing scene configuration requires manual review');
if(info.UIMainStoryboardFile&&info.UIMainStoryboardFile!=='Main')throw Error('Custom main storyboard requires manual review');
if(!fs.existsSync('ios/App/App/Base.lproj/Main.storyboard'))throw Error('Main storyboard is required for the single scene');
info.ITSAppUsesNonExemptEncryption=false;
info.CFBundleDevelopmentRegion='pt-BR';
info.CFBundleLocalizations=['pt-BR'];
info.UIApplicationSceneManifest=sceneManifest;
// Main is loaded only through UISceneStoryboardFile. LaunchScreen is retained.
delete info.UIMainStoryboardFile;
const escapeXML=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function plistXML(value,depth=0){
 const indent='\t'.repeat(depth);
 if(typeof value==='string')return `${indent}<string>${escapeXML(value)}</string>`;
 if(typeof value==='boolean')return `${indent}<${value?'true':'false'}/>`;
 if(typeof value==='number'&&Number.isFinite(value)){const tag=Number.isInteger(value)?'integer':'real';return `${indent}<${tag}>${value}</${tag}>`;}
 if(Array.isArray(value))return `${indent}<array>\n${value.map(v=>plistXML(v,depth+1)).join('\n')}\n${indent}</array>`;
 if(value&&typeof value==='object')return `${indent}<dict>\n${Object.keys(value).sort().map(key=>`${indent}\t<key>${escapeXML(key)}</key>\n${plistXML(value[key],depth+1)}`).join('\n')}\n${indent}</dict>`;
 throw Error('Unsupported Info.plist value');
}
const plistContent=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${plistXML(info)}\n</plist>\n`;

const delegate='ios/App/App/AppDelegate.swift';
let delegateContent=fs.readFileSync(delegate,'utf8');
function managedSwift(content,start,end,block,insert){
 const starts=content.split(start).length-1,ends=content.split(end).length-1;
 if(starts||ends){
  if(starts!==1||ends!==1||content.indexOf(end)<content.indexOf(start))throw Error('Scene generation markers missing or duplicated');
  return content.slice(0,content.indexOf(start))+block+content.slice(content.indexOf(end)+end.length);
 }
 return insert(content,block);
}
const hookStart='    // BEGIN LEGADO SCENE CONFIGURATION';
const hookEnd='    // END LEGADO SCENE CONFIGURATION';
const hook=`${hookStart}
    func application(_ application: UIApplication, configurationForConnecting connectingSceneSession: UISceneSession, options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        guard connectingSceneSession.role == .windowApplication else {
            let ignored = UISceneConfiguration(name: nil, sessionRole: connectingSceneSession.role)
            ignored.delegateClass = nil
            ignored.storyboard = nil
            return ignored
        }
        let main = UISceneConfiguration(name: "Legado Main", sessionRole: connectingSceneSession.role)
        main.delegateClass = LegadoSceneDelegate.self
        return main
    }
${hookEnd}`;
delegateContent=managedSwift(delegateContent,hookStart,hookEnd,hook,(content,block)=>{
 if(content.includes('configurationForConnecting'))throw Error('Custom AppDelegate scene hook requires manual review');
 const anchor='    var window: UIWindow?';
 if(content.split(anchor).length!==2)throw Error('AppDelegate window anchor missing or duplicated');
 return content.replace(anchor,anchor+'\n\n'+block);
});
const sceneStart='// BEGIN LEGADO SINGLE SCENE';
const sceneEnd='// END LEGADO SINGLE SCENE';
const scene=`${sceneStart}
// Main.storyboard creates the only window and CAPBridgeViewController.
class LegadoSceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard session.role == .windowApplication else { return }
        if let mainWindow = window {
            (UIApplication.shared.delegate as? AppDelegate)?.window = mainWindow
        }
        forwardURLs(connectionOptions.urlContexts)
        for activity in connectionOptions.userActivities { forwardActivity(activity) }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        guard scene.session.role == .windowApplication else { return }
        forwardURLs(URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        guard scene.session.role == .windowApplication else { return }
        forwardActivity(userActivity)
    }

    private func forwardURLs(_ contexts: Set<UIOpenURLContext>) {
        guard let delegate = UIApplication.shared.delegate as? AppDelegate else { return }
        for context in contexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [.openInPlace: context.options.openInPlace]
            if let source = context.options.sourceApplication { options[.sourceApplication] = source }
            if let annotation = context.options.annotation { options[.annotation] = annotation }
            _ = delegate.application(UIApplication.shared, open: context.url, options: options)
        }
    }

    private func forwardActivity(_ activity: NSUserActivity) {
        guard let delegate = UIApplication.shared.delegate as? AppDelegate else { return }
        _ = delegate.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
}
${sceneEnd}`;
delegateContent=managedSwift(delegateContent,sceneStart,sceneEnd,scene,(content,block)=>{
 if(content.includes('class LegadoSceneDelegate'))throw Error('Custom LegadoSceneDelegate requires manual review');
 return content.trimEnd()+'\n\n'+block+'\n';
});
// Validate all inputs before changing the generated files. AppDelegate's
// existing URL, process and notification callbacks remain outside our blocks.
fs.writeFileSync(project,projectContent);
fs.writeFileSync(podfile,podContent);
fs.writeFileSync(plist,plistContent);
fs.writeFileSync(delegate,delegateContent);
