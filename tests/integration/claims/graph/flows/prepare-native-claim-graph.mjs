/** One ordinary SOL action funded by an already issued private claim note.
 * Importing starts no node, compiler or prover. Preparation retains its
 * private recipient/provider handles in the original fixture for cleanup.
 * Source funding, reservation, dispatch, settlement and exits belong to the
 * existing account/native execution path used by the caller.
 */
import assert from 'node:assert/strict';
import { lstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createNativeRecipientProcess } from '../../../../../packages/engine/src/execution/native/recipients/native-recipient-process.mjs';
import { NATIVE_ADMISSION_LOSS_CLAUSE } from '../../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import { assertOwnedFlatOwnerProcess } from '../../../../../packages/custody/src/processes/flat-owner-process.mjs';
import { exactRecord } from '../../../../../packages/backend/src/execution/encoding/commitments.mjs';
import { inputUint } from '../../../../../packages/backend/src/execution/account/preparation/readiness-inputs.mjs';
import { createOwnedFlatNativeProvider } from '../../../../../packages/backend/src/providers/native-provider.mjs';
import { freshFixtureId } from '../../../fixtures/runners/owned-flat-fixture.mjs';

const preparations = new WeakSet();
const bare = value => value.slice(2);

/** Fixed one-action topology and owned solver/recipient endpoints. The payout
 * is in the selected claim pool's units; nativeAmount is delivered lamports.
 * No node list, factory, endpoint, key or proof backend is caller supplied.
 */
export async function prepareNativeClaimGraph(fixture,privateDirectory,owner,options,onProof=async()=>{}){return prepareGraph(fixture,privateDirectory,owner,options,onProof,false);}
/** Fixed BTC invoice funds one real SOL10M SOURCE for Jupiter; no WSOL deposit
 * or quote authorizes source principal, and the SOL leaf remains distinct. */
export async function prepareNativeSplSourceGraphV1(fixture,privateDirectory,owner,onProof=async()=>{}){
 const now=await fixture.runtime.time();return prepareGraph(fixture,privateDirectory,owner,{poolIndex:0,cutoff:String(now+7200n),payoutAmount:'20000',nativeAmount:'10000000'},onProof,true);
}
async function prepareGraph(fixture,privateDirectory,owner,options,onProof,spl){
  exactRecord(options, ['cutoff', 'payoutAmount', 'nativeAmount',
    ...(options && Object.hasOwn(options, 'poolIndex') ? ['poolIndex'] : [])]);
  const { cutoff, payoutAmount, nativeAmount, poolIndex = 1 } = options;
  assert.ok(inputUint(cutoff) > 0n, 'NATIVE_CLAIM_GRAPH_CUTOFF');
  assert.ok(inputUint(payoutAmount) > 0n, 'NATIVE_CLAIM_GRAPH_PAYOUT');
  assert.ok(inputUint(nativeAmount, 64, BigInt(Number.MAX_SAFE_INTEGER)) > 0n, 'NATIVE_CLAIM_GRAPH_NATIVE_AMOUNT');
  assert.ok(Number.isSafeInteger(poolIndex) && !Object.is(poolIndex, -0)
    && (poolIndex === 0 || poolIndex === 1), 'NATIVE_CLAIM_GRAPH_POOL');
  assert.equal(typeof onProof, 'function');
  const stat = lstatSync(privateDirectory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0,
    'NATIVE_CLAIM_GRAPH_PRIVATE_DIRECTORY');
  const { runtime, system, graphSolana, graphQuorum } = fixture;
  assertOwnedFlatOwnerProcess(owner, { runtime, system, poolIndex });
  assert.ok(fixture.owners.some(entry => entry.owner === owner && entry.poolIndex === poolIndex),
    'NATIVE_CLAIM_GRAPH_FIXTURE_OWNER');
  assert.ok(graphSolana && graphQuorum && Array.isArray(fixture.resources), 'NATIVE_CLAIM_GRAPH_FIXTURE_REQUIRED');
  if(spl)assert.equal(fixture.splCustodyProfile,true,'SPL_GRAPH_ORIGINAL_FIXED_FIXTURE');
  const recipientIndex=spl?1:0,rule = spl?fixture.graphSolanaRule:fixture.rules[1], rulePath = fixture.rulePaths[spl?2:1];
  assert.equal(rule.family, '2', 'NATIVE_CLAIM_GRAPH_SOL_RULE');
  assert.ok(!preparations.has(fixture), 'NATIVE_CLAIM_GRAPH_ONE_PREPARATION');
  const now = await runtime.time(), domain = system.pools[poolIndex].domain;
  // Keep the exact caller cutoff. Receipt lifetime is a separate execution
  // setting and never widens the registered rule or this signed window.
  assert.ok(BigInt(cutoff) > now + 1800n, 'NATIVE_CLAIM_GRAPH_WINDOW');
  assert.ok(!preparations.has(fixture), 'NATIVE_CLAIM_GRAPH_ONE_PREPARATION');
  preparations.add(fixture);
  const operationId = freshFixtureId(), executionFrom = String(now);
  const executionUntil = String(BigInt(cutoff) - 60n);
  const directory = join(runtime.metadata.scratchDirectory, 'flat-native-claim-graph-provider');
  mkdirSync(directory, { mode: 0o700 });
  const provider = await createOwnedFlatNativeProvider({ runtime, system, poolIndex,
    nativeRuntime: graphSolana, operatorQuorum: graphQuorum, rule, rulePath, recipientIndex,
    terms: { scope: domain.scope, policy: domain.policy, asset: domain.asset, amount: nativeAmount,
      executionFrom, executionUntil, settleBefore: cutoff },
    acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE, directory, password: freshFixtureId() });
  fixture.resources.push(provider);
  const selected = { slot: 0, family: '2', recipientIndex, rule, rulePath, deliveryRiskSalt: null, provider };
  const offer = provider.offer();
  const recipientBoot = { mode: 'create', path: join(privateDirectory, 'native-claim-graph-recipient.vault'),
    password: freshFixtureId(),
    expectedTerms: { scope: domain.scope, policy: domain.policy, asset: domain.asset, hubDomain: domain.hubDomain,
      registryCommitment: domain.registryCommitment, operationId, slot: 0, evidencePolicy: offer.evidencePolicy,
      value: payoutAmount, settleBefore: cutoff, actionTemplate: offer.actionTemplate },
    withdrawalRecipient: bare(runtime.accounts[1]) };
  const recipient = await createNativeRecipientProcess(recipientBoot);
  fixture.resources.push(recipient);
  const { settleBefore: _unused, ...actionTemplate } = offer.actionTemplate;
  await owner.owner.prepareAuthorization({ changeRecipient: bare(runtime.accounts[poolIndex + 3]),
    recoveryRecipient: bare(runtime.accounts[poolIndex + 3]), nativeConfig: {
      ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(key => [key, domain[key]])),
      operationId, fundingNotBefore: executionFrom, fundingValidUntil: String(now + 1800n), settleBefore: cutoff,
      nodes: [{ id: 'sol-native-delivery', dependsOn: [], evidencePolicy: offer.evidencePolicy,
        actionTemplate, recipientOffer: await recipient.offer() }],
    } });
  const requests = await owner.owner.invoiceRequests();
  assert.equal(requests.length, 1, 'NATIVE_CLAIM_GRAPH_ONE_INVOICE');
  assert.equal(requests[0].slot, 0, 'NATIVE_CLAIM_GRAPH_INVOICE_SLOT');
  const accepted = await recipient.acceptInvoice(requests[0].invoice);
  await provider.bindQuote({ recipientCustody: recipient });
  selected.deliveryRiskSalt = (await recipient.acceptedQuote()).deliveryRiskSalt;
  await owner.owner.authorize({ invoiceSignatures: [accepted.invoiceSignature] });
  const proof = await owner.ownerProof.proveAuthorization();
  await onProof({ label: 'owner-envelope', relation: 'authorization', proof });
  const rolePackets = {};
  for (const name of ['reservation', 'recovery', 'assembler']) rolePackets[name] = (await owner.roles[name]()).select();
  for (const name of ['local', 'dependency']) {
    rolePackets[name] = [];
    for (let slot = 0; slot < 4; slot++) rolePackets[name].push((await owner.roles[name](slot)).select());
  }
  for (let slot = 0; slot < 4; slot++)
    assert.equal(rolePackets.local[slot].local.value.active, slot === 0, 'NATIVE_CLAIM_GRAPH_FIXED_PADDING');
  return { prepared: { authorization: { proof: proof.proof, publicInputs: [...proof.publicInputs] }, rolePackets },
    providers: [selected], recipients: [recipient], recipientBoots: [recipientBoot] };
}
