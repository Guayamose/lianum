/** NEW fixed SBF build consumer. Neither this material review nor ELF loading
 * establishes an ingress, claim credit, original payout or wallet acceptance. */
import assert from 'node:assert/strict';
import {join,resolve} from 'node:path';
import {ROOT,FLAT} from '../../../../../proofs/src/catalog.mjs';
import {regular,hash} from '../../../../../proofs/src/tooling/tooling.mjs';
import {NATIVE_SPL_CUSTODY_V1,deriveNativeSplProgramDataV1} from '../../../chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
const freezeBuildPins=value=>{if(value&&typeof value==='object'){for(const child of Object.values(value))freezeBuildPins(child);Object.freeze(value);}return value;};
export const NATIVE_SPL_PRODUCED_PROGRAM_REVIEW_V1=freezeBuildPins({"localOnly":true,"privateCreditEstablished":false,"program":"5RnJjhp7NKPgawoXnPJiXJtjJ5ktkMUrRuBtP4YmLSUM","publicNetwork":false,"runId":"e4ecbedb-0f19-44d2-a353-07e394a3a5a6","files":{"lianum_native_spl_custody_v1.so":{"bytes":150576,"sha256":"a8521c684df423a85355808f9babc276670bcd7af5307eeff16a2bfa372361ce"},"receipt.json":{"bytes":1616,"sha256":"755c10ccab779b8e7feec045080b78b33c94b094c369809b34c77968b835e9ea"},"result.json":{"bytes":2896020,"sha256":"c3ae2451e9bef4a1d6b30c9d316729f30c94a4a514f6b6ec0d354605ff5811f9"},"resources.json":{"bytes":2941611,"sha256":"d7c85d878ea3d6733c78c9093f7030cf29cc1655f4702b5b3a2a3d343334c1c7"},"source-pins.json":{"bytes":2789437,"sha256":"8fc5592ec7456492ad32f6914849dac1d274e6d204cc27e518cb7f9588ce28ab"},"generated-key-cleanup-receipt.json":{"bytes":380,"sha256":"2fa9834f3f510cdde42c7317c39e40cd71f57d476e30ee1cbee6ebe732b6c851"}}});
const source=Object.freeze([['Cargo.toml','747b133654ceec001193e15eb144989ff326ede3e3371a8850358e51ee72bfa6'],['src/lib.rs','c68547203aba2f8fb013efe51a17aebb18b01cf0e2bd2a881672781c3db0ed2c'],['Cargo.lock','d2b0d2a4c29e53c192cd9f7e25ed56e7eaac24e849d380de96c8462d449fd85b']]);
export function loadOwnedNativeSplProducedProgramV1(){
 assert.equal(arguments.length,0,'SPL_PRODUCED_PROGRAM_NO_OPTIONS');const p=NATIVE_SPL_PRODUCED_PROGRAM_REVIEW_V1;
 assert.ok(p,'SPL_GENUINE_COMPILATION_MATERIAL_REVIEW_REQUIRED');
 assert.deepEqual(Object.keys(p).sort(),['localOnly','privateCreditEstablished','program','publicNetwork','runId','files'].sort());
 assert.equal(p.localOnly,true);assert.equal(p.publicNetwork,false);assert.equal(p.privateCreditEstablished,false);assert.equal(p.program,NATIVE_SPL_CUSTODY_V1.program);
 assert.match(p.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const directory=join(ROOT,'.local/native-spl-compilation-only-v1','attempt-'+p.runId),files=new Map();
 const names=['lianum_native_spl_custody_v1.so','receipt.json','result.json','resources.json','source-pins.json','generated-key-cleanup-receipt.json'];
 assert.deepEqual(Object.keys(p.files).sort(),[...names].sort());
 for(const name of names){const raw=regular(join(directory,name));assert.deepEqual(p.files[name],{bytes:raw.length,sha256:hash(raw)},'SPL_ORIGINAL_BUILD_FILE_PIN');files.set(name,raw);}
 const result=JSON.parse(files.get('result.json')),resources=JSON.parse(files.get('resources.json')),receipt=JSON.parse(files.get('receipt.json')),pins=JSON.parse(files.get('source-pins.json')),cleanup=JSON.parse(files.get('generated-key-cleanup-receipt.json'));
 assert.equal(result.format,'LIANUM_NEW_NATIVE_SPL_COMPILATION_ONLY_RESULT_V1');assert.equal(result.runId,p.runId);assert.equal(result.phase,'completed');assert.equal(result.success,true);assert.equal(result.sourceUnchanged,true);
 assert.deepEqual(result.proofs,[]);assert.equal(result.compilationCount,1);assert.equal(result.compilerExitCode,0);assert.equal(result.compilerSignal,null);assert.deepEqual(result.cleanup,{compilerClosed:true,generatedDeployKeyRemoved:true,errors:[]});
 for(const name of ['privateCreditEstablished','nativeNodesStarted','sourceRegistrationEstablished','compiledReleaseEstablished'])assert.equal(result[name],false);
 assert.equal(resources.runId,p.runId);assert.equal(resources.phase,'completed');assert.equal(resources.failure,null);assert.equal(resources.workerExit?.code,0);assert.equal(resources.workerClose?.code,0);assert.equal(resources.resultAccepted,true);assert.equal(resources.ownedGroupCleanupConfirmed,true);assert.equal(resources.sourceClosureUnchanged,true);assert.deepEqual(resources.groupSignals,[]);
 assert.equal(receipt.format,'LIANUM_NEW_NATIVE_SPL_SBF_COMPILATION_RECEIPT_V1');assert.equal(receipt.runId,p.runId);assert.equal(receipt.sourcePinsSHA256,p.files['source-pins.json'].sha256);assert.equal(receipt.programSHA256,p.files['lianum_native_spl_custody_v1.so'].sha256);assert.equal(receipt.compilerExitCode,0);assert.equal(receipt.compilerSignal,null);assert.equal(receipt.sourceUnchanged,true);
 assert.equal(resources.format,'LIANUM_NATIVE_SPL_COMPILATION_RESOURCES_V1');assert.equal(resources.workerExit?.signal,null);assert.equal(resources.workerClose?.signal,null);
 assert.equal(resources.workerResult?.sha256,p.files['result.json'].sha256);assert.equal(resources.workerResult?.bytes,p.files['result.json'].bytes);assert.equal(resources.workerResult?.runId,p.runId);assert.equal(resources.sourcePinsSHA256,p.files['source-pins.json'].sha256);assert.deepEqual(resources.sourcePins,pins);
 assert.equal(receipt.generatedDeployKeyRemoved,true);assert.deepEqual(result.sourcePins,pins);assert.deepEqual(receipt.generatedDeployKeyCleanup,cleanup);assert.equal(cleanup.runId,p.runId);assert.equal(cleanup.compilerPID,receipt.compilerPID);
 for(const name of ['compilerClosed','compilerGroupClosed','removed'])assert.equal(cleanup[name],true);
 for(const [name,pin]of source){const physical=join(resolve(FLAT,'../../..'),'contracts/wallet/solana/native-spl-custody-v1',name);assert.equal(hash(regular(physical)),pin,'SPL_REVIEWED_NEW_SOURCE_CHANGED');
  const label='../../dev/toolchains/native-spl-custody-v3/source/'+name;const matches=pins.local.filter(row=>row.path===label);assert.equal(matches.length,1,'SPL_ORIGINAL_BUILD_SOURCE_NOT_RECORDED');assert.equal(matches[0].sha256,pin);assert.equal(matches[0].bytes,regular(physical).length);}
 const elf=files.get('lianum_native_spl_custody_v1.so');assert.ok(elf.length>64&&elf.length<=10*1024**2);assert.equal(elf.subarray(0,4).toString('hex'),'7f454c46');assert.equal(elf[4],2);assert.equal(elf[5],1);assert.equal(elf.readUInt16LE(16),3);assert.equal(elf.readUInt16LE(18),263);
 return Object.freeze({elf:Buffer.from(elf),program:p.program,programData:deriveNativeSplProgramDataV1(),elfSHA256:hash(elf),originalBuildReceiptSHA256:p.files['receipt.json'].sha256,originalBuildResourcesSHA256:p.files['resources.json'].sha256,privateCreditEstablished:false});
}
