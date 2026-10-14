/** Authenticate actual fresh compiler artifacts; no chain or proof is started. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import {join} from 'node:path';
import {projectRoot} from '@lianum/environment';
let altered=null;
mock.module('node:fs',{exports:{...Object.fromEntries(Object.entries(fs).filter(([k])=>k!=='default')),readFileSync(path,...args){const value=fs.readFileSync(path,...args);if(String(path)!==altered)return value;const bytes=Buffer.from(value);bytes[bytes.length-1]^=1;return bytes;}}});
const {inspectFundedPagedGraphArtifactsForPreparationV4:inspect,PAEG_PAGED_ARTIFACT_DIRECTORY_V3:directory}=await import('../../src/toolchain/paged-artifacts-v3.mjs');
test('active exact-payout artifacts have fresh programs and reject VK, consumer and compiler-input changes',()=>{
 const receipt=inspect();assert.equal(receipt.securityGeneration,'EXACT_PAYOUT_SET_V4');assert.equal(receipt.artifactGenerationKind,'FRESH_EXACT_PAYOUTS_V4');assert.equal(receipt.originalManifestSHA256,null);assert.equal(receipt.artifactSourceRebind,null);
 assert.deepEqual(Object.keys(receipt.roles),['reserve','fold','terminal','admission','withdraw']);assert.ok(receipt.hostSources.every(row=>row.path===row.source));assert.equal(receipt.financialAcceptance,false);
 const historical=JSON.parse(fs.readFileSync(join(projectRoot,'experiments/engine/private-core-proof/funded-graph-paged-v3/.local/poseidon-sparse-v3-consumer-fix-v1/manifest.json')));
 for(const role of ['reserve','fold','terminal']){assert.notEqual(receipt.roles[role].programSHA256,historical.roles[role].programSHA256);assert.notEqual(receipt.roles[role].keySHA256,historical.roles[role].keySHA256);}
 const consumer=JSON.parse(fs.readFileSync(join(directory,'consumer.json'))),pool=consumer.consumer.contracts['contracts/wallet/PrivatePagedFundedGraphPoolV4.sol'].PrivatePagedFundedGraphPoolV4;
 assert.ok(pool.abi.some(row=>row.type==='function'&&row.name==='minimumDepositAmount'));assert.ok(pool.evm.deployedBytecode.object.length/2<=24576);
 try{for(const [path,code]of [[join(directory,'manifest.json'),'PAEG_PAGED_MANIFEST_PIN'],[join(directory,'prepared/fold.vk'),'PAEG_PAGED_ARTIFACT_PIN'],[join(directory,'consumer.json'),'PAEG_PAGED_ACTIVE_CONSUMER_PIN'],[join(projectRoot,receipt.compilerInputs.find(row=>row.path.endsWith('circuits/fold/src/main.nr')).path),'PAEG_PAGED_RETAINED_COMPILER_PIN']]){altered=path;assert.throws(()=>inspect(),new RegExp(code));}}finally{altered=null;}
 assert.equal(inspect().manifestSHA256,receipt.manifestSHA256);
});
