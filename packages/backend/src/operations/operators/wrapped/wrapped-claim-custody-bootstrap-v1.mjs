/** Original combined custody capability. Full fourteen-role artifact validation
 * precedes randomness, journal access, native inventory and runtime calls. No
 * node/key factory, caller artifact/hash/transport or legacy custody brand. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { lstat, realpath, readdir } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { assertLocalEvm } from '../../../chains/evm/runtime/local-evm-ownership.mjs';
import { assertOwnedBitcoinRuntime, BITCOIN_CUSTODY_PROFILE } from '../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime, SOLANA_CUSTODY_PROFILE, SOLANA_NONCE_INGRESS_PROFILE } from '../../../chains/solana/runtime/owned-solana-runtime.mjs';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { nativeClaimEndpointCommitment } from '@lianum/engine/claims/framing';
import { auditClaimNativeInventory } from '../../../claims/operations/backing-audit.mjs';
import { NATIVE_CLAIM_REFUND_FEES, buildOwnedNativeClaimRules } from '../../deployments/wrapped/wrapped-claim-deployment-plan-v1.mjs';
import { loadWrappedClaimDeploymentArtifactsV1, assertWrappedClaimDeploymentArtifactsV1 } from '../../deployments/wrapped/wrapped-claim-deployment-artifacts-v1.mjs';
import { reserveOriginalClaimCustodyV1 } from '../claims/shared-custody-allocation-v1.mjs';
const bootstraps = new WeakMap(), revoked = new WeakSet();
const bare = value => value.slice(2);
function nativeIdentity(nativeRuntimes) {
  fixedArray(nativeRuntimes, 2);
  const [bitcoin, solana] = nativeRuntimes;
  assertOwnedBitcoinRuntime(bitcoin); assertOwnedSolanaRuntime(solana);
  assert.equal(bitcoin.metadata.profile, BITCOIN_CUSTODY_PROFILE, 'CLAIM_BOOTSTRAP_BITCOIN_CUSTODY');
  assert.equal(solana.metadata.classification, SOLANA_CUSTODY_PROFILE, 'CLAIM_BOOTSTRAP_SOLANA_CUSTODY');
  for (const native of nativeRuntimes) {
    assert.equal(typeof native.inventory, 'function', 'CLAIM_BOOTSTRAP_CUSTODY_INVENTORY');
    exactRecord(native.roles, ['depositor', 'escrow', 'recipient']);
    assert.equal(new Set(Object.values(native.roles).map(role => role.endpoint)).size, 3, 'CLAIM_BOOTSTRAP_DISTINCT_ROLES');
    assert.equal(native.transfers.length, 0, 'CLAIM_BOOTSTRAP_UNUSED_CUSTODY');
  }
  return buildOwnedNativeClaimRules({ bitcoinGenesis: bitcoin.genesis, solanaGenesis: bare(solana.genesisHex) });
}
async function nativePreflight(binding) {
  const tree = nativeIdentity(binding.nativeRuntimes);
  assert.deepEqual(tree.rules, binding.rules, 'CLAIM_BOOTSTRAP_NATIVE_IDENTITY_CHANGED');
  for (const [i, native] of binding.nativeRuntimes.entries()) {
    const rule = binding.rules[i], roles = binding.nativeRoles[i];
    assert.deepEqual(native.roles, roles, 'CLAIM_BOOTSTRAP_CUSTODY_ROLES_CHANGED');
    // nativeIdentity already authenticated both original runtime capabilities.
    // Select immutable construction pins, never the mutable inventory snapshot.
    let bootstrapPins = null;
    if (native.nonceIngressProfile !== undefined || native.nonceInfrastructureByAuthority !== undefined) {
      assert.equal(rule.family, '2', 'CLAIM_BOOTSTRAP_NONCE_SOL_ONLY');
      assert.equal(native.nonceIngressProfile, SOLANA_NONCE_INGRESS_PROFILE, 'CLAIM_BOOTSTRAP_NONCE_SOURCE_PROFILE');
      bootstrapPins = native.nonceInfrastructureByAuthority;
      exactRecord(bootstrapPins, ['depositor', 'escrow']);
      assert.ok(Object.isFrozen(native) && Object.isFrozen(bootstrapPins)
        && Object.values(bootstrapPins).every(Object.isFrozen), 'CLAIM_BOOTSTRAP_IMMUTABLE_NONCE_PINS');
      for (const role of ['depositor', 'escrow'])
        assert.equal(bootstrapPins[role].authorityPublicKey, roles[role].endpoint, 'CLAIM_BOOTSTRAP_NONCE_SOURCE_ROLE');
    }
    for (const route of ['deposit', 'refund', 'redeem']) {
      const adapter = native.adapter({ asset: rule.asset, route });
      assert.equal(adapter.binding.family, rule.family); assert.equal(adapter.binding.genesis, rule.genesis);
      assert.equal(adapter.binding.asset, rule.asset);
    }
    const inventory = await native.inventory();
    if (bootstrapPins !== null)
      assert.ok(Object.hasOwn(inventory, 'nonceInfrastructureByAuthority'), 'CLAIM_BOOTSTRAP_COMPLETE_DUAL_NONCE_INVENTORY');
    assert.deepEqual(inventory.syntheticPrefunding, native.syntheticPrefunding, 'CLAIM_BOOTSTRAP_SYNTHETIC_FUNDING');
    const audited = auditClaimNativeInventory(inventory, { nativeFamily: rule.family, nativeGenesis: rule.genesis,
      nativeAsset: rule.asset, escrowEndpointCommitment: nativeClaimEndpointCommitment({ family: rule.family,
        genesis: rule.genesis, asset: rule.asset, endpoint: roles.escrow.endpoint }) }, roles, bootstrapPins);
    assert.equal(inventory.feeAudit.transfers.length, 0, 'CLAIM_BOOTSTRAP_UNUSED_CUSTODY');
    assert.equal(audited.nativePrincipalAvailable, '0', 'CLAIM_BOOTSTRAP_EMPTY_NATIVE_PRINCIPAL');
    assert.ok(BigInt(audited.feeReserveAvailable) >= BigInt(NATIVE_CLAIM_REFUND_FEES[i]), 'CLAIM_BOOTSTRAP_FEE_RESERVE');
    if (rule.family === '2') for (const role of ['depositor', 'recipient']) {
      const account = inventory.accounts.find(value => value.role === role);
      assert.ok(account.exists && BigInt(account.total) >= BigInt(account.rentExemptMinimum), 'CLAIM_BOOTSTRAP_FUNDED_SOL_ROUTE');
    }
  }
}
export function assertOwnedWrappedClaimBootstrap(runtime, capability) {
  const entry = bootstraps.get(capability);
  assert.ok(entry && entry.runtime === runtime && !revoked.has(capability), 'WRAPPED_CLAIM_ORIGINAL_CUSTODY_BOOTSTRAP_REQUIRED');
  assertWrappedClaimDeploymentArtifactsV1(entry.bundle);
  assertOwnedBitcoinRuntime(entry.nativeRuntimes[0]); assertOwnedSolanaRuntime(entry.nativeRuntimes[1]);
}
export function revokeWrappedClaimCustodyBootstrapV1(runtime, capability) {
  const entry = bootstraps.get(capability);
  assert.ok(entry && entry.runtime === runtime, 'WRAPPED_CLAIM_ORIGINAL_CUSTODY_BOOTSTRAP_REQUIRED');
  revoked.add(capability);
}
export function ownedWrappedClaimBootstrapBindings(capability) {
  const entry = bootstraps.get(capability);
  assert.ok(entry, 'WRAPPED_CLAIM_ORIGINAL_CUSTODY_BOOTSTRAP_REQUIRED');
  assertOwnedWrappedClaimBootstrap(entry.runtime, capability); return entry;
}
export async function recheckOriginalWrappedClaimCustodyV1(capability) {
  const entry = ownedWrappedClaimBootstrapBindings(capability);
  await assertLocalEvm(entry.runtime); await nativePreflight(entry);
}
export async function createWrappedClaimCustodyBootstrapV1(input) {
  assert.equal(arguments.length, 1, 'WRAPPED_CLAIM_BOOTSTRAP_ARGUMENTS');
  exactRecord(input, ['runtime', 'nativeRuntimes', 'journalRoot']);
  const bundle = await loadWrappedClaimDeploymentArtifactsV1();
  assertWrappedClaimDeploymentArtifactsV1(bundle);
  const { runtime, journalRoot } = input; fixedArray(input.nativeRuntimes, 2);
  const nativeRuntimes = Object.freeze([...input.nativeRuntimes]), tree = nativeIdentity(nativeRuntimes);
  assert.equal(nativeRuntimes[1].nonceIngressProfile, SOLANA_NONCE_INGRESS_PROFILE,
    'WRAPPED_CLAIM_ORIGINAL_DUAL_NONCE_RUNTIME_REQUIRED');
  exactRecord(nativeRuntimes[1].nonceInfrastructureByAuthority, ['depositor', 'escrow']);
  assert.ok(typeof journalRoot === 'string' && isAbsolute(journalRoot) && resolve(journalRoot) === journalRoot,
    'WRAPPED_CLAIM_BOOTSTRAP_ABSOLUTE_JOURNAL');
  // A pending/failed attempt cannot race a legacy or another combined domain.
  reserveOriginalClaimCustodyV1(nativeRuntimes, journalRoot);
  await assertLocalEvm(runtime); assert.equal(runtime.metadata.chainId, '31337');
  const stat = await lstat(journalRoot);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(), 'WRAPPED_CLAIM_JOURNAL_DIRECTORY');
  assert.equal(await realpath(journalRoot), journalRoot, 'WRAPPED_CLAIM_JOURNAL_REALPATH');
  assert.deepEqual(await readdir(journalRoot), [], 'WRAPPED_CLAIM_FRESH_JOURNAL');
  const genesis = await runtime.block('0x0'); await runtime.assertCanonical(genesis);
  assert.equal(genesis.hash, runtime.metadata.evmGenesis, 'WRAPPED_CLAIM_EVM_GENESIS');
  assertWrappedClaimDeploymentArtifactsV1(bundle);
  const binding = Object.freeze({ runtime, nativeRuntimes,
    nativeRoles: frozenInput(nativeRuntimes.map(native => cloneInput(native.roles))), rules: tree.rules,
    inventoryDomains: Object.freeze([randomBytes(32).toString('hex'), randomBytes(32).toString('hex')]),
    journalRoot, evmGenesis: bare(genesis.hash), bundle,
    claimIngressProfile: 'native_claim_ingress_nonce_registry_v3' });
  await nativePreflight(binding);
  const capability = Object.freeze({ classification: 'OWNED_WRAPPED_CLAIM_CUSTODY_BOOTSTRAP_V1',
    claimIngressProfile: binding.claimIngressProfile, rules: binding.rules });
  assertWrappedClaimDeploymentArtifactsV1(bundle);bootstraps.set(capability, binding); return capability;
}

/** Private original capture. This is data, never a caller-mintable capability. */
export function captureWrappedClaimCustodyBootstrapRecoveryV1(runtime,capability) {
  assert.equal(arguments.length,2);assertOwnedWrappedClaimBootstrap(runtime,capability);
  const s=ownedWrappedClaimBootstrapBindings(capability);
  return structuredClone({schema:'WRAPPED_CUSTODY_BOOTSTRAP_RECOVERY_V1',nativeRoles:s.nativeRoles,rules:s.rules,
    inventoryDomains:s.inventoryDomains,journalRoot:s.journalRoot,evmGenesis:s.evmGenesis,
    claimIngressProfile:s.claimIngressProfile,provenance:s.bundle.provenance});
}
export async function reopenWrappedClaimCustodyBootstrapRecoveryV1(token) {
  assert.equal(arguments.length,1);
  const {consumeWrappedSystemRecoveryPartV1}=await import('../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs');
  const {runtime,nativeRuntimes,record:r}=consumeWrappedSystemRecoveryPartV1(token,'custody');
  exactRecord(r,['schema','nativeRoles','rules','inventoryDomains','journalRoot','evmGenesis','claimIngressProfile','provenance']);
  assert.equal(r.schema,'WRAPPED_CUSTODY_BOOTSTRAP_RECOVERY_V1');
  const bundle=await loadWrappedClaimDeploymentArtifactsV1();assertWrappedClaimDeploymentArtifactsV1(bundle);
  assert.deepEqual(bundle.provenance,r.provenance,'WRAPPED_RECOVERY_ARTIFACT_CHANGED');
  fixedArray(nativeRuntimes,2);assertOwnedBitcoinRuntime(nativeRuntimes[0]);assertOwnedSolanaRuntime(nativeRuntimes[1]);
  const tree=buildOwnedNativeClaimRules({bitcoinGenesis:nativeRuntimes[0].genesis,solanaGenesis:bare(nativeRuntimes[1].genesisHex)});
  assert.deepEqual(tree.rules,r.rules,'WRAPPED_RECOVERY_NATIVE_GENESIS_CHANGED');
  assert.deepEqual(nativeRuntimes.map(n=>n.roles),r.nativeRoles,'WRAPPED_RECOVERY_NATIVE_ROLES_CHANGED');
  assert.equal(nativeRuntimes[1].nonceIngressProfile,SOLANA_NONCE_INGRESS_PROFILE);
  exactRecord(nativeRuntimes[1].nonceInfrastructureByAuthority,['depositor','escrow']);
  assert.equal(r.claimIngressProfile,'native_claim_ingress_nonce_registry_v3');
  fixedArray(r.inventoryDomains,2);for(const d of r.inventoryDomains)assert.match(d,/^[0-9a-f]{64}$/);
  assert.notEqual(r.inventoryDomains[0],r.inventoryDomains[1]);
  assert.equal(resolve(r.journalRoot),r.journalRoot);assert.equal(await realpath(r.journalRoot),r.journalRoot);
  const stat=await lstat(r.journalRoot);assert.ok(stat.isDirectory()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0);
  reserveOriginalClaimCustodyV1(nativeRuntimes,r.journalRoot);
  await assertLocalEvm(runtime);assert.equal(runtime.metadata.chainId,'31337');
  const genesis=await runtime.block('0x0');await runtime.assertCanonical(genesis);
  assert.equal(genesis.hash,runtime.metadata.evmGenesis);assert.equal(bare(genesis.hash),r.evmGenesis);
  for(const [i,native] of nativeRuntimes.entries()) {
    const rule=r.rules[i],roles=r.nativeRoles[i],inventory=await native.inventory();
    auditClaimNativeInventory(inventory,{nativeFamily:rule.family,nativeGenesis:rule.genesis,nativeAsset:rule.asset,
      escrowEndpointCommitment:nativeClaimEndpointCommitment({family:rule.family,genesis:rule.genesis,asset:rule.asset,endpoint:roles.escrow.endpoint})},roles,
      i===1?native.nonceInfrastructureByAuthority:null);
    for(const route of ['deposit','refund','redeem']) {
      const adapter=native.adapter({asset:rule.asset,route});assert.equal(adapter.binding.genesis,rule.genesis);
      assert.equal(adapter.binding.family,rule.family);assert.equal(adapter.binding.asset,rule.asset);
    }
  }
  const binding=Object.freeze({runtime,nativeRuntimes:Object.freeze([...nativeRuntimes]),nativeRoles:frozenInput(r.nativeRoles),
    rules:frozenInput(r.rules),inventoryDomains:Object.freeze([...r.inventoryDomains]),journalRoot:r.journalRoot,
    evmGenesis:r.evmGenesis,bundle,claimIngressProfile:r.claimIngressProfile});
  const capability=Object.freeze({classification:'OWNED_WRAPPED_CLAIM_CUSTODY_BOOTSTRAP_V1',claimIngressProfile:r.claimIngressProfile,rules:binding.rules});
  bootstraps.set(capability,binding);assertOwnedWrappedClaimBootstrap(runtime,capability);return capability;
}
