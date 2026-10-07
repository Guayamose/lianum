/** Local debug build only. No device installation, EAS upload or release key. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statfsSync,
  writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ownSpawnedBuildGroup } from './owned-build-process.mjs';

const mobile = fileURLToPath(new URL('../', import.meta.url));
const project = fileURLToPath(new URL('../../../', import.meta.url));
assert.ok(process.argv.length === 2 || (process.argv.length === 3 && process.argv[2] === '--preflight'));
assert.ok(Number(process.versions.node.split('.')[0]) >= 24, 'MOBILE_BUILD_NODE_24_REQUIRED');
const sdk = resolve(process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(),'Android/Sdk'));
for (const path of ['platforms/android-36/android.jar','build-tools/36.0.0/aapt2',
  'ndk/27.1.12297006/source.properties','cmake/3.22.1/bin/cmake','licenses/android-sdk-license']) {
  assert.ok(existsSync(join(sdk,path)), 'MOBILE_BUILD_SDK_COMPONENT_MISSING:'+path);
}
const java = spawnSync('java',['-version'],{encoding:'utf8'});
assert.equal(java.status,0,'MOBILE_BUILD_JAVA_REQUIRED');
const javaMajor = Number(/version "(\d+)/.exec(java.stderr)?.[1]);
assert.ok(javaMajor >= 17,'MOBILE_BUILD_JAVA_17_REQUIRED');
const sdkVersions = readFileSync(join(mobile,'node_modules/react-native/gradle/libs.versions.toml'),'utf8');
for(const expected of ['compileSdk = "36"','buildTools = "36.0.0"','ndkVersion = "27.1.12297006"'])
  assert.ok(sdkVersions.includes(expected),'MOBILE_BUILD_REVIEWED_RN_SDK_PROFILE');
const abi = ['arm64-v8a','x86_64'];
const gradleSHA256 = 'b266d5ff6b90eada6dc3b20cb090e3731302e553a27c5d3e4df1f0d76beaff06';
const gradleJVMArgs = '-Xmx1536m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8';
process.stdout.write(JSON.stringify({preflight:'PASS',javaMajor,architectures:abi,
  androidSDK:36,buildTools:'36.0.0',ndk:'27.1.12297006',gradle:'9.3.1'})+'\n');
if(process.argv[2] === '--preflight')process.exit(0);

const GiB = 1024**3;
const available = () => Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;
assert.ok(available() >= 5.5*GiB,'MOBILE_BUILD_INITIAL_MEMORY_FLOOR');
const disk=statfsSync(project);assert.ok(disk.bavail*disk.bsize >= 5*GiB,'MOBILE_BUILD_DISK_FLOOR');
const reportDirectory = join(project,'.internal/dev/reports');mkdirSync(reportDirectory,{recursive:true,mode:0o700});
const proofDirectory=join(project,'.internal/runtime/omnichain-flat-profile/flat-wallet/.local/proof-workers');
const lockPath=existsSync(proofDirectory)?join(proofDirectory,'active.lock'):join(reportDirectory,'mobile-build.lock');
const runId=randomUUID();writeFileSync(lockPath,JSON.stringify({pid:process.pid,runId,
  relation:'mobile_android_debug',mode:'build'})+'\n',{flag:'wx',mode:0o600});
const report = {format:'LIANUM_MOBILE_ANDROID_DEBUG_BUILD_V1',runId,phase:'starting',
  architectures:abi,gradleSHA256,peakProcessGroupRSS:0,minimumAvailableRAM:available(),
  deviceInstalled:false,uploaded:false,releaseSigned:false,requiresMetro:true,groupSignals:[]};
const save=()=>writeFileSync(join(reportDirectory,'mobile-android-debug.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const bestEffortSave=()=>{try{save();}catch{report.failure??='MOBILE_BUILD_REPORT_WRITE_FAILED';}};
const env={...process.env,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,
  PATH:dirname(process.execPath)+':'+process.env.PATH,CMAKE_BUILD_PARALLEL_LEVEL:'1',
  // Gradle's documented no-daemon mode requires the launcher and build JVM
  // options to match; otherwise --no-daemon still creates a separate session.
  JAVA_OPTS:gradleJVMArgs,GRADLE_OPTS:''};
let active,ownedGroup,killTimer,cleanupUnconfirmed=false;
function stopGroup(signal='SIGTERM') {
  if(!ownedGroup)return;
  const result=ownedGroup.signal(signal);
  report.groupSignals.push({signal,identity:ownedGroup.identity,...result});
  if(result.unconfirmed){cleanupUnconfirmed=true;report.failure??='MOBILE_BUILD_SIGNAL_OWNERSHIP_UNCONFIRMED';}
  bestEffortSave();
}
const interrupted=()=>{report.failure='MOBILE_BUILD_INTERRUPTED';stopGroup();
  killTimer??=setTimeout(()=>stopGroup('SIGKILL'),5000);};
const onExit=()=>stopGroup('SIGKILL');
process.once('SIGINT',interrupted);process.once('SIGTERM',interrupted);process.once('exit',onExit);
async function run(command,args,cwd) {
  assert.equal(report.failure,undefined,'MOBILE_BUILD_PREVIOUS_FAILURE');
  active=spawn(command,args,{cwd,env,detached:true,stdio:'inherit'});
  let failure;
  const stop=code=>{failure??=code;report.failure??=code;stopGroup();killTimer??=setTimeout(()=>stopGroup('SIGKILL'),5000);};
  const monitor=setInterval(()=>{
    if(!ownedGroup)return;
    try{
      const group=ownedGroup.snapshot(),rss=group.rssBytes;
      report.peakProcessGroupRSS=Math.max(report.peakProcessGroupRSS,rss);
      const memory=available();report.minimumAvailableRAM=Math.min(report.minimumAvailableRAM,memory);save();
      if(rss>3*GiB||memory<2.5*GiB)stop(rss>3*GiB?'MOBILE_BUILD_PROCESS_GROUP_MEMORY_LIMIT':'MOBILE_BUILD_AVAILABLE_RAM_FLOOR');
    }catch(error){report.monitorFailure??=String(error.message).match(/MOBILE_BUILD_[A-Z0-9_]+/)?.[0]??'MOBILE_BUILD_RESOURCE_MONITOR_FAILED';
      stop('MOBILE_BUILD_RESOURCE_MONITOR_FAILED');}
  },250);
  const timeout=setTimeout(()=>{failure='MOBILE_BUILD_TIMEOUT';stopGroup();killTimer??=setTimeout(()=>stopGroup('SIGKILL'),5000);},30*60*1000);
  try {
    const {code,signal}=await new Promise((resolve,reject)=>{
      active.once('spawn',()=>{try{ownedGroup=ownSpawnedBuildGroup(active,{allowDetachedDescendants:true});
        report.ownedBuildProcess=ownedGroup.identity;bestEffortSave();}
        catch(error){cleanupUnconfirmed=true;reject(error);}});
      active.once('error',reject);active.once('close',(code,signal)=>resolve({code,signal}));
    });
    assert.equal(failure,undefined,failure);assert.equal(report.failure,undefined,report.failure);
    assert.equal(code,0,'MOBILE_BUILD_COMMAND_FAILED');assert.equal(signal,null);
  }finally{
    clearInterval(monitor);clearTimeout(timeout);clearTimeout(killTimer);killTimer=undefined;
    if(ownedGroup){
      stopGroup('SIGKILL');
      for(let check=0;check<20;check++){
        try{const group=ownedGroup.snapshot();if(group.gone||group.liveCount===0){ownedGroup=undefined;break;}}
        catch{cleanupUnconfirmed=true;break;}
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(ownedGroup)cleanupUnconfirmed=true;
    }
    active=undefined;
  }
}
try {
  save();report.phase='prebuild';
  await run(process.execPath,[join(mobile,'node_modules/expo/bin/cli'),'prebuild','--no-install','--platform','android'],mobile);
  const wrapper=join(mobile,'android/gradle/wrapper/gradle-wrapper.properties');
  let properties=readFileSync(wrapper,'utf8');
  assert.ok(properties.includes('gradle-9.3.1-bin.zip'),'MOBILE_BUILD_REVIEWED_GRADLE_VERSION');
  if(/distributionSha256Sum=/.test(properties))assert.ok(properties.includes('distributionSha256Sum='+gradleSHA256));
  else{properties+='\ndistributionSha256Sum='+gradleSHA256+'\n';writeFileSync(wrapper,properties);}
  report.phase='gradle';save();
  await run(join(mobile,'android/gradlew'),[':app:assembleDebug','--no-daemon','--max-workers=1',
    '-Dorg.gradle.jvmargs='+gradleJVMArgs,
    '-Porg.gradle.parallel=false','-Pkotlin.compiler.execution.strategy=in-process',
    '-PreactNativeArchitectures='+abi.join(','),'-Pandroid.builder.sdkDownload=false'],join(mobile,'android'));
  const apk=join(mobile,'android/app/build/outputs/apk/debug/app-debug.apk'),bytes=readFileSync(apk);
  const entries=spawnSync('unzip',['-Z','-1',apk],{encoding:'utf8'});assert.equal(entries.status,0,'MOBILE_BUILD_APK_INSPECTION');
  const included=[...new Set([...entries.stdout.matchAll(/^lib\/([^/]+)\//gm)].map(match=>match[1]))].sort();
  assert.deepEqual(included,[...abi].sort(),'MOBILE_BUILD_APK_ARCHITECTURES');
  report.apk='apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk';
  report.apkSHA256=createHash('sha256').update(bytes).digest('hex');report.apkBytes=bytes.length;
  report.phase='completed';save();process.stdout.write(JSON.stringify(report)+'\n');
}catch(error){report.phase='failed';report.failure??=String(error.message).match(/MOBILE_BUILD_[A-Z0-9_]+/)?.[0]??'MOBILE_BUILD_FAILED';save();throw error;}
finally{
  stopGroup('SIGKILL');clearTimeout(killTimer);
  process.removeListener('SIGINT',interrupted);process.removeListener('SIGTERM',interrupted);process.removeListener('exit',onExit);
  const lock=JSON.parse(readFileSync(lockPath,'utf8'));assert.equal(lock.pid,process.pid);assert.equal(lock.runId,runId);
  report.lockPreserved=cleanupUnconfirmed;bestEffortSave();
  if(!cleanupUnconfirmed)unlinkSync(lockPath);
  assert.equal(cleanupUnconfirmed,false,'MOBILE_BUILD_CLEANUP_OWNERSHIP_UNCONFIRMED');
}
