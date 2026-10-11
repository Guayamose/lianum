/** Synthetic handoff only: extend the SAME owner envelope and native fixture
 * into four N32 jobs and one T138 job. No new envelope, proof, key, backend,
 * constraint execution or native runtime is created here. The supplied roots,
 * funds and native observations remain synthetic even with real signatures. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildNodeInputs, buildSettlementInputs } from '../../../../packages/backend/src/execution/account/reconciliation/completion-inputs.mjs';
import { createCommitmentCodec, exactRecord, fixedArray, digestBytes, digestWords,
  structToNoir, FIELD_MODULUS } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from "@lianum/components/plain-input";
import { validateFlatInputs } from "../../../../packages/backend/src/execution/account/preparation/readiness-inputs.mjs";
import { joinSettlement } from '@lianum/components/encoding/statements';

const h = value => createHash('sha256').update('LIANUM synthetic completion fixture v1: ' + value).digest('hex');
const publicJob = (name, relation, job) => ({ name, relation, inputs: job.inputs,
  statement: job.statement, publicInputs: [...job.expectedPublicInputs] });
function negative(name, relation, abi, original, mutate) {
  const inputs = cloneInput(original.inputs), statement = cloneInput(original.statement);
  mutate(inputs, statement);
  // This only checks ABI encoding and MUTATED public-word agreement. Do not
  // pass adversarial inputs through production semantic constructors again;
  // the primary must count actual ACVM constraint rejection, not host refusal.
  return publicJob(name, relation, validateFlatInputs(relation, abi, inputs, statement));
}

/** abis is exactly {node,settlement}, loaded/pinned independently by primary.
 * Returns jobs[{name,relation,inputs,statement,publicInputs}] and four negative
 * cases of that same shape. Fixed blinds are publicly derivable test values. */
export async function buildSyntheticCompletionFixture(envelopeFixture, nativeFixture, options) {
  exactRecord(options, ['hashFields', 'abis']); exactRecord(options.abis, ['node', 'settlement']);
  assert.equal(envelopeFixture.synthetic, true, 'SYNTHETIC_ENVELOPE_REQUIRED');
  assert.equal(nativeFixture.synthetic, true, 'SYNTHETIC_NATIVE_REQUIRED');
  const { hashFields, abis } = options, codec = createCommitmentCodec({ hashFields });
  const domainCommitment = envelopeFixture.public.statements.authorization.domainCommitment;
  const envelope = envelopeFixture.public.statements.authorization.envelope;
  const auth = envelopeFixture.public.authorization;
  assert.equal(nativeFixture.public.domainCommitment, domainCommitment, 'SYNTHETIC_SAME_DOMAIN');
  assert.equal(nativeFixture.public.authorizationRoot, auth.root, 'SYNTHETIC_SAME_AUTHORIZATION');
  assert.equal(nativeFixture.public.receiptRoot, nativeFixture.public.stateOpening.receiptRoot, 'SYNTHETIC_SAME_RECEIPT_ROOT');
  assert.equal(nativeFixture.public.receiptCount, nativeFixture.public.stateOpening.receiptCount, 'SYNTHETIC_SAME_RECEIPT_COUNT');
  fixedArray(envelopeFixture.scoped.local, 4); fixedArray(nativeFixture.receipts, 2);
  const authorization = { root: auth.root, index: auth.path.index, siblings: auth.path.siblings };
  const period = nativeFixture.public.completion;
  exactRecord(period, ['validFrom', 'validUntil']);
  const nodes = [];
  for (let slot = 0; slot < 4; slot++) {
    const packet = envelopeFixture.scoped.local[slot], receipt = slot < 2 ? nativeFixture.receipts[slot] : null;
    assert.equal(packet.envelope, envelope, 'SYNTHETIC_SAME_ENVELOPE');
    assert.equal(packet.local.value.active, slot < 2, 'SYNTHETIC_TWO_ACTIVE_LEGS');
    assert.equal(packet.local.value.slot, String(slot), 'SYNTHETIC_NODE_ORDER');
    nodes.push(await buildNodeInputs({ packet, authorization,
      stateOpening: nativeFixture.public.stateOpening, evidenceState: nativeFixture.public.evidenceState,
      revokedEntries: nativeFixture.public.revokedEntries, receiptOpening: receipt?.opening ?? null,
      receiptPath: receipt?.path ?? null, ...period, completionBlind: h('completion-blind-' + slot) },
    { hashFields, abi: abis.node }));
  }
  const pool = envelopeFixture.public.poolAfter;
  const settlement = await buildSettlementInputs({ packet: envelopeFixture.scoped.assembler, authorization,
    evidenceState: nativeFixture.public.evidenceState,
    reservePath: { root: pool.root, index: pool.reservePath.index, siblings: pool.reservePath.siblings },
    completions: nodes.map(node => node.completionOpening), ...period }, { hashFields, abi: abis.settlement });
  joinSettlement(nodes.map(node => node.statement), settlement.statement);
  const jobs = [...nodes.map((node, slot) => publicJob('n-slot-' + slot + '-genuine', 'node', node)),
    publicJob('t-genuine', 'settlement', settlement)];
  const negativeCases = [
    negative('n-wrong-own-receipt-secret', 'node', abis.node, nodes[0], inputs => {
      inputs.receipt_spend_secret[0] = String(Number(inputs.receipt_spend_secret[0]) ^ 1);
    }),
    negative('t-swapped-completion-commitments', 'settlement', abis.settlement, settlement, (inputs, statement) => {
      [inputs.completion_commitments[0], inputs.completion_commitments[1]] =
        [inputs.completion_commitments[1], inputs.completion_commitments[0]];
      [statement.completionCommitments[0], statement.completionCommitments[1]] =
        [statement.completionCommitments[1], statement.completionCommitments[0]];
    }),
  ];
  // Isolate M's E binding: every descriptor/context/blind stays unchanged,
  // but public M[0] seals that descriptor under a different canonical E.
  // T still opens the actual authorized E and must reject this splice.
  let other = (BigInt('0x' + envelope) + 1n) % FIELD_MODULUS;
  if (other === 0n) other = 1n;
  const foreignEnvelope = other.toString(16).padStart(64, '0');
  const foreignM = await codec.completionCommitment(domainCommitment, foreignEnvelope,
    nodes[0].completionOpening.completion, nodes[0].completionOpening.blind);
  negativeCases.push(negative('t-cross-envelope-completion', 'settlement', abis.settlement, settlement, (inputs, statement) => {
    inputs.completion_commitments[0] = digestWords(foreignM);
    statement.completionCommitments[0] = foreignM;
  }));
  // Isolate current GID absence: update the vector, its purpose6 digest, the
  // full purpose5 state and M together. Every other node predicate still has
  // a matching opening. Only this own GID becoming revoked should fail.
  const revoked = cloneInput(nativeFixture.public.revokedEntries), state = cloneInput(nativeFixture.public.stateOpening);
  const count = Number(state.revokedCount), gid = nativeFixture.receipts[1].opening.globalEffectId;
  assert.ok(count < 64 && !revoked.slice(0, count).includes(gid), 'SYNTHETIC_REVOCATION_CAPACITY');
  revoked[count] = gid; state.revokedCount = String(count + 1);
  state.revocationSequence = String(BigInt(state.revocationSequence) + 1n);
  state.revokedDigest = await codec.revokedDigest(domainCommitment, envelopeFixture.public.domain.hubDomain, revoked, state.revokedCount);
  const changedState = await codec.evidenceStateDigest(domainCommitment, state);
  const changedCompletion = { ...nodes[1].completionOpening.completion, evidenceState: changedState };
  const changedM = await codec.completionCommitment(domainCommitment, envelope, changedCompletion, nodes[1].completionOpening.blind);
  negativeCases.push(negative('n-current-own-gid-revoked-with-matching-state-and-m', 'node', abis.node, nodes[1], (inputs, statement) => {
    inputs.revoked_entries = revoked.map(digestBytes); inputs.state_opening = structToNoir('evidenceState', state);
    inputs.completion = structToNoir('completion', changedCompletion);
    inputs.evidence_state = digestWords(changedState); inputs.completion_commitment = digestWords(changedM);
    statement.evidenceState = changedState; statement.completionCommitment = changedM;
  }));
  return frozenInput({ synthetic: true,
    assurance: 'SAME_ENVELOPE_SIGNED_SYNTHETIC_WITNESSES_NOT_FUNDS_FINALITY_OR_PROOF_ACCEPTANCE', jobs, negativeCases });
}
