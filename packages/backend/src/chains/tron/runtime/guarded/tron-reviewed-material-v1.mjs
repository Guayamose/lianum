/** Fixed raw-receipt and original binary authentication. Whole reviewed receipts
 * are pinned, so their compiler metadata predicates need not be duplicated here.
 * Current product source is separate from the accepted historical candidate. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, lstat, realpath, readlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { projectRoot } from '@lianum/engine/chains/shared/runtime-harness';
import { ROOT } from '@lianum/proofs/catalog';
import { TRON_UPSTREAM, OWNED_TRON_RUNTIME_RELEASE } from './tron-upstream-release-v1.mjs';
const RUNTIME=join(projectRoot,'.local/owned-tron-native-value-v1'),DESTINATION=join(RUNTIME,'reviewed-aligned-rocksdb-v2');
const FIXTURE=join(ROOT,'integration/chains/tron/fixtures');
const SOURCE='d2f53f3def9995e159587a8c5227a0f8149bf46c0dd673801975f0a9037dffa0';
const ORIGINAL='02fdfaa75cbf4a8a4785a8db0e166286c4212047e5a0568a84d5e7fd5f28694f';
const RELEASE=Object.freeze({format:'REVIEWED_LOCAL_TRON_ALIGNED_ROCKSDB_CANDIDATE_V1',sourceSHA256:SOURCE,
 buildReportSHA256:'3914c0bc2d07852049bc3747475287d720173ca92702c4f7c81037daf8d7a7ee',
 classSHA256:'65313f923fac150adfcda7f2f66e3e5e17cf093b8fb26be81844c49bc9aaf029',
 innerClassSHA256:'963a36503e3be315c095413fd2c4301d79e36016575fd1872d43a0fe0a977921'});
const NAMES=['OwnedTronNativeDriver$OwnedShutdown.class','OwnedTronNativeDriver.class'];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function regular(path) { assert.equal(await realpath(path),path,'TRON_PRODUCT_MATERIAL_NO_SYMLINK');const stat=await lstat(path);
 assert.ok(stat.isFile()&&!stat.isSymbolicLink(),'TRON_PRODUCT_MATERIAL_FILE');return readFile(path); }
async function pin(path,expected) {const bytes=await regular(path);assert.equal(sha(bytes),expected,'TRON_PRODUCT_ORIGINAL_MATERIAL_PIN');return bytes;}
async function files(directory,prefix='') {const found=[];for(const name of await readdir(directory)) {
 const path=join(directory,name),stat=await lstat(path),rel=prefix+name;
 if(stat.isDirectory()&&!stat.isSymbolicLink())found.push(...await files(path,rel+'/'));
 else {assert.ok(stat.isFile()||stat.isSymbolicLink());found.push(rel);}}
 return found;
}
export async function inspectOwnedTronAlignedCandidateMaterialV1() {
 assert.equal(arguments.length,0,'TRON_PRODUCT_MATERIAL_NO_OPTIONS');assert.equal(OWNED_TRON_RUNTIME_RELEASE,null);
 const candidate=JSON.parse(await pin(join(FIXTURE,'candidate-artifacts-v3.json'),'48aecfcb7ba0f8bdc53029a1ce9c496d15c6aab9ae8b7290ced13131b3fb7975'));
 const jdk=JSON.parse(await pin(join(FIXTURE,'jdk-acquisition.json'),'0e2404b5ab76d082f5e29f6cb6f584c21230090b290c0d43da832f4f7239b115'));
 assert.equal(candidate.officialUpstreamCommit,TRON_UPSTREAM.commit);assert.equal(candidate.jdkArchiveSHA256,jdk.archiveSHA256);
 assert.equal(candidate.runtimeRelease,null);assert.equal(await realpath(RUNTIME),RUNTIME);
 assert.equal(jdk.inventory.length,407);const expected=new Set();
 for(const row of jdk.inventory) {
  assert.ok(row.path.startsWith('jdk8u504-b01/')&&!row.path.split('/').includes('..'));
  const name=row.path.slice('jdk8u504-b01/'.length),path=join(RUNTIME,'jdk8',name);assert.ok(!expected.has(name));expected.add(name);
  const stat=await lstat(path);
  if(row.kind==='symlink') {assert.ok(stat.isSymbolicLink());assert.equal(await readlink(path),row.target);assert.ok((await realpath(path)).startsWith(join(RUNTIME,'jdk8')+'/'));}
  else {assert.equal(row.kind,'file');const bytes=await pin(path,row.sha256);assert.equal(bytes.length,row.bytes);
   assert.equal(stat.mode&0o7777,Number.parseInt(row.mode.slice(2),8),'TRON_PRODUCT_JDK_MODE');}
 }
 assert.deepEqual((await files(join(RUNTIME,'jdk8'))).sort(),[...expected].sort(),'TRON_PRODUCT_COMPLETE_JDK_CLOSURE');
 assert.equal(candidate.compiledClasses.length,7);
 assert.deepEqual((await readdir(join(RUNTIME,'driver'))).sort(),candidate.compiledClasses.map(r=>r.path.split('/').at(-1)).sort());
 for(const row of candidate.compiledClasses) {const bytes=await pin(join(RUNTIME,'driver',row.path.split('/').at(-1)),row.sha256);
  assert.equal(bytes.length,row.bytes);assert.equal(bytes.readUInt16BE(6),row.classMajor);assert.equal(row.classMajor,52);}
 for(const [name,hash] of [['jdk8/bin/java',candidate.actualArtifacts.javaSHA256],['FullNode-offline.jar',candidate.actualArtifacts.jarSHA256]])await pin(join(RUNTIME,name),hash);
 await pin(join(ROOT,'runtime-drivers/owned-tron-native-value/OwnedTronNativeDriver.java'),ORIGINAL);
 const aligned=join(FIXTURE,'aligned-rocksdb-v1');await pin(join(aligned,'source/OwnedTronNativeDriver.java'),SOURCE);
 const literal=(await regular(join(ROOT,'integration/chains/tron/tron-aligned-rocksdb-profile.mjs'))).toString('utf8');
 const matches=[...literal.matchAll(/^export const TRON_ALIGNED_ROCKSDB_CANDIDATE_RELEASE = (\{[^\r\n]*\});$/gm)];
 assert.equal(matches.length,1,'TRON_PRODUCT_FIXED_CANDIDATE_LITERAL');assert.deepEqual(JSON.parse(matches[0][1]),RELEASE);
 assert.equal(await realpath(DESTINATION),DESTINATION);const info=await lstat(DESTINATION);
 assert.ok(info.isDirectory()&&info.uid===process.getuid()&&(info.mode&0o7777)===0o700);
 const buildBytes=await pin(join(DESTINATION,'build-report.json'),RELEASE.buildReportSHA256),build=JSON.parse(buildBytes);
 // Raw pin binds the original accepted compiler lifecycle, limits, source delta,
 // exact outputs and closure. Recheck all material it actually executed now.
 assert.equal(build.schema,'LIANUM_TRON_ALIGNED_ROCKSDB_BUILD_V1');assert.equal(build.success,true);
 assert.equal(build.inputs.sourceSHA256,SOURCE);assert.equal(build.inputs.originalSourceSHA256,ORIGINAL);
 for(const [name,key] of [['build.py','builderSHA256'],['launch.py','launcherSHA256'],['compile-child.py','compilerChildSHA256']])
  await pin(join(aligned,name),build.inputs[key]);
 await pin(join(resolve(ROOT,'../../../..'),'scripts/development/ledger_owned_processes.py'),build.inputs.ownedProcessHelperSHA256);
 assert.deepEqual((await readdir(join(DESTINATION,'classes'))).sort(),NAMES);
 assert.deepEqual(build.outputs.map(r=>r.path).sort(),NAMES);
 for(const row of build.outputs) {const hash=row.path===NAMES[1]?RELEASE.classSHA256:RELEASE.innerClassSHA256;
  assert.equal(row.sha256,hash);const bytes=await pin(join(DESTINATION,'classes',row.path),hash);
  assert.equal(bytes.length,row.bytes);assert.equal(bytes.readUInt16BE(6),52);}
 const args=join(RUNTIME,'reviewed-offline-agree-zero-v1');
 await pin(join(args,'classes/org/tron/core/config/args/Args.class'),'ce82095ff403f837ee02b243ab05e5ad3886b1124f2bbb3e1bf0e8165b310a70');
 await pin(join(FIXTURE,'offline-agree-zero/source/org/tron/core/config/args/Args.java'),'7896412e8aa21a80331f66606f25414a589c5127e355a0289d422c72405e280d');
 await pin(join(FIXTURE,'tron-candidate-seccomp.py'),'36241a6e2480a8bcdfb24c7d83499fbb09c8ca8516a912f26ae4d5cd43a8e7bb');
 return Object.freeze({classification:'REVIEWED_ORIGINAL_TRON_MATERIAL_NOT_PRODUCT_WALLET_ACCEPTANCE',
  jdkEntries:407,originalClasses:7,namespace:'reviewed-aligned-rocksdb-v2',upstreamCommit:candidate.officialUpstreamCommit,
  javaSHA256:candidate.actualArtifacts.javaSHA256,jarSHA256:candidate.actualArtifacts.jarSHA256,
  driverSHA256:RELEASE.classSHA256,originalDriverSHA256:candidate.actualArtifacts.driverSHA256,innerClassSHA256:RELEASE.innerClassSHA256,
  sourceSHA256:SOURCE,buildReportSHA256:RELEASE.buildReportSHA256,launcherSHA256:build.inputs.launcherSHA256,
  offlinePatchSHA256:candidate.actualArtifacts.offlinePatchSHA256,replayRecorderPatchSHA256:candidate.actualArtifacts.replayRecorderPatchSHA256,
  storageEngine:'ROCKSDB',genesisTimestampMs:'1749999999000',publicNetwork:false,graphAdmissionEstablished:false,privateCreditEstablished:false});
}
export async function inspectOwnedTronReviewedMaterialV1() {
 assert.equal(arguments.length,0,'TRON_PRODUCT_MATERIAL_NO_OPTIONS');const material=await inspectOwnedTronAlignedCandidateMaterialV1();
 const hash='33b74126209c827e794d44c74ea38d527ce1cba6b3acc634b34bcf7f0cf9608e';
 const accepted=JSON.parse(await pin(join(RUNTIME,'aligned-rocksdb-candidate-acceptance/attempt-HzxPCl/report.json'),hash));
 assert.equal(accepted.schema,'LIANUM_TRON_BINARY_CANDIDATE_ACCEPTANCE_V1');assert.equal(accepted.success,true);
 assert.equal(accepted.canonicalRuntimeRelease,null);assert.equal(accepted.publicNetwork,false);
 assert.equal(accepted.privateCreditEstablished,false);assert.equal(accepted.registeredGraphAuthorizationEstablished,false);
 assert.equal(accepted.inventory.newCandidate.buildReportSHA256,material.buildReportSHA256);
 const argsBytes=await pin(join(RUNTIME,'reviewed-offline-agree-zero-v1/build-report.json'),accepted.inventory.reviewedArgsBuildReportSHA256);
 assert.equal(JSON.parse(argsBytes).classSHA256,'ce82095ff403f837ee02b243ab05e5ad3886b1124f2bbb3e1bf0e8165b310a70');
 return Object.freeze({...material,acceptedCandidateReportSHA256:hash});
}
