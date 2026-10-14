import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {resourceRoot} from '@lianum/environment';
import {join} from 'node:path';
import { createHash } from 'node:crypto';
import { loadWrappedClaimDeploymentArtifactsV1, assertWrappedClaimDeploymentArtifactsV1,
  WRAPPED_CLAIM_VERIFIER_ORDER_V1, WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1 } from '../../../../src/operations/deployments/wrapped/wrapped-claim-deployment-artifacts-v1.mjs';
import { deployWrappedClaimGraphSystemV1, assertOwnedWrappedClaimGraphSystem, assertOwnedWrappedClaimSystem,
  wrappedClaimGraphOperatorResources, WRAPPED_CLAIM_SYSTEM_PROFILE_V1 } from '../../../../src/operations/deployments/wrapped/wrapped-claim-system-v1.mjs';
import { createWrappedClaimCustodyBootstrapV1, assertOwnedWrappedClaimBootstrap,
  ownedWrappedClaimBootstrapBindings, revokeWrappedClaimCustodyBootstrapV1 } from '../../../../src/operations/operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs';
import { buildWrappedClaimDeploymentPlanV1, buildOwnedNativeClaimRules } from '../../../../src/operations/deployments/wrapped/wrapped-claim-deployment-plan-v1.mjs';
import { buildWrappedClaimGraphDeploymentPlanV1 } from '../../../../src/operations/deployments/wrapped/wrapped-claim-graph-plan-v1.mjs';
import { buildOwnedNativeClaimRules as oldRules } from '../../../../src/operations/deployments/claims/native-claim-deployment-plan.mjs';
import { createWrappedClaimGraphStateReaderV1, assertWrappedClaimGraphCurrentViewV1 } from '../../../../src/execution/wrapped/reconciliation/wrapped-claim-system-state-v1.mjs';
import { createOwnedWrappedClaimObserverV1, assertOwnedWrappedClaimObserverV1,
  ownedWrappedClaimObserverBindingsV1 } from '../../../../src/claims/wrapped/operations/wrapped-owned-state-v1.mjs';
import { reserveOriginalClaimCustodyV1 } from '../../../../src/operations/operators/claims/shared-custody-allocation-v1.mjs';
import { WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1, WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1,
  WRAPPED_CLAIM_PROOF_RELEASE_V1 } from '../../../../src/operations/releases/wrapped/wrapped-claim-release-v1.mjs';
const canonical=value=>value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const fake = Object.freeze({});
const originalArtifactError = /WRAPPED_CLAIM_ORIGINAL_DEPLOYMENT_ARTIFACTS_REQUIRED/;
test('original reviewed releases remain distinct from artifact and custody authority; fourteen exact widths retain I84 and CI51/CO42', () => {
  assert.equal(WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1.schema,'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_RELEASE_V1');
  assert.equal(WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1.schema,WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1.schema);
  assert.equal(WRAPPED_CLAIM_PROOF_RELEASE_V1.schema,'LIANUM_WRAPPED_CLAIM_PROOF_RELEASE_V3_RETAINED_PREPARATION');
  assert.equal(WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1.sourceClosureSHA256,WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1.sourceClosureSHA256);
  assert.equal(WRAPPED_CLAIM_PROOF_RELEASE_V1.profile,WRAPPED_CLAIM_SYSTEM_PROFILE_V1);
  assert.equal(WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1.deploymentReleaseSHA256,createHash('sha256').update(canonical(WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1)).digest('hex'));
  assert.equal(WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1.proofReleaseSHA256,createHash('sha256').update(JSON.stringify(WRAPPED_CLAIM_PROOF_RELEASE_V1)).digest('hex'));
  assert.equal(WRAPPED_CLAIM_SYSTEM_PROFILE_V1,'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1');
  assert.deepEqual(WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1,[['authorization',16],['reservation',58],['dependency',42],['ready',50],['admission',84],['node',32],['settlement',138],['recovery',41],['deposit_balance',26],['withdraw_balance',39],['withdraw',39],['deposit_intent',27]]);
  assert.deepEqual(WRAPPED_CLAIM_VERIFIER_ORDER_V1.slice(-2),[['CI51',51],['CO42',42]]);
  assert.equal(WRAPPED_CLAIM_VERIFIER_ORDER_V1.length,14);
});
test('historical wrapped publication remains closed at exact original source/artifact gate before runtime or native access', async () => {
  // PagedV4 is the active generation. The immutable WrappedV1 publication can
  // reject its rewritten host mirrors before reaching its absent CI51/CO42
  // activation artifacts; neither rejection may confer runtime authority.
  const originalClosedGate=error=>error?.code==='WRAPPED_CLAIM_ACTIVATION_ARTIFACTS_ABSENT'||error?.code==='ERR_ASSERTION'&&/\bNATIVE_VALUE_ARTIFACT_RAW_PIN\b/.test(error.message);
  let touched=0;const hostile=new Proxy({}, {get(){touched++;throw new Error('UNEXPECTED_RUNTIME_ACCESS');}});
  await assert.rejects(loadWrappedClaimDeploymentArtifactsV1(),originalClosedGate);
  await assert.rejects(deployWrappedClaimGraphSystemV1({runtime:hostile,options:hostile}),originalClosedGate);
  await assert.rejects(createWrappedClaimCustodyBootstrapV1({runtime:hostile,nativeRuntimes:hostile,journalRoot:'/unopened'}),originalClosedGate);
  assert.equal(touched,0);
  await assert.rejects(loadWrappedClaimDeploymentArtifactsV1({verifiers:{}}),/NO_OPTIONS/);
});
test('lookalikes cannot confer artifact, system, custody, observer, current-view or private resources ownership', async () => {
  for(const release of [WRAPPED_CLAIM_OPERATIONAL_RELEASE_V1,WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1,WRAPPED_CLAIM_PROOF_RELEASE_V1])assert.throws(()=>assertWrappedClaimDeploymentArtifactsV1(release),originalArtifactError);
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
  const old=readFileSync(new URL('../../../../src/operations/deployments/native-value/native-value-deployment-plan-v2.mjs',import.meta.url),'utf8');
  const combined=readFileSync(new URL('../../../../src/operations/deployments/wrapped/wrapped-claim-graph-plan-v1.mjs',import.meta.url),'utf8');
  assert.match(old,/const hasClaimAuthority = false/);assert.match(combined,/const hasClaimAuthority = true/);
  assert.match(combined,/assertCombinedAdapterRegistrationsV2/);assert.match(combined,/pin\(data\.claimAuthority\)/);
  const oldFactory=readFileSync(new URL('../../../../src/operations/deployments/claims/deploy-native-claims.mjs',import.meta.url),'utf8');
  const newFactory=readFileSync(new URL('../../../../src/operations/operators/wrapped/wrapped-claim-custody-bootstrap-v1.mjs',import.meta.url),'utf8');
  assert.match(oldFactory,/\(spl\?reserveOriginalSplClaimCustodyV1:reserveOriginalClaimCustodyV1\)\(nativeRuntimes, journalRoot\)/);
  assert.match(newFactory,/reserveOriginalClaimCustodyV1\(nativeRuntimes, journalRoot\)/);
});

test('separate combined hub is the sole target, with mandatory authority and preserved generic predicates', () => {
  // V4 joins the accepted graph-only dead-body optimization. The distinct
  // wrapped full body was derived from the sealed pre-trim source, never from
  // that unreachable-claim correction. Keep the full original equality check.
  const old=readFileSync(join(resourceRoot('wallet'),'wallet-platform/modules/ops/fixtures/native-value-pretrim-v3.sol'),'utf8');
  const current=readFileSync(join(resourceRoot('wallet'),'contracts/native-value-v2/PrivateFlatReceiptHubNativeValueV2.sol'),'utf8');
  const combined=readFileSync(join(resourceRoot('wallet'),'contracts/wrapped-claim-v1/PrivateFlatReceiptHubWrappedClaimV1.sol'),'utf8');
  const digest=value=>createHash('sha256').update(value).digest('hex');
  assert.equal(digest(old),'218b7919de549ef273ec49914a7eb9f10b6029857672b459359c70d861b8e4f1');
  assert.equal(digest(current),'be0f45b6bb611b02ddda4bc8a3ad4eb86b7d6e37ae431a208aa0e849705b6f85');
  assert.equal(digest(combined),'22b6ea520c3db6d24026850af5b38de8909d40f19aad1b948406ac9c26ecab50');
  const source=WRAPPED_CLAIM_DEPLOYMENT_RELEASE_V1.sourceFiles.find(row=>row.path==='contracts/wrapped-claim-v1/PrivateFlatReceiptHubWrappedClaimV1.sol');assert.equal(digest(combined),source.sha256);
  assert.notEqual(current,old); assert.notEqual(current,combined);
  assert.match(current,/require\(configuration\.claimAuthority == address\(0\) && configuration\.claimAuthorityCodeHash == bytes32\(0\), "NATIVE_VALUE_V2_GRAPH_ONLY"\)/);
  assert.match(old,/require\(configuration\.claimAuthority == address\(0\) && configuration\.claimAuthorityCodeHash == bytes32\(0\), "NATIVE_VALUE_V2_GRAPH_ONLY"\)/);
  assert.match(combined,/contract PrivateFlatReceiptHubWrappedClaimV1/);
  assert.match(combined,/if \(configuration\.claimAuthority == address\(0\)\s*\|\| configuration\.claimAuthorityCodeHash == bytes32\(0\)\) revert ClaimAuthorityRequired\(\)/);
  assert.match(combined,/FlatVerifierSet.requireCode\(claimAuthority, claimAuthorityCodeHash\)/);
  assert.match(combined,/FlatNativeValueRegistryV2/);
  assert.match(combined,/function acceptClaim\(/);
  let expected=old.replace('contract PrivateFlatReceiptHubNativeValueV2','contract PrivateFlatReceiptHubWrappedClaimV1')
    .replace('from "./FlatNativeValueRegistryV2.sol"','from "../native-value-v2/FlatNativeValueRegistryV2.sol"')
    .replace('/// @notice Native-value semantic V2 hub. Deploy only with the reviewed new I key.',
      '/// @notice Distinct wrapped-custody hub retaining the generic I84 graph profile.\n/// Requires genuine wrapped CI51/CO42 custody and a nonzero code-pinned authority.\n/// No compilation, size acceptance, deployment or proof acceptance is implied.')
    .replace('/// @dev The optional claim authority is a fixed, code-pinned state machine.','/// @dev The mandatory claim authority is a fixed, code-pinned state machine.')
    .replace('        require(configuration.claimAuthority == address(0) && configuration.claimAuthorityCodeHash == bytes32(0), "NATIVE_VALUE_V2_GRAPH_ONLY");',
      '        if (configuration.claimAuthority == address(0)\n            || configuration.claimAuthorityCodeHash == bytes32(0)) revert ClaimAuthorityRequired();');
  expected=expected.replace(`        if (claimAuthority == address(0)) {
            if (claimAuthorityCodeHash != bytes32(0)) revert ConfigCodeHash();
        } else {
            FlatVerifierSet.requireCode(claimAuthority, claimAuthorityCodeHash);
            if (IFlatNativeClaimAuthority(claimAuthority).hub() != address(this)) revert ConfigDomain();
        }`,`        FlatVerifierSet.requireCode(claimAuthority, claimAuthorityCodeHash);
        if (IFlatNativeClaimAuthority(claimAuthority).hub() != address(this)) revert ConfigDomain();`)
    .replace(`        if (claimAuthority != address(0)) {
            _requireClaimAuthority();
            if (IFlatNativeClaimAuthority(claimAuthority).reservationOwner(candidate.nullifier) != address(0))
                revert ClaimNullifierReserved();
            if (uint256(current.receiptCount)
                + IFlatNativeClaimAuthority(claimAuthority).reservedReceiptCapacity(pool) >= CAPACITY)
                revert ReceiptTreeFull();
        }`,`        _requireClaimAuthority();
        if (IFlatNativeClaimAuthority(claimAuthority).reservationOwner(candidate.nullifier) != address(0))
            revert ClaimNullifierReserved();
        if (uint256(current.receiptCount)
            + IFlatNativeClaimAuthority(claimAuthority).reservedReceiptCapacity(pool) >= CAPACITY)
            revert ReceiptTreeFull();`)
    .replace('        if (claimAuthority == address(0)) revert ClaimAuthorityRequired();\n','')
    .replace(`        reservedTagCapacityByPool[pool] -= uint32(CONSUMPTION_WIDTH);
        totalReservedTagCapacity -= uint32(CONSUMPTION_WIDTH);`,`        unchecked {
            reservedTagCapacityByPool[pool] -= uint32(CONSUMPTION_WIDTH);
            totalReservedTagCapacity -= uint32(CONSUMPTION_WIDTH);
        }`)
    .replace('        uint256 index = CAPACITY + current.receiptCount++;','        uint256 index;\n        unchecked { index = CAPACITY + current.receiptCount++; }');
  assert.equal(combined,expected,'All other hub predicates and statements remain source-identical');
});
