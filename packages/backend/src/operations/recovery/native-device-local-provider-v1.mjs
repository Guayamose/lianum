/** Fixed local product setup, sharing the original native-wallet constructors.
 * No source note, device root/key, proof callback or send is accepted. Windows
 * are created once after the original clocks are aligned; READ never renews them. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { assertOwnedNativeValueWalletSystem } from '../deployments/native-value/native-value-wallet-binding-v2.mjs';
import { assertOwnedLocalEvmV2, assertOwnedLocalEvmNativeValueV1, assertOwnedLocalEvmNativeValueRuntime, assertOwnedNativeEconomicObservedReceiverV2, assertOwnedNativeEconomicObservedGraphRuntimeV2 } from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOriginalNativeDeviceLocalObservedClockV1 } from './native-device-local-observed-clock-v1.mjs';
import { createOwnedNativeValueProviderCustody } from '../../providers/native-value-provider-v2.mjs';
import { profileCommitment } from '../../chains/shared/transfers/generic-native-value-v2.mjs';
import { createNativeRecipientProcess } from '../../../../engine/src/execution/native/recipients/native-recipient-process.mjs';
import { nativeRecipientInvoiceRequest } from '../../../../engine/src/execution/native/recipients/native-recipient-custody.mjs';
import { createGenericBalanceNativePreparation } from '../../../../engine/src/execution/balances/generic-balance-native-preparation.mjs';
import { NATIVE_ADMISSION_LOSS_CLAUSE } from '../../../../engine/src/execution/native/dispatch/native-admission.mjs';
const fresh = () => randomBytes(32).toString('hex');
export async function prepareOriginalNativeDeviceLocalProviderV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['runtime', 'system', 'nativeRuntime', 'bootstrap']);
  const { runtime, system, nativeRuntime, bootstrap } = input;
  assertOwnedNativeValueWalletSystem(runtime, system); await assertOwnedLocalEvmV2(runtime);
  await assertOwnedLocalEvmNativeValueV1(nativeRuntime); assert.equal(nativeRuntime.metadata.chainId, '1');
  return prepareFixedOriginalNativeDeviceLocalProvider({ runtime, system, nativeRuntime, bootstrap });
}
/** Distinct original observed producer. The private clock supplies membership,
 * including the original LIVE_ARMED pair; metadata or a flag cannot select it. */
export async function prepareOriginalNativeDeviceObservedLocalProviderV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['runtime', 'system', 'nativeRuntime', 'bootstrap', 'clock']);
  const { runtime, system, nativeRuntime, bootstrap, clock } = input;
  assertOwnedNativeValueWalletSystem(runtime, system);
  assertOriginalNativeDeviceLocalObservedClockV1(clock, { runtime, nativeRuntime });
  assertOwnedNativeEconomicObservedReceiverV2(runtime); assertOwnedNativeEconomicObservedGraphRuntimeV2(nativeRuntime);
  await assertOwnedLocalEvmV2(runtime); await assertOwnedLocalEvmNativeValueRuntime(nativeRuntime);
  assertOriginalNativeDeviceLocalObservedClockV1(clock, { runtime, nativeRuntime });
  assertOwnedNativeEconomicObservedReceiverV2(runtime); assertOwnedNativeEconomicObservedGraphRuntimeV2(nativeRuntime);
  assert.equal(nativeRuntime.metadata.chainId, '1');
  return prepareFixedOriginalNativeDeviceLocalProvider({ runtime, system, nativeRuntime, bootstrap });
}
async function prepareFixedOriginalNativeDeviceLocalProvider({ runtime, system, nativeRuntime, bootstrap }) {
  const domain = system.pools[0].domain, now = await runtime.time(), cutoff = now + 28800n, operationId = fresh();
  const directory = join(nativeRuntime.metadata.scratchDirectory, 'original-device-product-provider');
  mkdirSync(directory, { mode: 0o700 });
  const custody = await createOwnedNativeValueProviderCustody({ runtime, system, poolIndex: 0, nativeRuntime, bootstrap,
    profileCommitment: profileCommitment(system.adapterProfiles[0].profile), recipientEndpoint: nativeRuntime.accounts[1],
    terms: { scope: domain.scope, policy: domain.policy, asset: domain.asset, amount: '1000000', executionFrom: String(now),
      executionUntil: String(cutoff - 60n), settleBefore: String(cutoff) },
    acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE, directory, password: fresh() });
  let recipient;
  try {
    const offer = custody.offer(), expectedTerms = { scope: domain.scope, policy: domain.policy, asset: domain.asset,
      hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, operationId, slot: 0,
      evidencePolicy: offer.evidencePolicy, value: '100', settleBefore: String(cutoff), actionTemplate: offer.actionTemplate };
    recipient = await createNativeRecipientProcess({ mode: 'create',
      path: join(runtime.metadata.scratchDirectory, 'original-device-product-recipient.vault'), password: fresh(),
      expectedTerms, withdrawalRecipient: runtime.accounts[1].slice(2) });
    const recipientOffer = await recipient.offer(), { settleBefore: _cutoff, ...actionTemplate } = offer.actionTemplate;
    const nativePreparation = createGenericBalanceNativePreparation({
      ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(name => [name, domain[name]])),
      operationId, fundingNotBefore: String(now), fundingValidUntil: String(cutoff - 120n), settleBefore: String(cutoff),
      nodes: [{ id: 'device_leg_0', dependsOn: [], evidencePolicy: offer.evidencePolicy, actionTemplate, recipientOffer }] });
    const prepared = nativePreparation.nodes[0], invoice = nativeRecipientInvoiceRequest(expectedTerms, recipientOffer,
      { action: prepared.action, deliveryRiskSalt: prepared.deliveryRiskSalt });
    const accepted = await recipient.acceptInvoice(invoice); await custody.bindQuote({ recipientCustody: recipient });
    assert.equal((await recipient.acceptedQuote()).deliveryRiskSalt, prepared.deliveryRiskSalt);
    return Object.freeze({ nativePreparation, invoiceSignatures: Object.freeze([accepted.invoiceSignature]), custody, recipient,
      deliveryRiskSalt: prepared.deliveryRiskSalt });
  } catch (error) {
    const failures = [];
    for (const resource of [recipient, custody]) try { await resource?.close(); } catch (failure) { failures.push(failure); }
    if (failures.length) throw new AggregateError([error, ...failures], 'NATIVE_DEVICE_PRODUCT_PROVIDER_CLEANUP_UNCONFIRMED', { cause: error });
    throw error;
  }
}
