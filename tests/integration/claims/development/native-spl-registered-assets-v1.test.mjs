/** Pure registry/asset-domain checks. No owned-runtime brand or credit. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {buildOwnedNativeClaimRules,buildNativeSplClaimRulesV1} from '../../../../packages/backend/src/operations/deployments/claims/native-claim-deployment-plan.mjs';
import {nativeAdmissionRulesTree,nativeAdmissionChainDomain} from '../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import {nativeSplAssetCommitmentV1,deriveNativeSplConfigurationV1} from '../../../../packages/backend/src/chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
import {base58Encode} from '../../../../packages/backend/src/chains/solana/runtime/solana-base58.mjs';
const bitcoinGenesis='1'.repeat(64),solanaGenesis='2'.repeat(64),address=n=>base58Encode(Buffer.alloc(32,n));
const identity=deriveNativeSplConfigurationV1({payer:address(3),instance:'4'.repeat(64)}),asset=nativeSplAssetCommitmentV1({genesis:solanaGenesis,config:identity.config.address,vault:identity.vault.address});
test('two claim gateways share the same SOL genesis but all three original BTC/SPL/SOL rules are registered and distinct',()=>{
 const baseline=buildOwnedNativeClaimRules({bitcoinGenesis,solanaGenesis}),actual=buildNativeSplClaimRulesV1({bitcoinGenesis,solanaGenesis,splAsset:asset});
 assert.equal(actual.rules.length,2);assert.equal(actual.registeredRules.length,3);assert.deepEqual(actual.registeredRules,[baseline.rules[0],actual.rules[1],baseline.rules[1]]);assert.deepEqual(actual.graphSolanaRule,baseline.rules[1]);assert.equal(actual.rules[1].family,'2');assert.equal(actual.rules[1].genesis,solanaGenesis);assert.notEqual(actual.rules[1].asset,baseline.rules[1].asset);assert.equal(new Set(actual.registeredRules.map(nativeAdmissionChainDomain)).size,3);
 const originalTree=nativeAdmissionRulesTree(actual.registeredRules);assert.equal(actual.root,originalTree.root);assert.deepEqual(actual.paths,originalTree.paths);assert.deepEqual(actual.paths.map(p=>p.index),['0','1','2']);assert.notEqual(actual.root,nativeAdmissionRulesTree(actual.rules).root);
 assert.throws(()=>buildNativeSplClaimRulesV1({bitcoinGenesis,solanaGenesis,splAsset:baseline.rules[1].asset}),/CLAIM_SPL_DISTINCT_REGISTERED_ASSET/);
});
test('fixed USDC mint/program domain binds actual genesis, config and vault; relabelled SOL and caller mint cannot replace it',()=>{
 const input={genesis:solanaGenesis,config:identity.config.address,vault:identity.vault.address};assert.equal(nativeSplAssetCommitmentV1(input),asset);
 for(const change of [{genesis:'5'.repeat(64)},{config:address(6)},{vault:address(7)}])assert.notEqual(nativeSplAssetCommitmentV1({...input,...change}),asset);
 assert.throws(()=>nativeSplAssetCommitmentV1({...input,mint:address(8)}));assert.throws(()=>nativeSplAssetCommitmentV1({...input,program:address(9)}));assert.throws(()=>nativeSplAssetCommitmentV1({...input,family:'2'}));
});
