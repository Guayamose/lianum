/** Safe first-error derivative material only. Original v2 remains pinned and
 * independently authenticated; it supplies provenance, never acceptance of
 * these new classes. The fixed v4 compiler receipt must first be reviewed. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,readdir,lstat,realpath} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {projectRoot} from '../../../../../../engine/src/chains/shared/runtime-harness.mjs';
import {ROOT} from '../../../../../../proofs/src/catalog.mjs';
import {inspectOwnedTronReviewedMaterialV1} from './tron-reviewed-material-v1.mjs';
import {assertTronFirstErrorPrivateProfileV3,TRON_FIRST_ERROR_PRIVATE_SOURCE_SHA256_V3} from '../../../../../../../tests/integration/chains/tron/tron-first-error-private-profile-v3.mjs';
const RUNTIME=join(projectRoot,'.local/owned-tron-native-value-v1');
const DESTINATION=join(RUNTIME,'reviewed-first-error-private-v4');
const FIXTURE=join(ROOT,'integration/chains/tron/fixtures/first-error-private-v3');
const NAMES=Object.freeze(['OwnedTronNativeDriver$OwnedShutdown.class','OwnedTronNativeDriver.class']);
const ORIGINAL_HELPERS=Object.freeze({
 'build.py':'b64389d644d2285b26e4774b3fe83f8c1bcb641feb685d219e861ab0eb6f1549',
 'compile-child.py':'c1883c4a90cbd001fbb03f0189894aae33f13295c51961c5c3941ee37f797f65',
 'launch.py':'7ca35e56f6ce4960b5f4217f64226999faaa1a310ead767354490de73a6be66b'});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function pin(path,expected){
 assert.equal(await realpath(path),path,'TRON_FIRST_ERROR_MATERIAL_NO_ALIAS');const before=await lstat(path);
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&before.size<=2*1024*1024,'TRON_FIRST_ERROR_MATERIAL_REGULAR');
 const bytes=await readFile(path),after=await lstat(path);
 for(const name of ['dev','ino','uid','size','mode','nlink','mtimeMs','ctimeMs'])assert.equal(after[name],before[name],'TRON_FIRST_ERROR_MATERIAL_CHANGED');
 assert.equal(bytes.length,before.size);assert.equal(sha(bytes),expected,'TRON_FIRST_ERROR_MATERIAL_PIN');return bytes;
}
export async function inspectOwnedTronFirstErrorPrivateMaterialV3(){
 assert.equal(arguments.length,0,'TRON_FIRST_ERROR_MATERIAL_NO_OPTIONS');
 // Gate rejects before material acquisition or any ChildProcess creation.
 const release=assertTronFirstErrorPrivateProfileV3(),original=await inspectOwnedTronReviewedMaterialV1();
 assert.equal(await realpath(DESTINATION),DESTINATION,'TRON_FIRST_ERROR_BUILD_NAMESPACE_ALIAS');const info=await lstat(DESTINATION);
 assert.ok(info.isDirectory()&&!info.isSymbolicLink()&&info.uid===process.getuid()&&(info.mode&0o7777)===0o700,'TRON_FIRST_ERROR_BUILD_NAMESPACE');
 const raw=await pin(join(DESTINATION,'build-report.json'),release.buildReportSHA256),build=JSON.parse(raw);
 // The independently reviewed whole receipt binds the original compiler birth,
 // pidfd, deadline, RSS samples, streams, exit and cleanup. Recheck its inputs.
 assert.equal(build.schema,'LIANUM_TRON_FIRST_ERROR_PRIVATE_BUILD_V3');assert.equal(build.success,true);
 for(const key of ['canonicalRuntimeRelease','candidateRuntimeRelease'])assert.equal(build[key],null);
 for(const key of ['nativeNodesStarted','keysOrWitnessesCreated','historicalReportsRecreated'])assert.equal(build[key],false);
 assert.deepEqual(build.limits,{compilerHeapBytes:268435456,compilerRSSBytes:402653184,deadlineSeconds:60,logBytes:1048576});
 assert.deepEqual(build.cleanup,{ownedCompilerStopped:true,originalInputsUnmodified:true,interrupted:false});
 assert.equal(build.compiler.ownedChildStopped,true);assert.equal(build.compiler.exitCode,0);assert.equal(build.compiler.forced,false);
 assert.deepEqual(build.compiler.signalsSent,[]);assert.equal(build.compiler.logTruncated,false);
 assert.equal(build.inputs.sourceSHA256,TRON_FIRST_ERROR_PRIVATE_SOURCE_SHA256_V3);
 assert.equal(build.inputs.alignedSourceSHA256,original.sourceSHA256);assert.equal(build.inputs.originalSourceSHA256,'02fdfaa75cbf4a8a4785a8db0e166286c4212047e5a0568a84d5e7fd5f28694f');
 assert.equal(build.inputs.privateDiagnosticFormat,'LIANUM_TRON_FIRST_ERROR_PRIVATE_V3');assert.deepEqual(build.inputs.originalCompilerHelpers,ORIGINAL_HELPERS);
 await pin(join(FIXTURE,'source/OwnedTronNativeDriver.java'),TRON_FIRST_ERROR_PRIVATE_SOURCE_SHA256_V3);
 for(const [name,key] of [['build.py','builderSHA256'],['launch.py','launcherSHA256'],['compile-child.py','compilerChildSHA256']])await pin(join(FIXTURE,name),build.inputs[key]);
 assert.equal(build.inputs.compilerChildSHA256,ORIGINAL_HELPERS['compile-child.py']);
 await pin(join(resolve(ROOT,'../../../..'),'scripts/development/ledger_owned_processes.py'),build.inputs.ownedProcessHelperSHA256);
 for(const [name,hash] of Object.entries(ORIGINAL_HELPERS))await pin(join(ROOT,'integration/chains/tron/fixtures/aligned-rocksdb-v1',name),hash);
 assert.deepEqual((await readdir(join(DESTINATION,'classes'))).sort(),NAMES);assert.deepEqual(build.outputs.map(row=>row.path).sort(),NAMES);
 for(const row of build.outputs){const expected=row.path===NAMES[1]?release.classSHA256:release.innerClassSHA256;
  assert.equal(row.sha256,expected);const bytes=await pin(join(DESTINATION,'classes',row.path),expected);
  assert.equal(bytes.length,row.bytes);assert.equal(bytes.subarray(0,4).toString('hex'),'cafebabe');assert.equal(bytes.readUInt16BE(6),52);assert.equal(row.classMajor,52);}
 await pin(join(DESTINATION,'build-report.json'),release.buildReportSHA256);
 return Object.freeze({...original,classification:'REVIEWED_SAFE_FIRST_ERROR_TRON_DERIVATIVE_NOT_FINANCIAL_ACCEPTANCE',namespace:'reviewed-first-error-private-v4',
  sourceSHA256:release.sourceSHA256,buildReportSHA256:release.buildReportSHA256,driverSHA256:release.classSHA256,innerClassSHA256:release.innerClassSHA256,
  launcherSHA256:build.inputs.launcherSHA256,acceptedCandidateReportSHA256:null,originalCandidateReportSHA256:original.acceptedCandidateReportSHA256,
  originalAlignedSourceSHA256:original.sourceSHA256,privateFirstErrorFormat:'LIANUM_TRON_FIRST_ERROR_PRIVATE_V3',
  derivativeNativeAcceptanceEstablished:false,graphAdmissionEstablished:false,privateCreditEstablished:false});
}
