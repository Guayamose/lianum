import test from 'node:test';
import assert from 'node:assert/strict';
import * as aave from '../../../src/operations/deployments/defi/official-aave-fixture-v1.mjs';
import * as protocols from '../../../src/operations/deployments/defi/official-protocol-fixture-v3.mjs';
import * as oldAave from '../../fixtures/operations/deployments/system/official-aave-fixture-v1.mjs';
import * as oldProtocols from '../../fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import * as system from '../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import * as oldWallet from '../../../../../tests/integration/wallet/wrapped/flows/wrapped-wallet-acceptance-v1.mjs';
import * as inspector from '@lianum/components/verification/wrapped-installation';
import * as oldInspector from '../../../../../tests/integration/deployments/wrapped/wrapped-installation-source-inspector-v2.mjs';
import * as tron from '../../../src/chains/tron/runtime/guarded/tron-first-error-private-profile-v3.mjs';
import * as oldTron from '../../../../../tests/integration/chains/tron/tron-first-error-private-profile-v3.mjs';
import * as pools from '../../../src/chains/evm/runtime/pool-generation-acceptance-policy.mjs';
import * as oldPools from '../../../../../tests/integration/pools/pool-generation-acceptance-policy.mjs';

test('old deployment entries share the current fixture authority owners',()=>{
 assert.equal(oldAave.createOfficialAaveFixtureV1,aave.createOfficialAaveFixtureV1);
 assert.equal(oldAave.assertOfficialAaveFixtureV1,aave.assertOfficialAaveFixtureV1);
 assert.equal(oldProtocols.createOfficialProtocolFixture,protocols.createOfficialProtocolFixture);
 assert.equal(oldProtocols.assertOfficialProtocolFixture,protocols.assertOfficialProtocolFixture);
 assert.throws(()=>aave.assertOfficialAaveFixtureV1({},{}));
 assert.throws(()=>protocols.assertOfficialProtocolFixture({},{}));
});

test('system recovery retains a single issuer and rejects fabricated tokens',()=>{
 for(const name of ['createWrappedWalletAcceptanceSystemV1','consumeWrappedSystemRecoveryPartV1','retainWrappedWalletSystemForReopenV1','reopenWrappedWalletAcceptanceSystemV1'])
  assert.equal(oldWallet[name],system[name]);
 assert.throws(()=>system.consumeWrappedSystemRecoveryPartV1(Object.freeze(Object.create(null)),'custody'),/WRAPPED_RECOVERY_SYSTEM_PART_TOKEN/);
 assert.deepEqual(Object.keys(system).sort(),['consumeWrappedSystemRecoveryPartV1','createWrappedWalletAcceptanceSystemV1','reopenWrappedWalletAcceptanceSystemV1','retainWrappedWalletSystemForReopenV1'].sort());
});

test('source drift inspection and deployment release policies have one operational owner',()=>{
 assert.equal(oldInspector.inspectWrappedInstallationSourcesV2,inspector.inspectWrappedInstallationSourcesV2);
 assert.equal(oldInspector.wrappedSourceWorkDiagnosticV2,inspector.wrappedSourceWorkDiagnosticV2);
 assert.equal(oldTron.TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3,tron.TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3);
 assert.equal(oldTron.assertTronFirstErrorPrivateProfileV3,tron.assertTronFirstErrorPrivateProfileV3);
 assert.equal(oldPools.POOL_GENERATION_LIMITS,pools.POOL_GENERATION_LIMITS);
 assert.equal(pools.POOL_GENERATION_PHASE1_RELEASE,null);
 assert.equal(pools.POOL_GENERATION_PHASE2_RELEASE,null);
});

test('wrapped runtime and terminal recovery preserve original opaque ownership',async()=>{
 const current=await import('../../../src/operations/local/wrapped-wallet-runtime-v1.mjs');
 const previous=await import('../../../../../tests/integration/fixtures/wallet/wrapped/flows/wrapped-wallet-fixed-fixture-v1.mjs');
 const wallet=await import('../../../src/operations/wallet/wrapped-wallet-composition-v1.mjs');
 assert.equal(previous.consumeWrappedFixtureRecoveryPartV1,current.consumeWrappedFixtureRecoveryPartV1);
 assert.equal(previous.createWrappedWalletFixedFixtureV1,current.createWrappedWalletFixedFixtureV1);
 assert.equal(oldWallet.consumeWrappedWalletRecoveryPartV1,wallet.consumeWrappedWalletRecoveryPartV1);
 assert.throws(()=>current.consumeWrappedFixtureRecoveryPartV1(Object.freeze(Object.create(null)),'terminal'),/WRAPPED_RECOVERY_FIXTURE_PART_TOKEN/);
 assert.throws(()=>wallet.consumeWrappedWalletRecoveryPartV1(Object.freeze(Object.create(null)),'recipient'),/WRAPPED_WALLET_ORIGINAL_RECOVERY_PART_REQUIRED/);
 assert.throws(()=>current.ownedWrappedWalletFixedFixtureV1({}),/WRAPPED_FIXED_ORIGINAL_FIXTURE_REQUIRED/);
});
