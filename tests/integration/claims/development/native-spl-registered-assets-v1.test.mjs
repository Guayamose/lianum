/** Pure registry/asset-domain checks. No owned-runtime brand or credit. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync,existsSync} from 'node:fs';
import {Script,createContext} from 'node:vm';
import {join} from 'node:path';
import {ROOT} from '../../../../packages/proofs/src/catalog.mjs';
import {nativeRuleCommitment} from '../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';
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

// HOST metadata only: execute the original post-capability projection and root
// checks. No combined token, observer, key, signing or native account is minted.
test('combined SPL GRAPH paths retain all eight registry leaves without relabelling native SOL or waiving standalone completeness',()=>{
 const tree=buildNativeSplClaimRulesV1({bitcoinGenesis,solanaGenesis,splAsset:asset});
 const graphRules=[tree.rules[0],tree.graphSolanaRule],graphPaths=[tree.paths[0],tree.paths[2]];
 assert.equal(tree.commitments.length,8);assert.deepEqual(tree.commitments.slice(3),Array(5).fill('0'.repeat(64)));
 function source(relative,mapped){const url=new URL(relative,import.meta.url);return readFileSync(existsSync(url)?url:join(ROOT,mapped),'utf8');}
 const claim=source('../../../../packages/backend/src/claims/operations/operators.mjs','wallet-platform/modules/native-claims/operators.mjs');
 const start=claim.indexOf("equal(binding.rules, [bound.policies[0].rule, bound.graphSolanaRule], 'COMBINED_OPERATOR_SPL_NATIVE_GRAPH_RULES')");
 const end=claim.indexOf('return freeze(copy(bound.registeredRules));',start)+'return freeze(copy(bound.registeredRules));'.length;
 assert.ok(start>=0&&end>start);
 const equal=(a,b,message)=>assert.deepEqual(structuredClone(a),structuredClone(b),message);
 function project(rules){
  const context=createContext({binding:{rules},bound:{policies:[{rule:tree.rules[0]}],graphSolanaRule:tree.graphSolanaRule,registeredRules:tree.registeredRules},equal,copy:structuredClone,freeze:value=>Object.freeze(value)});
  return new Script('(function(){'+claim.slice(start,end)+'})()').runInContext(context);
 }
 assert.deepEqual(project(graphRules),tree.registeredRules);
 assert.throws(()=>project(tree.rules),/COMBINED_OPERATOR_SPL_NATIVE_GRAPH_RULES/);
 assert.throws(()=>project([graphRules[0],{...graphRules[1],asset}]),/COMBINED_OPERATOR_SPL_NATIVE_GRAPH_RULES/);
 const graph=source('../../../../packages/backend/src/operations/operators/claims/native-operators.mjs','wallet-platform/modules/ops/native-operators.mjs');
 const graphStart=graph.indexOf('const registeredRules = (custody ? assertCombinedGraphBinding');
 const graphEnd=graph.indexOf('equal(rulePaths, graphPaths);',graphStart)+'equal(rulePaths, graphPaths);'.length;
 assert.ok(graphStart>=0&&graphEnd>graphStart);
 function check({combined=true,registered=tree.registeredRules,paths=graphPaths,root=tree.root}={}){
  let calls=0;const context=createContext({custody:combined?Object.freeze({}):null,runtime:null,bitcoin:null,solana:null,rules:graphRules,rulePaths:paths,
   system:{registry:{rulesRoot:root}},assert,nativeRuleCommitment,nativeAdmissionRulesTree,equal,
   assertCombinedGraphBinding(token,binding){calls++;assert.equal(token,context.custody);equal(binding.rules,graphRules);return registered;}});
  new Script(graph.slice(graphStart,graphEnd)).runInContext(context);assert.equal(calls,combined?1:0);
 }
 check();
 // The old two-rule join and any missing/reordered registered asset still fail.
 assert.throws(()=>check({combined:false}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
 assert.throws(()=>check({registered:graphRules}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
 assert.throws(()=>check({registered:[tree.registeredRules[0],tree.registeredRules[2],tree.registeredRules[1]]}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
 assert.throws(()=>check({registered:tree.registeredRules.map((rule,index)=>index===1?{...rule,asset:'9'.repeat(64)}:rule)}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
 assert.throws(()=>check({paths:[tree.paths[0],tree.paths[1]]}));
 assert.throws(()=>check({root:nativeAdmissionRulesTree(graphRules).root}),/FLAT_OPERATOR_INCOMPLETE_REGISTERED_RULES/);
});
