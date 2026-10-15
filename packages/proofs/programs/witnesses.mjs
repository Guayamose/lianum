import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeFixture, sha256, shaHex, signAuthorization, authorizationFrame, fromWordsBE, ORDER, keyCommitment, wordsBE, TAGS } from './encoding.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
globalThis.fetch = async () => { throw new Error('PC15_WITNESS_MUST_BE_OFFLINE'); };
const load = name => JSON.parse(readFileSync(root + '.local/compiled/' + name + '.json'));
const vector = new Noir(load('official_vector')), main = new Noir(load('authorization'));
const records = [];
const arr = hex => [...Buffer.from(hex, 'hex')];
const v = { public_key_x: arr('a0434d9e47f3c86235477c7b1ae6ae5d3442d49b1943c2b752a68e2a47e247c7'), public_key_y: arr('893aba425419bc27a3b6c7e693a24c696f794c2ed877a1593cbee53b037368d7'), signature: arr('e5081c80ab427dc370346f4a0e31aa2bad8d9798c38061db9ae55a4e8df454fd28119894344e71b78770cc931d61f480ecbb0b89d6eb69690161e49a715fcd55'), message_hash: arr('3a73f4123a5cd2121f21cd7e8d358835476949d035d9c2da6806b4633ac8c1e2'), expected: true };
const stdlib = readFileSync(root + 'vendor/ecdsa_secp256k1.nr');
assert.equal(shaHex(stdlib), 'f4de3974308bd4d4a5f0171e05e487215165fee0bea27ebcd9f007fc4bbaf231');
assert.equal(shaHex(readFileSync(root + 'vendor/secp256k1.rs')), '40aec2897f57ac46adaab82ab787135a02524db1d2b3dbc5d0c603aa8bf586d6');
function highS(sig) { const b = Buffer.from(sig); const s = BigInt('0x' + b.subarray(32).toString('hex')); return [...Buffer.concat([b.subarray(0, 32), Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex')])]; }
for (const [name, input] of [
  ['officialPositive', v],
  ['officialChangedMessage', { ...v, message_hash: [0, ...v.message_hash.slice(1)], expected: false }],
  ['officialMalformedKey', { ...v, public_key_x: Array(32).fill(255), public_key_y: Array(32).fill(255), expected: false }],
  ['officialTruncatedYCoordinate', { ...v, public_key_y: [...Array(31).fill(0), v.public_key_y[31]], expected: false }],
  ['officialZeroSignature', { ...v, signature: Array(64).fill(0), expected: false }],
  ['officialScalarOutOfRange', { ...v, signature: [...Array(32).fill(255), ...v.signature.slice(32)], expected: false }],
  ['officialHighS', { ...v, signature: highS(v.signature), expected: false }],
  ['officialDigestEqualsOrder', { ...v, message_hash: arr(ORDER.toString(16)), expected: false }],
  ['officialDigestExceedsOrder', { ...v, message_hash: Array(32).fill(255), expected: false }],
]) {
  const start = performance.now(); const { witness } = await vector.execute(input);
  records.push({ name, solverReturnedExpected: true, expectedSignatureValidity: input.expected, stage: 'witness-execution-not-proof', milliseconds: performance.now() - start });
  if (name === 'officialPositive') writeFileSync(root + '.local/official-positive.witness.gz', witness);
  if (name === 'officialHighS') writeFileSync(root + '.local/official-high-s-false.witness.gz', witness);
}
const fixture = makeFixture(), f = fixture.input;
const start = performance.now(), { witness } = await main.execute(f);
writeFileSync(root + '.local/authorization.witness.gz', witness);
writeFileSync(root + '.local/fixture.json', JSON.stringify({ classification: 'PUBLIC_SYNTHETIC_FIXTURE_NO_PRIVATE_KEY_RETAINED', input: f, messageHex: fixture.message.toString('hex'), hashBoundary: 'SHA256(canonical frame) once via Node sign(sha256, frame)', witnessSHA256: shaHex(witness) }, null, 2) + '\n');
records.push({ name: 'independentNodeSignature', accepted: true, milliseconds: performance.now() - start, witnessBytes: witness.length, stage: 'witness-execution-not-proof' });
const other = makeFixture().input;
const crossFrame = authorizationFrame({ graphCommitment: fromWordsBE(f.graph_commitment), economicPolicy: Buffer.from(f.economic_policy), tag: 'PC15/owner-authorization/2' });
const negatives = [
  ['changedGraph', { graph: [f.graph[0] ^ 1, ...f.graph.slice(1)] }],
  ['changedSalt', { salt: [f.salt[0] ^ 1, ...f.salt.slice(1)] }],
  ['changedPolicyMessage', { economic_policy: [f.economic_policy[0] ^ 1, ...f.economic_policy.slice(1)] }],
  ['changedScope', { scope: [(f.scope[0] ^ 1) >>> 0, ...f.scope.slice(1)] }],
  ['changedCommitment', { graph_commitment: [(f.graph_commitment[0] ^ 1) >>> 0, ...f.graph_commitment.slice(1)] }],
  ['changedKeyAndMatchingKeyCommitment', { public_key_x: other.public_key_x, public_key_y: other.public_key_y, owner_commitment: other.owner_commitment }],
  ['offCurveKeyAndMatchingCommitment', { public_key_x: Array(32).fill(0), public_key_y: Array(32).fill(0), owner_commitment: wordsBE(keyCommitment(Buffer.alloc(32), Buffer.alloc(32))) }],
  ['changedSignature', { signature: [f.signature[0] ^ 1, ...f.signature.slice(1)] }],
  ['zeroSignature', { signature: Array(64).fill(0) }],
  ['outOfRangeR', { signature: [...Array(32).fill(255), ...f.signature.slice(32)] }],
  ['highS', { signature: highS(f.signature) }],
  ['reversedSignatureByteOrder', { signature: [...f.signature].reverse() }],
  ['crossDomainValidHostSignature', { signature: [...signAuthorization(fixture.privateKey, crossFrame)] }],
  ['doubleHashValidHostSignature', { signature: [...signAuthorization(fixture.privateKey, sha256(fixture.message))] }],
  ['wrongDigestWordOrder', { graph_commitment: [...f.graph_commitment].reverse() }],
  ['malformedSignatureLength', { signature: f.signature.slice(1) }],
  ['recoveryByteIsNotP1363', { signature: [...f.signature, 0] }],
];
for (const [name, changes] of negatives) {
  let failure;
  try { await main.execute({ ...f, ...changes }); } catch (e) { failure = e; }
  assert.ok(failure, `Expected witness rejection: ${name}`);
  const text = String(failure.message); assert.ok(!/offline|network|fetch|out of memory/i.test(text), 'Infrastructure failure is not a negative-test pass');
  assert.match(text, name.includes('Length') || name.includes('recoveryByte') ? /does not match the specified type/ : /Cannot satisfy constraint|Assertion failed/);
  records.push({ name, rejected: true, stage: name.includes('Length') || name.includes('recoveryByte') ? 'abi-encoding' : 'witness-execution-not-proof', error: text.slice(0, 500) });
}
mkdirSync(root + '../../evidence', { recursive: true });
const result = { classification: 'AUTHENTICATED_HIDDEN_MESSAGE_WITNESS_TESTS_NOT_PROOFS', source: 'Pinned official Noir stdlib/solver vectors plus independent Node/OpenSSL secp256k1 signatures', signatureScheme: 'SHA256(canonical framed preimage), P1363 big-endian r||s, low-S', records, resourceUsage: process.resourceUsage(), scopeLimit: 'No funded note, balance, native fulfillment or settlement' };
writeFileSync(root + '../../evidence/m15-auth-witnesses.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ positiveAndExpectedFalseVectors: 9, independentPositive: 1, negativeWitnesses: negatives.length, resourceUsage: result.resourceUsage }));
