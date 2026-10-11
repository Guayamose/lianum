/** Fixed local application bootstrap shared by affected-path acceptance runs.
 * All keys and values are synthetic. The keeper retains custody passwords;
 * no hosted/mobile custody or keeper/node restart guarantee is implied.
 */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createLocalEvm } from '@lianum/engine/execution/local/local-evm';
import { createNativeRecipientProcess } from '../../../../packages/backend/src/execution/native/recipients/native-recipient-process.mjs';
import { nativeAdmissionRulesTree, NATIVE_ADMISSION_LOSS_CLAUSE } from '@lianum/engine/execution/native/dispatch/native-admission';
import { createOwnedFlatBitcoinRuntime } from '../../../../packages/backend/src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { base58Decode } from "../../../../packages/backend/src/chains/solana/runtime/solana-base58.mjs";
import { createOwnedSolanaCohortRuntime } from "../../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs";
import { deployFlatSystem } from '../../../../packages/backend/src/operations/deployments/system/deploy-system.mjs';
import { createLocalFlatOperator, createFlatOperatorQuorum } from '../../../../packages/backend/src/operations/operators/claims/native-operators.mjs';
import { createFlatOwnerProcess } from '../../../../packages/backend/src/custody/processes/flat-owner-process.mjs';
import { createFlatSystemStateReader } from '../../../../packages/backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { createOwnedFlatNativeProvider } from '../../../../packages/backend/src/providers/native-provider.mjs';

import {freshFixtureId,fixtureJSON,writeFixturePrivate} from '../../../../packages/backend/src/storage/private-json-file.mjs';
export {freshFixtureId,fixtureJSON,writeFixturePrivate} from '../../../../packages/backend/src/storage/private-json-file.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const bare = value => value.slice(2);

export async function createOwnedFlatFixture(privateDirectory, callbacks = {}) {
  const onStage = callbacks.onStage ?? (async () => {}), onDeployment = callbacks.onDeployment ?? (async () => {});
  let runtime, bitcoin, solana, system, quorum, owner, reader;
  const operators = [], recipients = [], providers = [], rules = [], recipientBoots = [];
  let rulesTree;
  const fixture = { get runtime() { return runtime; }, get bitcoin() { return bitcoin; }, get solana() { return solana; },
    get system() { return system; }, get quorum() { return quorum; }, get owner() { return owner; }, get reader() { return reader; },
    operators, recipients, providers, recipientBoots, rules, get rulePaths() { return rulesTree.paths; },
    async close() {
      const result = {};
      for (const recipient of recipients) { try { await recipient.close(); } catch {} }
      for (const provider of providers) { try { provider.provider.close(); } catch {} }
      try { await owner?.close(); } catch {}
      for (const operator of operators) { try { operator.close(); } catch {} }
      for (const [name, resource] of [['closedSolana', solana], ['closedBitcoin', bitcoin], ['closedEvm', runtime]]) {
        try { result[name + 'Status'] = await resource?.close(); result[name] = resource ? true : null; }
        catch (error) { result[name] = false; result[name + 'Error'] = /^[A-Z_]+$/.test(error.message) ? error.message : 'FIXTURE_CLEANUP_FAILED'; }
      }
      return result;
    },
  };
  try {
    await onStage('start-owned-local-runtimes');
    runtime = await createLocalEvm(); bitcoin = await createOwnedFlatBitcoinRuntime(); solana = await createOwnedSolanaCohortRuntime();
    rules.push({ family: '1', genesis: bitcoin.genesis, asset: hash('LIANUM/registered-native-asset/BTC/1'),
      finalityKind: '1', minimumConfirmations: '6', maximumEvidenceLifetime: '86400', maximumClockSkew: '30' },
    { family: '2', genesis: base58Decode(solana.genesis, 32).toString('hex'), asset: hash('LIANUM/registered-native-asset/SOL/1'),
      finalityKind: '2', minimumConfirmations: '0', maximumEvidenceLifetime: '86400', maximumClockSkew: '30' });
    rulesTree = nativeAdmissionRulesTree(rules);
    for (let signerIndex = 0; signerIndex < 4; signerIndex++) operators.push(createLocalFlatOperator({ signerIndex }));
    await onStage('deploy-existing-pinned-flat-system');
    system = await deployFlatSystem(runtime, { deploymentDomain: '0x' + freshFixtureId(), registryEpoch: '1',
      rulesRoot: '0x' + rulesTree.root, attesterKeys: operators.map(operator => operator.publicKey),
      pools: [0, 1].map(() => ({ policy: '0x' + freshFixtureId(), deploymentDomain: '0x' + freshFixtureId() })), onDeployment });
    for (const operator of operators) await operator.bind({ runtime, system, bitcoin, solana, rules, rulePaths: rulesTree.paths });
    quorum = createFlatOperatorQuorum({ operators: operators.slice(0, 3) });
    reader = await createFlatSystemStateReader({ runtime, system, poolIndex: 0 });
    const directory = join(privateDirectory, 'owner'); mkdirSync(directory, { mode: 0o700 });
    owner = await createFlatOwnerProcess({ runtime, system, poolIndex: 0, directory, password: freshFixtureId(), create: true, checkpoint: null,
      onCheckpoint: async value => writeFixturePrivate(join(directory, 'checkpoint.json'), value) });
    return fixture;
  } catch (error) { error.fixtureCleanup = await fixture.close(); throw error; }
}

/** Owner-side preparation: one BTC->SOL graph, while keys stay in the owner
 * child. Returned handoffs are private application capabilities, not HTTP data. */
export async function prepareFixtureGraph(fixture, privateDirectory, cutoff, onProof = async () => {}) {
  const { runtime, system, owner, quorum, bitcoin, solana, rules } = fixture;
  const now = await runtime.time(), domain = system.pools[0].domain, operationId = freshFixtureId();
  assert.ok(BigInt(cutoff) > now + 600n, 'FIXTURE_GRAPH_WINDOW');
  const terms = { scope: domain.scope, policy: domain.policy, asset: domain.asset,
    executionFrom: String(now), executionUntil: String(BigInt(cutoff) - 60n), settleBefore: String(cutoff) };
  const offers = [];
  for (let slot = 0; slot < 2; slot++) {
    const directory = join(runtime.metadata.scratchDirectory, 'flat-provider-' + slot); mkdirSync(directory, { mode: 0o700 });
    const provider = await createOwnedFlatNativeProvider({ runtime, system, poolIndex: 0,
      nativeRuntime: slot === 0 ? bitcoin : solana, operatorQuorum: quorum, rule: rules[slot], rulePath: fixture.rulePaths[slot],
      recipientIndex: 0, terms: { ...terms, amount: slot === 0 ? '100000' : '3000000' },
      acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE, directory, password: freshFixtureId() });
    const offer = provider.offer();
    const boot = { mode: 'create', path: join(privateDirectory, 'recipient-' + slot + '.vault'), password: freshFixtureId(),
      expectedTerms: { scope: domain.scope, policy: domain.policy, asset: domain.asset, hubDomain: domain.hubDomain,
        registryCommitment: domain.registryCommitment, operationId, slot, evidencePolicy: offer.evidencePolicy,
        value: '10000', settleBefore: String(cutoff), actionTemplate: offer.actionTemplate },
      withdrawalRecipient: runtime.accounts[slot + 1].slice(2) };
    const recipient = await createNativeRecipientProcess(boot); fixture.recipients.push(recipient); fixture.recipientBoots.push(boot);
    fixture.providers.push({ slot, family: rules[slot].family, recipientIndex: 0, rule: rules[slot], rulePath: fixture.rulePaths[slot],
      deliveryRiskSalt: null, provider });
    offers.push({ provider: offer, payout: await recipient.offer() });
  }
  await owner.owner.prepareAuthorization({ changeRecipient: bare(runtime.accounts[3]), recoveryRecipient: bare(runtime.accounts[3]),
    nativeConfig: { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(key => [key, domain[key]])),
      operationId, fundingNotBefore: String(now), fundingValidUntil: String(now + 1800n), settleBefore: String(cutoff),
      nodes: offers.map((offer, slot) => { const { settleBefore: _unused, ...actionTemplate } = offer.provider.actionTemplate;
        return { id: 'leg-' + slot, dependsOn: slot ? ['leg-0'] : [], evidencePolicy: offer.provider.evidencePolicy,
          actionTemplate, recipientOffer: offer.payout }; }) } });
  const invoiceSignatures = [];
  for (const request of await owner.owner.invoiceRequests()) {
    const recipient = fixture.recipients[request.slot], selected = fixture.providers[request.slot];
    invoiceSignatures.push((await recipient.acceptInvoice(request.invoice)).invoiceSignature);
    await selected.provider.bindQuote({ recipientCustody: recipient });
    selected.deliveryRiskSalt = (await recipient.acceptedQuote()).deliveryRiskSalt;
  }
  await owner.owner.authorize({ invoiceSignatures });
  const proof = await owner.ownerProof.proveAuthorization(); await onProof({ label: 'owner-envelope', relation: 'authorization', proof });
  const rolePackets = {};
  for (const name of ['reservation', 'recovery', 'assembler']) rolePackets[name] = (await owner.roles[name]()).select();
  for (const name of ['local', 'dependency']) { rolePackets[name] = [];
    for (let slot = 0; slot < 4; slot++) rolePackets[name].push((await owner.roles[name](slot)).select()); }
  return { prepared: { authorization: { proof: proof.proof, publicInputs: [...proof.publicInputs] }, rolePackets },
    providers: fixture.providers };
}
