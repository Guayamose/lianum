/** HOST wiring regression: actual withdrawal factory and Merkle paths, with
 * the bridge's capability guard explicitly represented by an inert port. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { PrivateNoteTree } from '../../../../engine/src/notes/private-note-tree.mjs';
import { DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2 } from '../../../../mobile-protocol/src/device-native-private-exit-v2.mjs';

const bridgeURL = new URL('../../../src/accounts/authority/device-owner-execution-bridge-v1.mjs', import.meta.url);
const originalBridgeModule = await import(bridgeURL);
const capability = Object.freeze({ HOST_ORIGINAL_ACCOUNT: true }), bridge = Object.freeze({ HOST_ORIGINAL_BRIDGE: true });
const h = n => n.toString(16).padStart(64, '0');
const descriptor = Object.freeze({ origin: 'https://host.invalid', pairingId: h(1), devicePublicKey: '04' + '12'.repeat(64) });
let validations = 0;
mock.module(bridgeURL, { exports: { ...originalBridgeModule,
  assertDeviceOwnerExecutionBridgeV1(value, account) {
    assert.equal(value, bridge); assert.equal(account, capability, 'HOST_ORIGINAL_ACCOUNT_CAPABILITY');
    validations++; return descriptor;
  },
} });
// The helper may already have loaded through the bridge's account import.
// A fresh helper has no account registry; authority remains the explicit HOST port.
const helperURL = new URL('../../../src/accounts/authority/native-value/native-value-authority-withdrawals.mjs', import.meta.url);
helperURL.search = '?host-original-capability';
const { createNativeValueWithdrawals } = await import(helperURL);

test('both original deposit-exit paths validate the owning capability, never a missing or copied account', async () => {
  const commitment = h(2), nullifier = h(3), rootId = h(4), jobId = h(5);
  const deposit = { jobId, stage: 'CONFIRMED', nullifier,
    consent: { ...descriptor, rootId, noteRevision: 1, statement: { output: commitment, amount: '10' } },
    proofSHA256: h(6), publicInputsSHA256: h(7), submission: { transactionHash: h(8), calldataSHA256: h(9) } };
  const tree = new PrivateNoteTree([Buffer.from(commitment, 'hex')]);
  const view = { ledger: { commitments: ['0x' + commitment], nullifiers: [], tree }, head: { timestamp: '1000', number: '1', hash: h(10) } };
  const context = { capability, privateExitBridge: bridge, record: { data: { devicePrivateW39Profile: DEVICE_NATIVE_PRIVATE_EXIT_PROOF_V2 } },
    deviceRow: id => { assert.equal(id, jobId); return deposit; }, deviceBinding: value => assert.equal(value, deposit.consent),
    observeDevice: async value => assert.equal(value, deposit), reader: { read: async () => view, assertCurrent: async value => assert.equal(value, view) },
    continueWork() {}, bare: value => value.replace(/^0x/, ''), identity: { domainCommitment: h(11) },
    asset: { scope: h(12), policy: h(13), codeHash: h(14), assetIdentity: h(15) }, reservationBinding() {},
  };
  const operations = createNativeValueWithdrawals(context), request = { parentJobId: jobId, noteRole: 'deposit', rootId, noteRevision: 1, nullifier, recipient: '12'.repeat(20) };
  const terms = await operations.depositedExitTerms(bridge, request);
  const consent = { ...descriptor, ...request, nativeBindingSHA256: terms.nativeBindingSHA256, statement: terms.statement };
  assert.equal(operations.exitBinding(consent, bridge), deposit);
  assert.equal(validations, 2);
  const copied = createNativeValueWithdrawals({ ...context, capability: { ...capability } });
  await assert.rejects(copied.depositedExitTerms(bridge, request), /HOST_ORIGINAL_ACCOUNT_CAPABILITY/);
  assert.throws(() => copied.exitBinding(consent, bridge), /HOST_ORIGINAL_ACCOUNT_CAPABILITY/);
  assert.equal(validations, 2);
});
