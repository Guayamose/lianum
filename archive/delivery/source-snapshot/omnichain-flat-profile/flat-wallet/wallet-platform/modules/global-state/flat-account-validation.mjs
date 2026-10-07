/** Pure account boundary checks. These functions establish no chain authority.
 * Production observations come only from the private branded flat observer. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { immutable, sha } from '../../../../../omnichain-product/src/paeg/generic-account-journal.mjs';
import { validatePrivateAccountRegistry } from '../../../../../omnichain-product/src/private-account-state.mjs';
import { exactRecord } from '../paeg/commitments.mjs';
import { decodeStatement } from '../paeg/statements.mjs';
import { flatOwnerIdentity, validateFlatOwnerTransition } from '../../../mobile-core/flat-owner-custody.mjs';

export const flatAccountCalldataHash = calldata => {
  assert.ok(typeof calldata === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(calldata), 'FLAT_ACCOUNT_CALLDATA');
  return createHash('sha256').update(Buffer.from(calldata.slice(2), 'hex')).digest('hex');
};

/** Native entries retain their original backing-pool pin. ERC20 entries bind
 * the independently pinned token; the pool/domain remain part of assetId. */
export function flatAccountAsset({ identity, chainId, genesis, poolCodeHash, assetMetadata = null }) {
  identity = flatOwnerIdentity(identity);
  const native = identity.assetBinding === undefined;
  if (assetMetadata !== null) {
    assert.equal(assetMetadata.kind, native ? 'NATIVE' : 'ERC20', 'FLAT_ACCOUNT_ASSET_KIND');
    assert.equal(assetMetadata.address, '0x' + (native ? '0'.repeat(40) : identity.assetBinding.token),
      'FLAT_ACCOUNT_ASSET_TOKEN');
    if (!native) assert.equal(assetMetadata.codeHash, '0x' + identity.assetBinding.codeHash,
      'FLAT_ACCOUNT_ASSET_CODE');
  }
  assert.ok(native || assetMetadata !== null, 'FLAT_ACCOUNT_TOKEN_METADATA_REQUIRED');
  const asset = { assetId: sha({ genesis, pool: identity.pool, poolCodeHash,
    domainCommitment: identity.domainCommitment, domain: identity.domain }),
  // The legacy account registry uses uppercase display tickers. The separate
  // authenticated token metadata retains its exact onchain spelling (cBTC,
  // cSOL); identity and authorization bind code/domain, never this display name.
  kind: native ? 'NATIVE' : 'ERC20', symbol: native ? 'ETH' : assetMetadata.symbol.toUpperCase(),
  decimals: native ? 18 : assetMetadata.decimals, chainId, genesis, pool: identity.pool,
  scope: identity.domain.scope, policy: identity.domain.policy,
  token: native ? '0'.repeat(40) : identity.assetBinding.token,
  codeHash: native ? poolCodeHash : identity.assetBinding.codeHash, assetIdentity: identity.domain.asset,
  custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER' };
  validatePrivateAccountRegistry([asset]);
  return immutable(asset);
}

/** Pure structural binding; actual scoped commitments and U acceptance are
 * independently checked by the owned native executor and original S verifier. */
export function flatAccountGraphBinding(input, identity) {
  const prepared = immutable(input);
  exactRecord(prepared, ['authorization', 'rolePackets']);
  exactRecord(prepared.authorization, ['proof', 'publicInputs']);
  assert.ok(typeof prepared.authorization.proof === 'string' && prepared.authorization.proof.length > 0
    && prepared.authorization.proof.length % 64 === 0 && /^[0-9a-f]+$/.exec(prepared.authorization.proof)?.[0] === prepared.authorization.proof,
  'FLAT_ACCOUNT_PUBLIC_U_REQUIRED');
  const authorization = decodeStatement('authorization', prepared.authorization.publicInputs);
  assert.equal(authorization.domainCommitment, identity.domainCommitment, 'FLAT_ACCOUNT_GRAPH_DOMAIN');
  const packets = prepared.rolePackets;
  exactRecord(packets, ['reservation', 'recovery', 'assembler', 'local', 'dependency']);
  assert.ok(Array.isArray(packets.local) && packets.local.length === 4
    && Array.isArray(packets.dependency) && packets.dependency.length === 4, 'FLAT_ACCOUNT_FOUR_SCOPED_SLOTS');
  for (const packet of [packets.reservation, packets.recovery, packets.assembler, ...packets.local, ...packets.dependency]) {
    assert.equal(packet.domainCommitment, identity.domainCommitment, 'FLAT_ACCOUNT_GRAPH_DOMAIN');
    assert.equal(packet.envelope, authorization.envelope, 'FLAT_ACCOUNT_GRAPH_ENVELOPE');
    assert.deepEqual(packet.domain, identity.domain, 'FLAT_ACCOUNT_GRAPH_DOMAIN');
    assert.deepEqual(packet.core, packets.reservation.core, 'FLAT_ACCOUNT_GRAPH_CORE');
  }
  const funding = packets.reservation.funding.value, recovery = packets.recovery.recovery.value,
    core = packets.reservation.core.value;
  assert.equal(funding.reserveCommitment, core.reserveCommitment, 'FLAT_ACCOUNT_GRAPH_RESERVE');
  for (const key of ['reserveCommitment', 'reserveNullifier', 'settleBefore'])
    assert.equal(recovery[key], core[key], 'FLAT_ACCOUNT_GRAPH_RECOVERY');
  return immutable({ ...authorization, inputCommitment: funding.inputCommitment, inputNullifier: funding.inputNullifier,
    reserveCommitment: core.reserveCommitment, reserveNullifier: core.reserveNullifier,
    changeCommitment: funding.changeCommitment, recoveryCommitment: recovery.recoveryCommitment,
    settleBefore: core.settleBefore, authorizationPublicInputsSHA256: sha(prepared.authorization.publicInputs) });
}

/** Replay the original complete owner transition, not a current-leaf test.
 * No root keys or note openings are needed to check the public historical delta. */
export function validateFlatAccountOwnerObservation({ identity, artifact, submission, authorization, observation }) {
  assert.ok(submission && submission.calldataSHA256 === flatAccountCalldataHash(submission.calldata),
    'FLAT_ACCOUNT_ORIGINAL_CALLDATA');
  const confirmation = validateFlatOwnerTransition(observation, {
    kind: submission.kind, epoch: submission.epoch, before: submission.before,
    statement: submission.statement, publicInputs: submission.publicInputs,
    submission: { calldata: submission.calldata, calldataSHA256: submission.calldataSHA256,
      transactionHash: submission.transactionHash },
  }, { identity, authorization: authorization ? { envelope: { publicStatement: authorization } } : null }, artifact);
  assert.equal(confirmation.calldataSHA256, flatAccountCalldataHash(observation.transaction.calldata),
    'FLAT_ACCOUNT_ORIGINAL_CALLDATA');
  if (submission.observation !== null) assert.deepEqual(observation, submission.observation,
    'FLAT_ACCOUNT_ORIGINAL_OBSERVATION_CHANGED');
  return immutable(confirmation);
}


/** Pure framing only. The authority supplies the original retained terms and
 * current owned-chain timestamp; callers cannot use this function as a grant. */
export function validateFlatManualGraphAdmissionTime(terms, timestamp) {
  const uint = value => {
    assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.exec(value)?.[0] === value
      && BigInt(value) < 1n << 64n, 'FLAT_ACCOUNT_MANUAL_GRAPH_TIME');
    return BigInt(value);
  };
  const now = uint(timestamp), start = uint(terms.fundingNotBefore), fundingEnd = uint(terms.fundingValidUntil),
    executionEnd = uint(terms.executionUntil), cutoff = uint(terms.settleBefore);
  assert.ok(start < fundingEnd && fundingEnd <= executionEnd && executionEnd <= cutoff,
    'FLAT_ACCOUNT_MANUAL_GRAPH_WINDOW');
  assert.ok(now >= start && now < fundingEnd && now < executionEnd && now < cutoff,
    'FLAT_ACCOUNT_MANUAL_GRAPH_PREPARATION_EXPIRED');
}
