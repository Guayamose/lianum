/** Local development APKs only. No device installation, upload or production signing key. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, lstatSync, statfsSync,
  writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { ownSpawnedBuildGroup,buildProcessFailureDiagnosticV1 } from './owned-build-process.mjs';
import { nativeProcStatV1 } from '@lianum/proofs/host/process-files';
import nativeBuildLimits from '../plugins/with-native-build-limits.cjs';
import {nativeWalletPublicConfigurationV1} from '../src/native-wallet/native-wallet-public-configuration-v1.ts';

const mobile = fileURLToPath(new URL('../', import.meta.url));
const project = fileURLToPath(new URL('../../../', import.meta.url));
const nativeCmakeArguments = nativeBuildLimits.NATIVE_CMAKE_ARGUMENTS;
assert.ok(JSON.parse(readFileSync(join(mobile, 'app.json'), 'utf8')).expo.plugins
  .includes('./plugins/with-native-build-limits.cjs'), 'MOBILE_BUILD_NATIVE_LIMITS_PLUGIN_REQUIRED');
assert.ok(process.argv.length === 2 || (process.argv.length === 3
  && ['--preflight', '--standalone-local', '--verify-standalone-local'].includes(process.argv[2])), 'MOBILE_BUILD_FIXED_ARGUMENT');
const verificationOnly = process.argv[2] === '--verify-standalone-local';
const standaloneLocal = verificationOnly || process.argv[2] === '--standalone-local';
const variant = standaloneLocal ? 'release' : 'debug';
const reportName = verificationOnly ? 'mobile-android-standalone-review.json'
  : standaloneLocal ? 'mobile-android-standalone-local.json' : 'mobile-android-debug.json';
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
const gradleJVMArgs = standaloneLocal
  ? '-Xmx768m -XX:MaxMetaspaceSize=512m -XX:+UseSerialGC -XX:ActiveProcessorCount=2 -Dfile.encoding=UTF-8'
  : '-Xmx1024m -XX:MaxMetaspaceSize=512m -Dfile.encoding=UTF-8';
process.stdout.write(JSON.stringify({preflight:'PASS',javaMajor,architectures:abi,
  androidSDK:36,buildTools:'36.0.0',ndk:'27.1.12297006',gradle:'9.3.1',variant,standaloneLocal})+'\n');
if(process.argv[2] === '--preflight')process.exit(0);

const GiB = 1024**3;
const available = () => Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024;
assert.ok(available() >= 5.5*GiB,'MOBILE_BUILD_INITIAL_MEMORY_FLOOR');
const disk=statfsSync(project);assert.ok(disk.bavail*disk.bsize >= 5*GiB,'MOBILE_BUILD_DISK_FLOOR');
const reportDirectory = join(project,'.internal/dev/reports');mkdirSync(reportDirectory,{recursive:true,mode:0o700});
const proofDirectory=join(project,'.internal/runtime/omnichain-flat-profile/flat-wallet/.local/proof-workers');
const lockPath=existsSync(proofDirectory)?join(proofDirectory,'active.lock'):join(reportDirectory,'mobile-build.lock');
const runId=randomUUID();writeFileSync(lockPath,JSON.stringify({pid:process.pid,runId,
  relation:standaloneLocal?'mobile_android_standalone_local':'mobile_android_debug',mode:'build'})+'\n',{flag:'wx',mode:0o600});
const report = {format:verificationOnly?'LIANUM_MOBILE_ANDROID_STANDALONE_LOCAL_REVIEW_V1':standaloneLocal?'LIANUM_MOBILE_ANDROID_STANDALONE_LOCAL_BUILD_V1':'LIANUM_MOBILE_ANDROID_DEBUG_BUILD_V1',runId,phase:'starting',
  architectures:abi,gradleSHA256,nativeCmakeArguments,nativeJobPool:'owned_build=1',
  requestedGradleJVMArgs:gradleJVMArgs,effectiveJVMProcesses:[],peakProcessSnapshot:[],
  peakProcessGroupRSS:0,minimumAvailableRAM:available(),
  deviceInstalled:false,uploaded:false,releaseSigned:false,requiresMetro:true,groupSignals:[],
  variant,standaloneLocal,distributionProduction:false,noteCustodyOnDevice:false,
  biometricHardwareTested:false,tlsOnDeviceTested:false};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const publicWalletConfigurationPath='apps/mobile/src/native-wallet/native-wallet-public-configuration-v1.ts';
if(!verificationOnly)report.publicWalletConfiguration={
  ...nativeWalletPublicConfigurationV1,
  source:publicWalletConfigurationPath,
  sourceSHA256:sha256(readFileSync(join(project,publicWalletConfigurationPath))),
  embeddedSourceVerified:false,
};
function publicSourceInputs() {
  const sources = [];
  function retain(path) {
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'MOBILE_BUILD_SOURCE_SYMLINK');
    if (stat.isDirectory()) { for (const entry of readdirSync(path).sort()) retain(join(path, entry)); return; }
    assert.ok(stat.isFile(), 'MOBILE_BUILD_SOURCE_FILE');
    const bytes = readFileSync(path); sources.push({path:path.slice(project.length),bytes:bytes.length,sha256:sha256(bytes)});
  }
  for (const path of ['apps/mobile/App.tsx','apps/mobile/index.ts','apps/mobile/app.json',
    'apps/mobile/package.json','apps/mobile/package-lock.json','apps/mobile/metro.config.cjs',
    'apps/mobile/src','apps/mobile/scripts','apps/mobile/plugins','packages/mobile-protocol/package.json',
    'packages/mobile-protocol/src','packages/crypto/package.json','packages/crypto/src/native-wallet-v1.mjs',
    'packages/crypto/src/native-wallet-auth-v1.mjs','package-lock.json',
    'packages/mobile-protocol/src/wallet/contracts/generation-position-state-v2.mjs']) retain(join(project, path));
  return sources.sort((a,b)=>a.path.localeCompare(b.path));
}
const save=()=>writeFileSync(join(reportDirectory,reportName),JSON.stringify(report,null,2)+'\n',{mode:0o600});
const bestEffortSave=()=>{try{save();}catch{report.failure??='MOBILE_BUILD_REPORT_WRITE_FAILED';}};
const env={...process.env,ANDROID_HOME:sdk,ANDROID_SDK_ROOT:sdk,
  PATH:dirname(process.execPath)+':'+process.env.PATH,CMAKE_BUILD_PARALLEL_LEVEL:'1',
  // Gradle's documented no-daemon mode requires the launcher and build JVM
  // options to match; otherwise --no-daemon still creates a separate session.
  JAVA_OPTS:gradleJVMArgs,GRADLE_OPTS:''};
// Metro's source-map composition exceeded the former 384 MiB heap. Keep
// bundling bounded independently of Gradle and the native app's memory.
const standaloneNodeHeapMiB=768;
if (standaloneLocal) env.NODE_OPTIONS = '--max-old-space-size='+standaloneNodeHeapMiB;
let active,ownedGroup,killTimer,cleanupUnconfirmed=false;
function captureJVMProcesses(group) {
  for (const stat of group.processes) {
    if (/^[ZX]$/.test(stat.state)) continue;
    let arguments_;
    try {
      arguments_ = readFileSync(`/proc/${stat.pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) continue;
      throw error;
    }
    if (!/(^|\/)java$/.test(arguments_[0] ?? '')) continue;
    const current = nativeProcStatV1(stat.pid);
    if (!current) continue;
    assert.ok(current.startTimeTicks === stat.startTimeTicks
      && current.pgrp === stat.pgrp && current.session === stat.session,
    'MOBILE_BUILD_JVM_IDENTITY_CHANGED');
    const processClass = arguments_.find(value => [
      'org.gradle.wrapper.GradleWrapperMain',
      'org.gradle.launcher.daemon.bootstrap.GradleDaemon',
      'org.gradle.process.internal.worker.GradleWorkerMain',
      'worker.org.gradle.process.internal.worker.GradleWorkerMain',
      'org.jetbrains.kotlin.daemon.KotlinCompileDaemon'
    ].includes(value)) ?? (arguments_.includes('-jar') ? 'java-jar' : 'java-worker');
    const observed = {
      pid:stat.pid,startTimeTicks:stat.startTimeTicks,ppid:stat.ppid,
      pgrp:stat.pgrp,session:stat.session,uid:stat.uid,
      executable:arguments_[0],processClass,
      jvmFlags:arguments_.filter(value => /^-Xm[xs]/.test(value)
        || value.startsWith('-XX:MaxMetaspaceSize=')
        || value.startsWith('-XX:ReservedCodeCacheSize=')
        || value === '-XX:+UseSerialGC' || value.startsWith('-XX:ActiveProcessorCount=')
        || value.startsWith('-Dfile.encoding=')),
      peakRSSBytes:stat.rssBytes
    };
    // Verify the owned Gradle launcher/daemon's actual argv, rather than
    // treating requested JVM options as evidence of effective execution.
    // Other Java tools and worker JVMs retain their original configuration.
    if (standaloneLocal && report.phase === 'gradle' && (stat.pid === ownedGroup.identity.pid
      || processClass === 'org.gradle.launcher.daemon.bootstrap.GradleDaemon')) {
      assert.ok(observed.jvmFlags.includes('-XX:+UseSerialGC')
        && observed.jvmFlags.includes('-XX:ActiveProcessorCount=2'),
      'MOBILE_BUILD_FIXED_JVM_EXECUTION_FLAGS');
    }
    const index = report.effectiveJVMProcesses.findIndex(value =>
      value.pid === stat.pid && value.startTimeTicks === stat.startTimeTicks);
    if (index === -1) report.effectiveJVMProcesses.push(observed);
    else {
      observed.peakRSSBytes = Math.max(observed.peakRSSBytes,
        report.effectiveJVMProcesses[index].peakRSSBytes);
      report.effectiveJVMProcesses[index] = observed;
    }
  }
}
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
async function run(command,args,cwd,captureOutput=false) {
  assert.equal(report.failure,undefined,'MOBILE_BUILD_PREVIOUS_FAILURE');
  active=spawn(command,args,{cwd,env,detached:true,stdio:captureOutput?['ignore','pipe','inherit']:'inherit'});
  let failure, output = '', outputBytes = 0;
  if (captureOutput) active.stdout.on('data',bytes=>{
    outputBytes += bytes.length;
    if (outputBytes>1024*1024) { stop('MOBILE_BUILD_INSPECTION_OUTPUT_LIMIT'); return; }
    output += bytes.toString('utf8');
  });
  const stop=code=>{failure??=code;report.failure??=code;stopGroup();killTimer??=setTimeout(()=>stopGroup('SIGKILL'),5000);};
  const monitor=setInterval(()=>{
    if(!ownedGroup)return;
    let monitorPhase='GROUP_SNAPSHOT';
    try{
      const group=ownedGroup.snapshot(),rss=group.rssBytes;
      monitorPhase='JVM_ARGUMENTS';
      captureJVMProcesses(group);
      if (rss > report.peakProcessGroupRSS) report.peakProcessSnapshot = group.processes;
      report.peakProcessGroupRSS=Math.max(report.peakProcessGroupRSS,rss);
      monitorPhase='ENVIRONMENT_MEMORY';const memory=available();report.minimumAvailableRAM=Math.min(report.minimumAvailableRAM,memory);monitorPhase='REPORT_WRITE';save();
      monitorPhase='RESOURCE_LIMITS';
      if(rss>3*GiB||memory<2.5*GiB)stop(rss>3*GiB?'MOBILE_BUILD_PROCESS_GROUP_MEMORY_LIMIT':'MOBILE_BUILD_AVAILABLE_RAM_FLOOR');
    }catch(error){report.monitorFirstFailure??=ownedGroup.firstFailure()??buildProcessFailureDiagnosticV1(error,monitorPhase);report.monitorFailure??=String(error.message).match(/MOBILE_BUILD_[A-Z0-9_]+/)?.[0]??'MOBILE_BUILD_RESOURCE_MONITOR_FAILED';
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
    return output;
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
  if (standaloneLocal) report.sourceInputsBefore = publicSourceInputs();
  let retainedDirectory;
  if (verificationOnly) {
    const originalRunId='be5af832-fcf9-4f79-8828-f32572a262ba';
    retainedDirectory=join(reportDirectory,'mobile-android-standalone-local','attempt-'+originalRunId);
    const originBytes=readFileSync(join(retainedDirectory,'origin.json'));
    assert.equal(sha256(originBytes),'448298cb11b06bf46ff0ef3573f29de657d05f6405316fc57bc22a25dee1d187',
      'MOBILE_REVIEW_ORIGINAL_INPUT_PIN');
    const origin=JSON.parse(originBytes);
    assert.equal(origin.runId,originalRunId);assert.equal(origin.originalPhase,'failed');
    assert.equal(origin.originalFailure,'MOBILE_BUILD_ONE_ORIGINAL_SOURCE_IN_BUNDLE');
    for(const [name,pin] of Object.entries(origin.files)) {
      const path=join(retainedDirectory,name),stat=lstatSync(path);
      assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'MOBILE_REVIEW_ORIGINAL_REGULAR_FILE');
      const bytes=readFileSync(path);assert.equal(bytes.length,pin.bytes);assert.equal(sha256(bytes),pin.sha256);
    }
    const original=JSON.parse(readFileSync(join(retainedDirectory,'report.json')));
    assert.equal(original.runId,originalRunId);assert.equal(original.phase,'failed');assert.equal(original.lockPreserved,false);
    // Only this audit script changed. Every application, dependency, protocol
    // and other build input must still match the genuine original compilation.
    const appInputs=rows=>rows.filter(row=>row.path!=='apps/mobile/scripts/build-android-debug.mjs');
    assert.deepEqual(appInputs(report.sourceInputsBefore),appInputs(original.sourceInputsBefore),
      'MOBILE_REVIEW_ORIGINAL_APPLICATION_INPUTS');
    report.verificationOnly=true;report.compilationPerformed=false;
    report.originalCompilation={runId:originalRunId,phase:'failed',failure:origin.originalFailure,
      originSHA256:sha256(originBytes),files:origin.files};
  }
  if (!verificationOnly) {
  save();report.phase='prebuild';
  await run(process.execPath,[join(mobile,'node_modules/expo/bin/cli'),'prebuild','--no-clean','--no-install','--platform','android'],mobile);
  for (const path of ['android/app/build.gradle', 'android/build.gradle']) {
    const generated = readFileSync(join(mobile, path), 'utf8');
    for (const argument of nativeCmakeArguments) {
      assert.ok(generated.includes("'" + argument + "'"), 'MOBILE_BUILD_NATIVE_LIMITS_GENERATED');
    }
  }
  report.generatedNativeLimitsVerified = true;
  const wrapper=join(mobile,'android/gradle/wrapper/gradle-wrapper.properties');
  let properties=readFileSync(wrapper,'utf8');
  assert.ok(properties.includes('gradle-9.3.1-bin.zip'),'MOBILE_BUILD_REVIEWED_GRADLE_VERSION');
  if(/distributionSha256Sum=/.test(properties))assert.ok(properties.includes('distributionSha256Sum='+gradleSHA256));
  else{properties+='\ndistributionSha256Sum='+gradleSHA256+'\n';writeFileSync(wrapper,properties);}
  if (standaloneLocal) {
    const gradlePath=join(mobile,'android/app/build.gradle');
    const gradle = readFileSync(gradlePath,'utf8');
    assert.ok(/release\s*\{[\s\S]*?signingConfig signingConfigs\.debug/.test(gradle)
      && /storeFile file\('debug\.keystore'\)/.test(gradle), 'MOBILE_BUILD_DEVELOPMENT_SIGNING_REQUIRED');
    assert.ok(gradle.includes('bundleCommand = \"export:embed\"'), 'MOBILE_BUILD_ORIGINAL_EXPO_BUNDLER_REQUIRED');
    assert.ok(readFileSync(join(mobile,'android/gradle.properties'),'utf8').includes('hermesEnabled=true'),
      'MOBILE_BUILD_HERMES_REQUIRED');
    const bundleWorkersBlock = '// BEGIN LIANUM STANDALONE LOCAL BUNDLE\n'
      + 'react { extraPackagerArgs = [\"--max-workers\", \"1\"] }\n'
      + '// END LIANUM STANDALONE LOCAL BUNDLE';
    if (!gradle.includes(bundleWorkersBlock)) {
      assert.ok(!gradle.includes('LIANUM STANDALONE LOCAL BUNDLE'),'MOBILE_BUILD_BUNDLE_WORKERS_CONFIG_CHANGED');
      writeFileSync(gradlePath,gradle.trimEnd()+'\n\n'+bundleWorkersBlock+'\n');
    }
    report.bundlingWorkers=1;report.nodeHeapMiB=standaloneNodeHeapMiB;report.lintWorkerHeapMiB=192;
    report.generatedStandaloneConfigSHA256=sha256(readFileSync(gradlePath));
    // Gradle's original bundle inputs omit .mjs and the external protocol.
    // Remove only the generated bundle so this task rebuilds current JS while
    // preserving native compile caches and the previous debug APK.
    const generated = join(mobile,'android/app/build/generated/assets/react/release/index.android.bundle');
    if (existsSync(generated)) { assert.ok(lstatSync(generated).isFile() && !lstatSync(generated).isSymbolicLink(),
      'MOBILE_BUILD_GENERATED_BUNDLE_FILE'); unlinkSync(generated); }
    report.originalBundleTaskForcedByMissingOutput = true;report.taskOutputBuildCacheDisabled = true;
  }
  report.phase='gradle';save();
  await run(join(mobile,'android/gradlew'),[standaloneLocal?':app:assembleRelease':':app:assembleDebug',
    ...(standaloneLocal?['--no-build-cache','-Pandroid.experimental.lint.heapSize=192m']:[]),'--no-daemon','--max-workers=1',
    '-Dorg.gradle.jvmargs='+gradleJVMArgs,
    '-Porg.gradle.parallel=false','-Pkotlin.compiler.execution.strategy=in-process',
    '-PreactNativeArchitectures='+abi.join(','),'-Pandroid.builder.sdkDownload=false'],join(mobile,'android'));
  }
  const apk=verificationOnly?join(retainedDirectory,'app-release.apk')
    :join(mobile,'android/app/build/outputs/apk',variant,'app-'+variant+'.apk'),bytes=readFileSync(apk);
  const entries=spawnSync('unzip',['-Z','-1',apk],{encoding:'utf8'});assert.equal(entries.status,0,'MOBILE_BUILD_APK_INSPECTION');
  const included=[...new Set([...entries.stdout.matchAll(/^lib\/([^/]+)\//gm)].map(match=>match[1]))].sort();
  assert.deepEqual(included,[...abi].sort(),'MOBILE_BUILD_APK_ARCHITECTURES');
  if (standaloneLocal) {
    assert.equal(entries.stdout.split('\n').filter(path=>path==='assets/index.android.bundle').length,1,
      'MOBILE_BUILD_ONE_EMBEDDED_BUNDLE');
    const extracted=spawnSync('unzip',['-p',apk,'assets/index.android.bundle'],{maxBuffer:32*1024*1024,timeout:30000});
    assert.equal(extracted.status,0,'MOBILE_BUILD_BUNDLE_EXTRACTION');
    const bundle=extracted.stdout;
    assert.ok(bundle.length>12 && bundle.subarray(0,8).toString('hex')==='c61fbc03c103191f',
      'MOBILE_BUILD_EMBEDDED_HERMES_REQUIRED');
    const generated=readFileSync(verificationOnly?join(retainedDirectory,'generated.bundle')
      :join(mobile,'android/app/build/generated/assets/react/release/index.android.bundle'));
    assert.equal(sha256(bundle),sha256(generated),'MOBILE_BUILD_PACKAGED_BUNDLE_JOIN');
    const mapPath=verificationOnly?join(retainedDirectory,'packager.map')
      :join(mobile,'android/app/build/intermediates/sourcemaps/react/release/index.android.bundle.packager.map');
    const mapBytes=readFileSync(mapPath), sourceMap=JSON.parse(mapBytes);
    assert.ok(Array.isArray(sourceMap.sources) && Array.isArray(sourceMap.sourcesContent)
      && sourceMap.sources.length===sourceMap.sourcesContent.length,'MOBILE_BUILD_ORIGINAL_SOURCE_MAP');
    const required=['apps/mobile/App.tsx','apps/mobile/src/screens/OriginalAccountScreen.tsx',
      'apps/mobile/src/screens/LocalCustodyScreen.tsx',
      'apps/mobile/src/custody/local-root-note-vault-v1.ts',
      'apps/mobile/src/custody/balance-note-codec-v1.mjs',
      'apps/mobile/src/custody/unissued-deposit-terms-v1.mjs',
      'apps/mobile/src/custody/key-store.ts','apps/mobile/src/custody/signing.mjs',
      'apps/mobile/src/custody/original-account-lease-v2.mjs','apps/mobile/src/api/original-account-api-v2.mjs',
      'packages/mobile-protocol/src/original-account-review-v2.mjs',
      'packages/mobile-protocol/src/original-account-private-state-v1.mjs',
      // The packaged financial route must contain these exact current sources.
      'apps/mobile/src/screens/DeviceDepositScreen.tsx',
      'apps/mobile/src/api/device-owner-deposit-api-v1.ts',
      'apps/mobile/src/api/device-owner-reservation-api-v1.ts',
      'apps/mobile/src/api/device-owner-execution-api-v1.ts',
      'apps/mobile/src/api/device-owner-exit-api-v1.ts',
      'apps/mobile/src/api/device-owner-output-balance-api-v1.ts',
      'apps/mobile/src/custody/funded-balance-owner-codec-v1.mjs',
      'apps/mobile/src/custody/device-balance-withdrawal-codec-v1.mjs',
      'packages/mobile-protocol/src/device-deposit-consent-v1.mjs',
      'packages/mobile-protocol/src/device-reservation-consent-v1.mjs',
      'packages/mobile-protocol/src/device-execution-consent-v1.mjs',
      'packages/mobile-protocol/src/device-exit-consent-v1.mjs',
      'packages/mobile-protocol/src/device-output-balance-v1.mjs'];
    if(!verificationOnly)required.push(
      'packages/mobile-protocol/src/device-recovery-arm-consent-v1.mjs',
      'apps/mobile/src/screens/DefiPositionsScreen.tsx',
      'apps/mobile/src/api/device-defi-position-read-api-v1.mjs',
      'packages/mobile-protocol/src/device-defi-position-read-v1.mjs',
      'packages/mobile-protocol/src/wallet/contracts/generation-position-state-v2.mjs',
      'packages/mobile-protocol/src/device-external-flat-note-v1.mjs',
      'apps/mobile/src/api/device-external-flat-note-api-v1.mjs',
      'apps/mobile/src/screens/ExternalTokenNoteScreen.tsx',
      'apps/mobile/src/custody/device-external-flat-note-vault-v1.ts',
      'apps/mobile/src/state/private-wallet-state-v1.mjs',
      'apps/mobile/src/screens/PrivateWalletStateScreen.tsx',
      'apps/mobile/src/screens/DevicePagedNoteScreen.tsx',
      'apps/mobile/src/screens/DevicePagedGraphScreen.tsx',
      'apps/mobile/src/screens/device-paged-operation-form-v3.ts',
      'apps/mobile/src/screens/device-paged-guided-preparation-v3.mjs',
      'apps/mobile/src/components/wallet-ui.tsx',
      'apps/mobile/src/components/wallet-actions.tsx',
      'apps/mobile/src/screens/NativeWalletScreen.tsx',
      'apps/mobile/src/native-wallet/NativeWalletQr.tsx',
      'apps/mobile/src/native-wallet/native-wallet-controller.ts',
      publicWalletConfigurationPath,
      'apps/mobile/src/native-wallet/native-wallet-form-v1.mjs',
      'apps/mobile/src/custody/native-wallet-custody-v1.ts',
      'packages/crypto/src/native-wallet-v1.mjs',
      'packages/crypto/src/native-wallet-auth-v1.mjs',
      'apps/mobile/src/state/wallet-navigation-v1.mjs',
      'apps/mobile/src/custody/device-paged-note-vault-v3.ts',
      'apps/mobile/src/api/device-paged-owner-api-v3.mjs',
      'apps/mobile/src/api/device-paged-graph-api-v3.mjs',
      'apps/mobile/src/api/device-paged-read-retry-v3.mjs',
      'apps/mobile/src/api/device-paged-operation-runner-v3.mjs',
      'packages/mobile-protocol/src/device-paged-operation-runner-v3.mjs',
      'packages/mobile-protocol/src/device-paged-uniswap-v3.mjs',
      'packages/mobile-protocol/src/device-paged-payout-settlement-v3.mjs',
      'packages/mobile-protocol/src/device-paged-economic-view-v3.mjs',
      'apps/mobile/src/api/device-paged-uniswap-preparation-v3.ts',
      'apps/mobile/src/api/device-external-flat-reception-observer-v1.mjs',
      'apps/mobile/src/state/wallet-observation-window-v1.mjs',
      'apps/mobile/src/state/wallet-portfolio-v1.mjs',
      'packages/mobile-protocol/src/device-paged-wallet-portfolio-v3.mjs',
      'apps/mobile/src/state/wallet-connection-read-plan-v1.mjs',
      'apps/mobile/src/screens/WalletRecoveryScreen.tsx',
      'apps/mobile/src/custody/wallet-recovery-package-v1.mjs',
      'apps/mobile/src/custody/wallet-recovery-native-v1.ts',
      'apps/mobile/src/custody/wallet-session-v1.ts',
      'apps/mobile/src/custody/device-paged-custody-views-v3.mjs',
      'apps/mobile/src/state/public-connection-registry-v1.mjs',
      'apps/mobile/src/state/public-connection-store-v1.ts',
      'apps/mobile/src/api/device-paged-connection-transport-v3.ts',
      'packages/mobile-protocol/src/device-paged-owner-v3.mjs',
      'packages/mobile-protocol/src/device-paged-graph-v3.mjs');
    report.embeddedSourceJoins=required.map(path=>{
      const suffix=path.startsWith('apps/mobile/')?path.slice('apps/mobile/'.length)
        :path.startsWith('apps/wallet/')?path.slice('apps/'.length):path;
      const matches=sourceMap.sources.map((name,index)=>({name:name.replaceAll('\\','/'),index}))
        .filter(({name})=>name===path||name.endsWith('/'+path)||name===suffix||name.endsWith('/'+suffix));
      assert.equal(matches.length,1,'MOBILE_BUILD_ONE_ORIGINAL_SOURCE_IN_BUNDLE');
      const {name,index}=matches[0];assert.equal(typeof sourceMap.sourcesContent[index],'string','MOBILE_BUILD_SOURCE_CONTENT');
      const original=readFileSync(join(project,path)),content=Buffer.from(sourceMap.sourcesContent[index]);
      assert.equal(sha256(content),sha256(original),'MOBILE_BUILD_CURRENT_SOURCE_BUNDLE_JOIN');
      return {path,mapSource:name,bytes:content.length,sha256:sha256(content)};
    });
    report.embeddedJavaScript={asset:'assets/index.android.bundle',bytes:bundle.length,sha256:sha256(bundle),
      hermesBytecodeVersion:bundle.readUInt32LE(8),packagerSourceMapSHA256:sha256(mapBytes)};
    if(!verificationOnly){
      const configurationJoin=report.embeddedSourceJoins.find(row=>row.path===publicWalletConfigurationPath);
      assert.equal(configurationJoin.sha256,report.publicWalletConfiguration.sourceSHA256,
        'MOBILE_BUILD_PUBLIC_WALLET_CONFIGURATION_JOIN');
      report.publicWalletConfiguration.embeddedSourceVerified=true;
    }
    report.phase='verifying-development-signature';save();
    const signer=await run(join(sdk,'build-tools/36.0.0/apksigner'),['verify','--verbose','--print-certs',apk],mobile,true);
    assert.ok(signer.includes('Number of signers: 1') && signer.includes('Verified using v2 scheme (APK Signature Scheme v2): true')
      && /^Signer #1 certificate DN: CN=Android Debug,/m.test(signer),'MOBILE_BUILD_DEVELOPMENT_SIGNATURE');
    const certificateSHA256=/^Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})$/m.exec(signer)?.[1];
    assert.equal(certificateSHA256,'fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c',
      'MOBILE_BUILD_EXISTING_DEBUG_CERTIFICATE');
    report.signing={profile:'ANDROID_DEBUG_ONLY',certificateSHA256,verifiedV2:true};
    report.sourceInputsAfter=publicSourceInputs();
    assert.deepEqual(report.sourceInputsAfter,report.sourceInputsBefore,'MOBILE_BUILD_SOURCES_CHANGED');
    report.requiresMetro=false;
  }
  report.apk=apk.slice(project.length);
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
