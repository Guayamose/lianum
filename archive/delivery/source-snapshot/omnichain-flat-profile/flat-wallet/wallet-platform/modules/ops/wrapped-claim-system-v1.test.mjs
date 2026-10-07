import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadWrappedClaimDeploymentArtifactsV1, assertWrappedClaimDeploymentArtifactsV1,
  WRAPPED_CLAIM_VERIFIER_ORDER_V1, WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1 } from './wrapped-claim-deployment-artifacts-v1.mjs';
import { deployWrappedClaimGraphSystemV1, assertOwnedWrappedClaimGraphSystem, assertOwnedWrappedClaimSystem,
  wrappedClaimGraphOperatorResources, WRAPPED_CLAIM_SYSTEM_PROFILE_V1 } from './wrapped-claim-system-v1.mjs';
import { createWrappedClaimCustodyBootstrapV1, assertOwnedWrappedClaimBootstrap,
  ownedWrappedClaimBootstrapBindings, revokeWrappedClaimCustodyBootstrapV1 } from './wrapped-claim-custody-bootstrap-v1.mjs';
import { buildWrappedClaimDeploymentPlanV1, buildOwnedNativeClaimRules } from './wrapped-claim-deployment-plan-v1.mjs';
import { buildWrappedClaimGraphDeploymentPlanV1 } from './wrapped-claim-graph-plan-v1.mjs';
import { buildOwnedNativeClaimRules as oldRules } from './native-claim-deployment-plan.mjs';
import { createWrappedClaimGraphStateReaderV1, assertWrappedClaimGraphCurrentViewV1 } from '../paeg/wrapped-claim-system-state-v1.mjs';
import { createOwnedWrappedClaimObserverV1, assertOwnedWrappedClaimObserverV1,
  ownedWrappedClaimObserverBindingsV1 } from '../native-claims/wrapped-owned-state-v1.mjs';
import { reserveOriginalClaimCustodyV1 } from './shared-custody-allocation-v1.mjs';
import { WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1, WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1,
  WRAPPED_CLAIM_PROOF_RELEASE_V1 } from './wrapped-claim-release-v1.mjs';
const fake = Object.freeze({});
const originalArtifactError = /WRAPPED_CLAIM_ORIGINAL_DEPLOYMENT_ARTIFACTS_REQUIRED/;
test('real release gates stay null; exact fourteen widths retain I84 and distinct CI51/CO42', () => {
  for (const release of [WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1,WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1,WRAPPED_CLAIM_PROOF_RELEASE_V1]) assert.equal(release,null);
  assert.equal(WRAPPED_CLAIM_SYSTEM_PROFILE_V1,'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1');
  assert.deepEqual(WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1,[['authorization',16],['reservation',58],['dependency',42],['ready',50],['admission',84],['node',32],['settlement',138],['recovery',41],['deposit_balance',26],['withdraw_balance',39],['withdraw',39],['deposit_intent',27]]);
  assert.deepEqual(WRAPPED_CLAIM_VERIFIER_ORDER_V1.slice(-2),[['CI51',51],['CO42',42]]);
  assert.equal(WRAPPED_CLAIM_VERIFIER_ORDER_V1.length,14);
});
test('production artifact/custody/deploy gates fail before runtime or native access', async () => {
  let touched=0;const hostile=new Proxy({}, {get(){touched++;throw new Error('UNEXPECTED_RUNTIME_ACCESS');}});
  await assert.rejects(loadWrappedClaimDeploymentArtifactsV1(),{code:'WRAPPED_CLAIM_ACTIVATION_ARTIFACTS_ABSENT'});
  await assert.rejects(deployWrappedClaimGraphSystemV1({runtime:hostile,options:hostile}),{code:'WRAPPED_CLAIM_ACTIVATION_ARTIFACTS_ABSENT'});
  await assert.rejects(createWrappedClaimCustodyBootstrapV1({runtime:hostile,nativeRuntimes:hostile,journalRoot:'/unopened'}),{code:'WRAPPED_CLAIM_ACTIVATION_ARTIFACTS_ABSENT'});
  assert.equal(touched,0);
  await assert.rejects(loadWrappedClaimDeploymentArtifactsV1({verifiers:{}}),/NO_OPTIONS/);
});
test('lookalikes cannot confer artifact, system, custody, observer, current-view or private resources ownership', async () => {
  assert.throws(()=>assertWrappedClaimDeploymentArtifactsV1(fake),originalArtifactError);
  assert.throws(()=>assertOwnedWrappedClaimGraphSystem(fake,fake),/OWNED_DEPLOYMENT_REQUIRED/);
  assert.throws(()=>assertOwnedWrappedClaimSystem(fake,fake),/OWNED_DEPLOYMENT_REQUIRED/);
  assert.throws(()=>assertOwnedWrappedClaimBootstrap(fake,fake),/ORIGINAL_CUSTODY_BOOTSTRAP_REQUIRED/);
  assert.throws(()=>ownedWrappedClaimBootstrapBindings(fake),/ORIGINAL_CUSTODY_BOOTSTRAP_REQUIRED/);
  assert.throws(()=>revokeWrappedClaimCustodyBootstrapV1(fake,fake),/ORIGINAL_CUSTODY_BOOTSTRAP_REQUIRED/);
  assert.throws(()=>wrappedClaimGraphOperatorResources(fake,fake,fake),/OWNED_DEPLOYMENT_REQUIRED/);
  assert.throws(()=>assertOwnedWrappedClaimObserverV1(fake),/OWNED_OBSERVER_REQUIRED/);
  assert.throws(()=>ownedWrappedClaimObserverBindingsV1(fake),/OWNED_OBSERVER_REQUIRED/);
  assert.throws(()=>assertWrappedClaimGraphCurrentViewV1(fake,{runtime:fake,system:fake,poolIndex:0}));
  await assert.rejects(createWrappedClaimGraphStateReaderV1({runtime:fake,system:fake,poolIndex:0}),/OWNED_DEPLOYMENT_REQUIRED/);
  await assert.rejects(createOwnedWrappedClaimObserverV1({runtime:fake,claims:fake}),/OWNED_DEPLOYMENT_REQUIRED/);
  assert.throws(()=>reserveOriginalClaimCustodyV1([fake,fake],'/unopened'),/OWNED_RUNTIME_CAPABILITY/);
});
test('pure planners reject unowned bundle before even an injected non-authoritative hash can execute', async () => {
  let calls=0;const options={hashFields:()=>{calls++;throw new Error('UNEXPECTED_HASH');}};
  await assert.rejects(buildWrappedClaimDeploymentPlanV1({bundle:fake,sender:'',nextNonce:'',evmGenesis:'',libraries:{},verifiers:{},configuration:{},rules:[],nativeRoles:[],inventoryDomains:[]},options),originalArtifactError);
  await assert.rejects(buildWrappedClaimGraphDeploymentPlanV1({bundle:fake,chainId:'31337',sender:'',nextNonce:'',deploymentDomain:'',registryEpoch:'',rulesRoot:'',attesterKeys:[],adapterProfiles:[],pools:[],verifiers:{},libraries:{},claimAuthority:{}},options),originalArtifactError);
  assert.equal(calls,0);
});
test('custody rule derivation preserves exact original BTC/SOL identities', () => {
  const input={bitcoinGenesis:'11'.repeat(32),solanaGenesis:'22'.repeat(32)};
  assert.deepEqual(buildOwnedNativeClaimRules(input),oldRules(input));
  assert.deepEqual(buildOwnedNativeClaimRules(input).rules.map(rule=>rule.family),['1','2']);
});
test('graph-only constructor gate remains zero-authority; combined path separately requires nonzero authority', () => {
  const old=readFileSync(new URL('./native-value-deployment-plan-v2.mjs',import.meta.url),'utf8');
  const combined=readFileSync(new URL('./wrapped-claim-graph-plan-v1.mjs',import.meta.url),'utf8');
  assert.match(old,/const hasClaimAuthority = false/);assert.match(combined,/const hasClaimAuthority = true/);
  assert.match(combined,/assertCombinedAdapterRegistrationsV2/);assert.match(combined,/pin\(data\.claimAuthority\)/);
  const oldFactory=readFileSync(new URL('./deploy-native-claims.mjs',import.meta.url),'utf8');
  const newFactory=readFileSync(new URL('./wrapped-claim-custody-bootstrap-v1.mjs',import.meta.url),'utf8');
  assert.match(oldFactory,/reserveOriginalClaimCustodyV1\(nativeRuntimes, journalRoot\)/);
  assert.match(newFactory,/reserveOriginalClaimCustodyV1\(nativeRuntimes, journalRoot\)/);
});

test('separate combined hub is the sole target, with mandatory authority and preserved generic predicates', () => {
  // V4 joins the accepted graph-only dead-body optimization. The distinct
  // wrapped full body was derived from the sealed pre-trim source, never from
  // that unreachable-claim correction. Keep the full original equality check.
  const old=readFileSync(new URL('./fixtures/native-value-pretrim-v3.sol',import.meta.url),'utf8');
  const current=readFileSync(new URL('../../../contracts/native-value-v2/PrivateFlatReceiptHubNativeValueV2.sol',import.meta.url),'utf8');
  const combined=readFileSync(new URL('../../../contracts/wrapped-claim-v1/PrivateFlatReceiptHubWrappedClaimV1.sol',import.meta.url),'utf8');
  const digest=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(digest(old),'218b7919de549ef273ec49914a7eb9f10b6029857672b459359c70d861b8e4f1');
  assert.equal(digest(current),'be0f45b6bb611b02ddda4bc8a3ad4eb86b7d6e37ae431a208aa0e849705b6f85');
  assert.equal(digest(combined),'7b54bf8f9b41f1e3e20577a35f2642eb74c4e10b4f14ec8c8f20aa8c3a9fdf8e');
  assert.notEqual(current,old); assert.notEqual(current,combined);
  assert.match(current,/require\(configuration\.claimAuthority == address\(0\) && configuration\.claimAuthorityCodeHash == bytes32\(0\), "NATIVE_VALUE_V2_GRAPH_ONLY"\)/);
  assert.match(old,/require\(configuration\.claimAuthority == address\(0\) && configuration\.claimAuthorityCodeHash == bytes32\(0\), "NATIVE_VALUE_V2_GRAPH_ONLY"\)/);
  assert.match(combined,/contract PrivateFlatReceiptHubWrappedClaimV1/);
  assert.match(combined,/if \(configuration\.claimAuthority == address\(0\)\s*\|\| configuration\.claimAuthorityCodeHash == bytes32\(0\)\) revert ClaimAuthorityRequired\(\)/);
  assert.match(combined,/FlatVerifierSet.requireCode\(claimAuthority, claimAuthorityCodeHash\)/);
  assert.match(combined,/FlatNativeValueRegistryV2/);
  assert.match(combined,/function acceptClaim\(/);
  const expected=old.replace('contract PrivateFlatReceiptHubNativeValueV2','contract PrivateFlatReceiptHubWrappedClaimV1')
    .replace('from "./FlatNativeValueRegistryV2.sol"','from "../native-value-v2/FlatNativeValueRegistryV2.sol"')
    .replace('/// @notice Native-value semantic V2 hub. Deploy only with the reviewed new I key.',
      '/// @notice Distinct wrapped-custody hub retaining the generic I84 graph profile.\n/// Requires genuine wrapped CI51/CO42 custody and a nonzero code-pinned authority.\n/// No compilation, size acceptance, deployment or proof acceptance is implied.')
    .replace('/// @dev The optional claim authority is a fixed, code-pinned state machine.','/// @dev The mandatory claim authority is a fixed, code-pinned state machine.')
    .replace('        require(configuration.claimAuthority == address(0) && configuration.claimAuthorityCodeHash == bytes32(0), "NATIVE_VALUE_V2_GRAPH_ONLY");',
      '        if (configuration.claimAuthority == address(0)\n            || configuration.claimAuthorityCodeHash == bytes32(0)) revert ClaimAuthorityRequired();');
  assert.equal(combined,expected,'All other hub predicates and statements remain source-identical');
});
