/** ABI conformance against already compiled artifacts only; no compiler/node/prover. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { encodeControllerClaimCall } from './controller-call.mjs';
import { encodeNativeClaimIssueCall } from './issue-call.mjs';
import { CLAIM_BACKING_FIELDS } from './permits.mjs';
const h = 'ab'.repeat(32), p = '0x' + h;
const signature = i => ({ signerIndex: i, v: 27, r: p, s: p });
const authorization = { permit: Object.fromEntries(CLAIM_BACKING_FIELDS.map(([name, type]) => [name, type === 'b32' ? h : '1'])),
  signatures: [0, 1, 2].map(signature), healthFrom: '1', healthUntil: '2', healthSignatures: [0, 1, 2].map(signature) };
const owner = { proof: '0xabcd', inputs: Array(27).fill('0x' + '00'.repeat(31) + '01') };
const ingress = { proof: '0x1234', inputs: Array(51).fill('0x' + '00'.repeat(31) + '01') };
async function artifact() {
  const root = new URL('../../../.local/native-claims-contracts/', import.meta.url);
  for (const id of (await readdir(root)).reverse()) {
    const compiled = JSON.parse(await readFile(new URL(id + '/compiled.json', root)));
    const found = compiled.contracts['native-claims/NativeClaimGateway.sol']?.NativeClaimGateway;
    if (found) return found;
  }
  throw new Error('RETAINED_GATEWAY_ARTIFACT_REQUIRED');
}
test('bare permit/route commitments become canonical compiled preposition, issue and redemption calldata', async () => {
  const contract = await artifact();
  const preposition = encodeControllerClaimCall(contract, 'preposition', [owner, authorization]);
  assert.match(preposition, /^0x[0-9a-f]+$/);
  const issue = encodeControllerClaimCall(contract, 'issue', [owner, ingress, authorization]);
  const prefixed = structuredClone(authorization);
  for (const [name, type] of CLAIM_BACKING_FIELDS) if (type === 'b32') prefixed.permit[name] = '0x' + prefixed.permit[name];
  prefixed.signatures = prefixed.signatures.map(s => ({ ...s, signerIndex: String(s.signerIndex), v: String(s.v) }));
  prefixed.healthSignatures = prefixed.healthSignatures.map(s => ({ ...s, signerIndex: String(s.signerIndex), v: String(s.v) }));
  assert.equal(issue, encodeNativeClaimIssueCall({ ownerProof: owner, ingressProof: ingress, authorization: prefixed }));
  const route = { endpoint: h, salt: h, quotedFee: '5000', selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
  assert.match(encodeControllerClaimCall(contract, 'requestRedemption', ['10000', h, '5000', route, authorization]), /^0x[0-9a-f]+$/);
  assert.throws(() => encodeControllerClaimCall(contract, 'seal', []), /FIXED_EVM_METHOD/);
  assert.throws(() => encodeControllerClaimCall(contract, 'requestRedemption', ['10000', h.toUpperCase(), '5000', route, authorization]), /CANONICAL_HEX/);
});
