import assert from 'node:assert/strict';
import { Barretenberg, BackendType, UltraHonkVerifierBackend } from '@aztec/bb.js';
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { H, encode, decode, publicInputs } from './wire.mjs';
import { parseStrictJSON } from '../strict-json.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
process.on('uncaughtException', error => { console.error(error.message); process.exit(1); });
const [role, directory, policyPath] = process.argv.slice(2);
assert.ok(['E_S', 'P_S', 'E_B', 'P_B'].includes(role), 'Known role required');
const isS = role.endsWith('_S'), fromStdin = directory === '--stdin', dir = fromStdin ? null : resolve(directory);
if (dir) assert.equal(lstatSync(dir).isSymbolicLink(), false);
// Public policy is supplied independently by trusted local test bootstrap;
// package-provided VK bytes cannot choose their own accepted identity.
const transportBytes = fromStdin ? readFileSync(0) : null;
if (transportBytes) assert.ok(transportBytes.length <= 1024 * 1024, 'Bounded captured package');
const transport = fromStdin ? parseStrictJSON(transportBytes.toString('utf8')) : null;
if (transport) assert.deepEqual(Object.keys(transport).sort(), ['files', 'policy']);
const policy = fromStdin ? transport.policy : parseStrictJSON(readFileSync(resolve(policyPath), 'utf8'));
assert.deepEqual(Object.keys(policy).sort(), ['scope', 'session', 'verificationKeySHA256'].sort());
for (const value of Object.values(policy)) assert.match(value, /^[0-9a-f]{64}$/);
const names = ['verification-key.bin', ...[0, 1].flatMap(j => [`branch-${j}-proof.bin`, `branch-${j}-statement.bin`, `branch-${j}-opening.bin`]), ...(isS ? ['result-salt.bin'] : [])];
assert.deepEqual((fromStdin ? Object.keys(transport.files) : readdirSync(dir)).sort(), [...names].sort(), 'Exact role package file inventory');
const captured = {};
for (const name of names) {
  if (fromStdin) {
    assert.equal(typeof transport.files[name], 'string'); captured[name] = Buffer.from(transport.files[name], 'base64');
    assert.equal(captured[name].toString('base64'), transport.files[name], 'Canonical transport');
  } else {
    const path = resolve(dir, name); assert.ok(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink()); captured[name] = readFileSync(path);
  }
  assert.ok(captured[name].length <= 65536, 'Bounded role file');
}
const loaded = [];
const read = name => { assert.ok(names.includes(name)); const bytes = Buffer.from(captured[name]); loaded.push({ name, bytes: bytes.length, sha256: H(bytes).toString('hex') }); return bytes; };
const vk = read('verification-key.bin'); assert.equal(H(vk).toString('hex'), policy.verificationKeySHA256, 'Pinned verification key');
const salt = isS ? read('result-salt.bin') : undefined; if (salt) assert.equal(salt.length, 32);
const crsDir = resolve(root, '../.local/crs/131072');
const crs = parseStrictJSON(readFileSync(resolve(crsDir, 'provenance.json'), 'utf8'));
for (const r of crs.records) assert.equal(H(readFileSync(resolve(crsDir, r.file))).toString('hex'), r.sha256);
globalThis.fetch = async () => { throw new Error('Role proof checking is offline'); };
const report = { classification: 'ROLE_SCOPED_LOCAL_QB_PROOF_AND_OPENING_CHECK_NOT_AUTHORIZATION', role, processId: process.pid, ownerWitnessLoaded: false, logicalFileSeparationOnly: true, checks: [], applicationFilesRead: loaded };
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
try {
  await api.srsInitSrs({ pointsBuf: readFileSync(resolve(crsDir, 'bn254_g1_compressed.dat')), numPoints: 131072, g2Point: readFileSync(resolve(crsDir, 'bn254_g2.dat')) });
  const verifier = new UltraHonkVerifierBackend(api);
  let firstMenu;
  for (const j of [0, 1]) {
    const statementBytes = read(`branch-${j}-statement.bin`), statement = decode('statement', statementBytes);
    assert.equal(statement.scope.toString('hex'), policy.scope, 'Intended scope'); assert.equal(statement.session.toString('hex'), policy.session, 'Intended session'); assert.equal(statement.branch[0], j, 'Selected branch');
    if (firstMenu) assert.deepEqual(statement.menuBinding, firstMenu, 'Same pre-positioned menu'); else firstMenu = statement.menuBinding;
    const proof = read(`branch-${j}-proof.bin`);
    assert.equal(proof.length, 14656, 'Expected pinned QB proof byte length');
    assert.equal(await verifier.verifyProof({ proof, publicInputs: publicInputs(statementBytes), verificationKey: vk }, { verifierTarget: 'noir-recursive' }), true, 'Actual QB verifier');
    const openingBytes = read(`branch-${j}-opening.bin`), opening = decode(isS ? 'legS' : 'legB', openingBytes);
    assert.deepEqual(H(openingBytes), isS ? statement.C_S : statement.C_B, 'Own opening commitment');
    assert.equal(opening.branch[0], j); assert.deepEqual(opening.scope, statement.scope);
    if (isS) assert.deepEqual(H(encode('resultSalt', { resultSalt: salt })), opening.resultSaltCommitment, 'Retained S result salt');
    else assert.deepEqual(opening.parentConstraint, statement.C_S, 'Exact static predecessor');
    report.checks.push({ branch: j, proofVerified: true, ownOpeningMatched: true, ownAmount: opening.amount.readBigUInt64BE().toString(), ownConditionalPayout: opening.payoutValue.readBigUInt64BE().toString(), exactStaticPredecessorChecked: !isS, actualEffectProved: false });
  }
  assert.equal(loaded.length, names.length); assert.deepEqual(loaded.map(r => r.name).sort(), [...names].sort());
  console.log(JSON.stringify(report));
} finally { await api.destroy(); }
