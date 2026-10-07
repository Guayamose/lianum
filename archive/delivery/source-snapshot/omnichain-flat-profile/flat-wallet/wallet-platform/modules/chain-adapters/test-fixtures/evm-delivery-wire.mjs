/** Offline public test vector only. Deterministic private scalar 1 and nonce 1
 * are intentionally insecure and are NEVER used by a runtime or account. */
import { createHash } from 'node:crypto';
import { publicKeccak256 } from '../../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { encodeEvmVaultDeliveryCall } from '../evm-vault-delivery.mjs';

const sha = input => createHash('sha256').update(input).digest('hex');
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const integer = value => { let text = BigInt(value).toString(16); if (text === '0') return Buffer.alloc(0);
  if (text.length % 2) text = '0' + text; return Buffer.from(text, 'hex'); };
function rlp(value) {
  const prefix = (size, offset) => size < 56 ? Buffer.from([size + offset])
    : Buffer.concat([Buffer.from([offset + 55 + integer(size).length]), integer(size)]);
  if (Array.isArray(value)) { const raw = Buffer.concat(value.map(rlp)); return Buffer.concat([prefix(raw.length, 192), raw]); }
  return value.length === 1 && value[0] < 128 ? value : Buffer.concat([prefix(value.length, 128), value]);
}
export const TEST_EVM_SOLVER = '7e5f4552091a69125d5dfcb7b8c2659029395bdf';
export function signedDeliveryWire(intent, patch = {}) {
  const tx = { chainId: '31337', nonce: '0', gasPrice: '1000000000', gas: '1000000',
    to: intent.descriptor.identity.router, value: '0', data: encodeEvmVaultDeliveryCall(intent), ...patch };
  const base = [integer(tx.nonce), integer(tx.gasPrice), integer(tx.gas), Buffer.from(tx.to, 'hex'),
    integer(tx.value), Buffer.from(tx.data.slice(2), 'hex')];
  const digest = publicKeccak256(rlp([...base, integer(tx.chainId), Buffer.alloc(0), Buffer.alloc(0)]));
  let s = (BigInt('0x' + digest.toString('hex')) + Gx) % ORDER, parity = 0n;
  if (s > ORDER / 2n) { s = ORDER - s; parity = 1n; }
  const nativeWire = rlp([...base, integer(35n + BigInt(tx.chainId) * 2n + parity), integer(Gx), integer(s)]).toString('hex');
  return { nativeWire, nativeId: publicKeccak256(Buffer.from(nativeWire, 'hex')).toString('hex'),
    transactionSHA256: sha(Buffer.from(nativeWire, 'hex')) };
}
export function evmDeliveryFixture(label = 'one', amount = '100') {
  const address = value => sha(value).slice(0, 40), word = value => BigInt(value).toString(16).padStart(64, '0');
  const limbs = value => value.match(/.{8}/g).map(limb => limb.padStart(64, '0'));
  const identity = { chainId: '31337', genesisHash: sha('genesis'), ledgerNamespace: sha('ledger'), adapterVersion: '1',
    router: address('router'), routerCodeSHA256: sha('router-code'), routerVersion: '1', solver: TEST_EVM_SOLVER,
    asset: address('asset'), assetCodeSHA256: sha('asset-code'), assetIdentity: sha('asset-id'), vault: address('vault'),
    vaultCodeSHA256: sha('vault-code'), shareIdentity: sha('share-id'), vaultDomain: sha('vault-domain'), vaultRuntimeId: sha('vault-runtime'),
    targetPool: address('pool'), targetPoolCodeSHA256: sha('pool-code'), targetDomain: sha('domain'), targetScope: sha('scope'), targetPolicy: sha('policy') };
  const descriptor = { identity, route: { assetAmount: '234', shareAmount: amount, executionFrom: '900', executionUntil: '1100' },
    publicInputs: [...limbs(identity.targetScope), ...limbs(identity.targetPolicy), word(800), word(1200), word(amount), ...limbs(sha('Q-' + label))] };
  const intent = { descriptor, receiptKeyCommitment: sha('K-' + label), proof: 'deadbeef' }, signed = signedDeliveryWire(intent);
  const rule = { family: '3', genesis: identity.genesisHash, asset: identity.shareIdentity, finalityKind: '3',
    minimumConfirmations: '1', maximumEvidenceLifetime: '120', maximumClockSkew: '30' };
  const observation = { status: 'observed', genesis: rule.genesis, asset: rule.asset,
    nativeWire: signed.nativeWire, intent, blockId: sha('block-' + label), blockHeight: '50', finalityKind: '3', confirmations: '11',
    nativeContext: { observedTipId: sha('tip'), observedTipHeight: '60', transactionSlot: '0', parentSlot: '0', observedSlot: '0' } };
  return { ...signed, identity, intent, rule, observation,
    request: { family: '3', recipientIndex: '1', nativeId: signed.nativeId, wireKeyCommitment: intent.receiptKeyCommitment },
    recipients: [{ recipientIndex: '1', sourceEndpoint: identity.solver, destinationEndpoint: identity.router }] };
}
