import assert from 'node:assert/strict';
import {join,resolve,sep} from 'node:path';
import {realpathSync} from 'node:fs';
import {homedir} from 'node:os';
import {ROOT,FLAT} from '../../../../packages/proofs/src/catalog.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
export const SPL_COMPILATION_RESULT_V1='LIANUM_NEW_NATIVE_SPL_COMPILATION_ONLY_RESULT_V1';
export const SPL_COMPILATION_LIMITS_V1=Object.freeze({deadlineMilliseconds:600000,maximumCompilerRSSBytes:3*1024**3});
export function classifyNativeSplCompilerProcessV1(argv,executable){
 const project=resolve(FLAT,'../../..'),tools=join(project,'.internal/dev/toolchains/platform-tools-v1.48'),target=join(project,'.internal/dev/toolchains/native-spl-custody-v2/target');
 const command=join(project,'.internal/runtime/omnichain-product/.local/linux-runtimes/agave-v2.3.13/solana-release/bin/cargo-build-sbf');
 if(executable===command)return {role:'spl-fixed-cargo-command',proofWorker:false};
 const fixedTools=['rust/bin/rustc','rust/bin/cargo','llvm/bin/clang-19','llvm/bin/llvm-ar','llvm/bin/llvm-objcopy','llvm/bin/llvm-readelf','rust/lib/rustlib/x86_64-unknown-linux-gnu/bin/rust-lld'].map(path=>join(tools,'distribution',path));
 if(fixedTools.includes(executable)||executable===realpathSync(join(homedir(),'.cargo/bin/rustup')))return {role:'spl-rust-toolchain',proofWorker:false};
 if([realpathSync('/usr/bin/cc'),realpathSync('/usr/bin/ld'),'/usr/libexec/gcc/x86_64-linux-gnu/13/collect2'].includes(executable))return {role:'spl-rust-toolchain',proofWorker:false};
 if(executable.startsWith(target+sep)&&/\/build\/[^/]+\/build-script-(?:build|main)(?:-[0-9a-f]+)?$/.test(executable))return {role:'spl-crate-build-script',proofWorker:false};
 const scripts=['strip.sh','install.sh'].map(name=>join(tools,'sbf-sdk/scripts',name));
 if(executable==='/usr/bin/bash'&&scripts.includes(argv[1])||executable==='/usr/bin/env'&&argv[1]==='bash'&&scripts.includes(argv[2]))return {role:'spl-sdk-script',proofWorker:false};
 if(executable==='/usr/bin/uname'&&argv.length===2&&['-s','-m'].includes(argv[1]))return {role:'spl-sdk-script',proofWorker:false};
 if(executable==='/usr/bin/dirname'&&argv.length===2&&scripts.some(script=>argv[1]===script||argv[1].startsWith(tools+sep)))return {role:'spl-sdk-script',proofWorker:false};
 if(executable==='/usr/bin/mkdir'&&argv.length===3&&argv[1]==='-p'&&resolve(argv[2])===join(tools,'sbf-sdk/dependencies'))return {role:'spl-sdk-script',proofWorker:false};
 // Retain the executable identity in this fixed compiler-only receipt. No
 // command arguments, environment, financial job or key material is recorded.
 return {role:'spl-unexpected-child',proofWorker:false,compilerExecutable:executable};
}
export function nativeSplCompilationProcessFailureV1(rows){
 for(const row of rows){if(row.proofWorker===true||!['main-worker','spl-fixed-cargo-command','spl-rust-toolchain','spl-crate-build-script','spl-sdk-script'].includes(row.role))return 'SPL_COMPILATION_UNEXPECTED_CHILD';
  if(!Number.isSafeInteger(row.rssBytes)||row.rssBytes<0||row.rssBytes>SPL_COMPILATION_LIMITS_V1.maximumCompilerRSSBytes)return 'SPL_COMPILATION_CHILD_RSS_LIMIT';}
 return null;
}
export function assertNativeSplElfV1(raw){
 assert.ok(Buffer.isBuffer(raw)&&raw.length>64&&raw.length<=10*1024**2,'SPL_COMPILATION_ELF_SIZE');
 assert.equal(raw.subarray(0,4).toString('hex'),'7f454c46');assert.equal(raw[4],2);assert.equal(raw[5],1);assert.equal(raw[6],1);
 assert.equal(raw.readUInt16LE(16),3,'SPL_COMPILATION_ELF_DYN');assert.equal(raw.readUInt16LE(18),247,'SPL_COMPILATION_ELF_BPF');return true;
}
export function assertNativeSplCompilationResultV1(result){
 assert.equal(result.format,SPL_COMPILATION_RESULT_V1);assert.equal(result.phase,'completed');assert.equal(result.success,true);assert.equal(result.sourceUnchanged,true);
 assert.equal(result.compilationCount,1);assert.equal(result.compilerExitCode,0);assert.equal(result.compilerSignal,null);
 assert.deepEqual(result.proofs,[]);assert.deepEqual(result.cleanup,{compilerClosed:true,generatedDeployKeyRemoved:true,errors:[]});
 for(const key of ['privateCreditEstablished','nativeNodesStarted','sourceRegistrationEstablished','compiledReleaseEstablished'])assert.equal(result[key],false);
 assert.match(result.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const dir=join(ROOT,'.local/native-spl-compilation-only-v1','attempt-'+result.runId);
 for(const name of ['lianum_native_spl_custody_v1.so','receipt.json','source-pins.json','generated-key-cleanup-receipt.json']){const raw=regular(join(dir,name));assert.equal(result.files[name]?.bytes,raw.length);assert.equal(result.files[name]?.sha256,hash(raw));}
 const elf=regular(join(dir,'lianum_native_spl_custody_v1.so'));assertNativeSplElfV1(elf);
 assert.deepEqual(JSON.parse(regular(join(dir,'source-pins.json'))),result.sourcePins);
 const receipt=JSON.parse(regular(join(dir,'receipt.json')));
 assert.equal(receipt.format,'LIANUM_NEW_NATIVE_SPL_SBF_COMPILATION_RECEIPT_V1');assert.equal(receipt.runId,result.runId);
 assert.equal(receipt.sourcePinsSHA256,result.files['source-pins.json'].sha256);assert.equal(receipt.programSHA256,result.files['lianum_native_spl_custody_v1.so'].sha256);
 assert.equal(receipt.compilerExitCode,0);assert.equal(receipt.compilerSignal,null);assert.equal(receipt.generatedDeployKeyRemoved,true);assert.equal(receipt.sourceUnchanged,true);
 const keyCleanup=JSON.parse(regular(join(dir,'generated-key-cleanup-receipt.json')));assert.deepEqual(receipt.generatedDeployKeyCleanup,keyCleanup);
 assert.equal(keyCleanup.format,'LIANUM_NEW_SPL_GENERATED_DEPLOY_KEY_CLEANUP_V1');assert.equal(keyCleanup.runId,result.runId);assert.equal(keyCleanup.compilerPID,receipt.compilerPID);
 assert.ok(Number.isSafeInteger(keyCleanup.compilerPID)&&keyCleanup.compilerPID>1);for(const key of ['compilerClosed','compilerGroupClosed','removed'])assert.equal(keyCleanup[key],true);
 assert.equal(keyCleanup.method,'FIXED_PRIVATE_REGULAR_FILE_AFTER_ORIGINAL_CHILD_AND_GROUP_CLOSE');assert.ok(keyCleanup.keySHA256===null||/^[0-9a-f]{64}$/.test(keyCleanup.keySHA256));
 assert.deepEqual(receipt.arguments,['--manifest-path',join(resolve(FLAT,'../../..'),'.internal/dev/toolchains/native-spl-custody-v2/source/Cargo.toml'),'--sbf-sdk',join(resolve(FLAT,'../../..'),'.internal/dev/toolchains/platform-tools-v1.48/sbf-sdk'),'--sbf-out-dir',join(resolve(FLAT,'../../..'),'.internal/dev/toolchains/native-spl-custody-v2/out'),'--skip-tools-install','--tools-version','v1.48','--jobs','1','--offline','--','--locked']);
 return {newNativeSplProgramCompiled:true,privateCreditEstablished:false,nativeNodesStarted:false,sourceRegistrationEstablished:false,compiledReleaseEstablished:false};
}
