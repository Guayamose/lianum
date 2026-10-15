/** Fixed PC23 trust root. No request, environment value or IPC can replace it.
 * The loader's own bytes are externally snapshotted in actual-run provenance. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {projectRoot} from './chains/runtime-harness.mjs';
import {verifyPrivatePaymentFileIntegrity} from './private-payment-engine.mjs';
export const PRIVATE_WALLET_SOURCE_PROFILE=Object.freeze({file:"evidence/m23-private-wallet-source-profile.json",sha256:"b2b13ef124bf0ee1bf56e737f217b11c0221e7f886452d93ec86bcdf3c57012c",bytes:26144});
export async function checkPrivateWalletSourcePrerequisites(){
 const b=await readFile(join(projectRoot,PRIVATE_WALLET_SOURCE_PROFILE.file));assert.equal(b.length,PRIVATE_WALLET_SOURCE_PROFILE.bytes,'PC23_SOURCE_PROFILE_SIZE');assert.equal(createHash('sha256').update(b).digest('hex'),PRIVATE_WALLET_SOURCE_PROFILE.sha256,'PC23_SOURCE_PROFILE_PIN');const p=JSON.parse(b);assert.equal(p.schemaVersion,1);assert.equal(p.profile,'PC23_SHARED_LOCAL_V1');assert.equal(p.nativeWalletAcceptance,false);assert.ok(Object.keys(p.files).length>50&&Object.keys(p.files).length<512,'PC23_SOURCE_PROFILE_FILES');
 for(const[path,pin]of Object.entries(p.files)){assert.ok(!path.startsWith('/')&&!path.includes('\\')&&!path.split('/').some(x=>['','..','.'].includes(x)),'PC23_SOURCE_PROFILE_PATH');await verifyPrivatePaymentFileIntegrity(join(projectRoot,path),pin,'PC23_SOURCE_OR_ARTIFACT_PIN');}
 const cap=JSON.parse(await readFile(join(projectRoot,p.genuineCapability.file)));assert.equal(cap.phase,'completed','PC23_GENUINE_CAPABILITY_REQUIRED');assert.equal(cap.proofs.length,4);assert.ok(cap.proofs.every(x=>x.verifiedInShortLivedWorker&&x.workerExitedBeforeReturn));assert.ok(cap.checks.every(x=>x.passed));assert.equal(cap.runtimeCleanup.completed,true);return{ready:true,profileSHA256:PRIVATE_WALLET_SOURCE_PROFILE.sha256};
}
