/** Real original OWNER subprocess and authenticated Vault, with the genuine
 * pinned artifact reader. No mocked IPC/prover, SNARK, RPC or financial send. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,generateKeyPairSync} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {createOriginalDevicePagedGraphClientV3,reopenOriginalDevicePagedGraphClientV3} from '../../../src/execution/local/device-paged-graph-client-v3.mjs';
const hash=text=>createHash('sha256').update('Original agent IPC '+text).digest('hex');
test('actual original OWNER agent-observation IPC rechecks its encrypted checkpoint without writing or reviving a grant',{timeout:30000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-agent-original-ipc-'));let client,reopened;
 try{
  const selection=JSON.parse(await readFile(new URL('../../../../../scripts/development/active-paged-generation.json',import.meta.url),'utf8')),key=generateKeyPairSync('ec',{namedCurve:'secp256k1'}).publicKey.export({format:'jwk'}),devicePublicKey='04'+Buffer.from(key.x,'base64url').toString('hex')+Buffer.from(key.y,'base64url').toString('hex');
  const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,securityGeneration:selection.securityGeneration,minimumDepositAtomic:'1',origin:'https://127.0.0.1:9443',pairingId:'original-agent-readonly-ipc',devicePublicKey,deadlineMs:Math.floor(P.devicePagedNowV3()+3600000),chainId:'31337',manifestSHA256:selection.manifestSHA256,consumerSHA256:selection.consumerSHA256,...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(field=>[field,hash(field)])),...Object.fromEntries(['pool','state','native','math'].map((field,index)=>[field,'0x'+String(index+1).repeat(40)]))});
  const retention={path:join(directory,'private-owner.vault'),password:hash('password')};client=await createOriginalDevicePagedGraphClientV3(descriptor,retention);const checkpoint=client.checkpoint(),before=await readFile(retention.path),view=await client.agentObservation();assert.deepEqual(view.checkpoint,checkpoint);assert.deepEqual(view.public,checkpoint.public);assert.equal(view.public.phase,'BUILDING');assert.equal(view.automation,null);assert.equal(view.execution,null);assert.deepEqual(await readFile(retention.path),before);assert.deepEqual(client.checkpoint(),checkpoint);
  await client.close();client=null;reopened=await reopenOriginalDevicePagedGraphClientV3(descriptor,retention,checkpoint);const restored=await reopened.agentObservation();assert.deepEqual(restored,view);assert.deepEqual(await readFile(retention.path),before);await assert.rejects(reopened.nativeDispatchReady('caller-unapproved'),/PAGED_GRAPH_PROOF_OBSERVATION_REQUIRED/);assert.equal(restored.automation,null,'readonly observation never creates START');
 }finally{await client?.close();await reopened?.close();await rm(directory,{recursive:true,force:true});}
});
