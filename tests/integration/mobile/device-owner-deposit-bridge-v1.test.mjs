/** Original account/actor/journal/approval remain genuine. Native substrate is
 * the existing explicit host fixture. These are rejection boundaries, not
 * synthetic proof/funding acceptance or phone custody evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, device, createActorModule } from './paired-original-account-host-fixture.mjs';
import { originalAccountAccessMessageV2 } from '../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import { normalizeDeviceDepositConsentV1, deviceDepositConsentMessageV1, normalizeDeviceDepositWitnessV1 }
  from '../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs';
const { createPairedOriginalAccountActorV2 } = await createActorModule();
const { createDeviceOwnerDepositBridgeV1, consumeDeviceOwnerDepositAuthorizationV1, assertDeviceOwnerDepositBridgeV1 }
  = await import('../../../packages/backend/src/accounts/authority/device-owner-deposit-bridge-v1.mjs');
const { runDeviceOwnerDepositAuthorizationV1 } = await import('../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs');
const origin = 'https://device-deposit.example';
async function setup(t) {
  const f = await fixture(t, { execute: false });
  const actor = await createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
    owner: f.world.owner, origin, devicePublicKey: f.device.publicKey });
  const input = { actor, account: f.account, owner: f.world.owner, runtime: f.world.runtime, system: f.world.system, poolIndex: 0 };
  const bridge = await createDeviceOwnerDepositBridgeV1(input); t.after(() => { bridge.close(); actor.close(); });
  return { f, actor, input, bridge };
}
async function forgedConsent(actor, f) {
  const access = actor.challenge({ action: 'read' });
  const review = await actor.openReview({ challenge: access, signature: f.device.sign(originalAccountAccessMessageV2(access)) });
  const asset = f.account.config.registry[0];
  return normalizeDeviceDepositConsentV1({ version: 1, profile: 'LIANUM_DEVICE_ORIGINAL_D26_V1', action: 'PROVE_D26',
    origin, pairingId: access.pairingId, devicePublicKey: access.devicePublicKey, challengeId: '1'.repeat(64), nonce: '2'.repeat(64),
    expiresAt: Date.now() + 15_000, binding: review.binding,
    poolTerms: { scope: asset.scope, policy: asset.policy, codeHash: asset.codeHash, assetIdentity: asset.assetIdentity,
      domainCommitment: f.world.identity.domainCommitment },
    statement: { scope: asset.scope, policy: asset.policy, epoch: '10', amount: '500', output: 'a'.repeat(64) },
    rootId: '3'.repeat(64), noteRevision: 2, jobId: '4'.repeat(64), witnessSHA256: '5'.repeat(64),
    proofSHA256: null, publicInputsSHA256: null, observed: { blockNumber: '1', blockHash: '6'.repeat(64), timestamp: '6000' },
    openingDisclosure: 'ONE_D26_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER' });
}
test('bridge accepts only genuine same-realm actor/account/runtime, not copies, IDs or callbacks', async t => {
  const { f, input, bridge } = await setup(t);
  for (const replacement of [{ actor: { ...input.actor } }, { account: { ...f.account } },
    { runtime: { ...input.runtime } }, { owner: { ...input.owner } }, { system: { ...input.system } }, { executor() {} }])
    await assert.rejects(createDeviceOwnerDepositBridgeV1({ ...input, ...replacement }));
  assert.throws(() => assertDeviceOwnerDepositBridgeV1({ ...bridge }, f.account));
  assert.throws(() => consumeDeviceOwnerDepositAuthorizationV1(bridge, {}, f.account));
  await assert.rejects(runDeviceOwnerDepositAuthorizationV1(f.account, bridge, {}));
  assert.equal(f.world.proofs, 0); assert.equal(f.world.sends, 0);
});
test('private job terms require the original read signature first; no worker/journal access on forged proof consent', async t => {
  const { f, actor, bridge } = await setup(t), before = await f.account.privateStatus();
  const access = actor.challenge({ action: 'read' }), other = device();
  await assert.rejects(bridge.challengeJob({ access, signature: other.sign(originalAccountAccessMessageV2(access)),
    statement: { scope: f.world.identity.domain.scope, policy: f.world.identity.domain.policy, epoch: '10', amount: '500', output: 'a'.repeat(64) },
    rootId: '3'.repeat(64), noteRevision: 2, witnessSHA256: '5'.repeat(64), jobId: null }), /SIGNATURE_INVALID/);
  const consent = await forgedConsent(actor, f); let touched = 0;
  const witness = new Proxy({}, { ownKeys() { touched++; throw Error('TRAP'); }, getPrototypeOf() { touched++; throw Error('TRAP'); } });
  await assert.rejects(bridge.prove({ consent, signature: f.device.sign(deviceDepositConsentMessageV1(consent)), witness }), /ORIGINAL_CONSENT/);
  assert.equal(touched, 0); assert.deepEqual(await f.account.privateStatus(), before);
  assert.equal(f.world.proofs, 0); assert.equal(f.world.sends, 0);
});
test('new domains cannot be replaced by read/reconcile signatures or privateKey/root fields', async t => {
  const { f, actor, bridge } = await setup(t), consent = await forgedConsent(actor, f);
  assert.throws(() => normalizeDeviceDepositConsentV1({ ...consent, action: 'read' }));
  assert.throws(() => normalizeDeviceDepositWitnessV1({ privateKey: 'a'.repeat(64), root: 'b'.repeat(64) }));
  await assert.rejects(bridge.prove({ consent, signature: f.device.sign(originalAccountAccessMessageV2(actor.challenge({ action: 'read' }))),
    witness: {} }), /ORIGINAL_CONSENT/);
  bridge.close(); await assert.rejects(bridge.prove({ consent, signature: f.device.sign(deviceDepositConsentMessageV1(consent)), witness: {} }), /CLOSED/);
  assert.equal(f.world.proofs, 0); assert.equal(f.world.sends, 0);
});
