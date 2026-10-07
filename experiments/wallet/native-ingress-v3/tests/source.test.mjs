/** Read-only source/closure checks, not Noir compilation or constraints. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, relation } from '../../../../packages/proofs/src/catalog.mjs';
import { sourceManifest } from '../../../../packages/proofs/src/tooling/tooling.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const candidate = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFileSync(resolve(root, path), 'utf8');
const oldEvidence = read('proof-relations/native-claim-lib/src/evidence.nr');
const newEvidence = read('experiments/native-ingress-v3/lib/src/evidence.nr');
const oldMain = read('proof-relations/native-claim-ingress/src/main.nr');
const newMain = read('experiments/native-ingress-v3/circuits/native-claim-ingress-v3/src/main.nr');
const profile = JSON.parse(readFileSync(resolve(candidate, 'profile.json')));
const manifest = JSON.parse(readFileSync(resolve(candidate, 'baseline-manifest.json')));
const stripComments = source => source.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
const hash = value => createHash('sha256').update(value).digest('hex');

test('baseline CI51/CO42 full Noir closures and guarded host/contract files are byte-identical', () => {
  for (const [name, expected] of Object.entries(manifest.relations))
    assert.deepEqual(sourceManifest(CATALOG[name]), expected, name);
  for (const entry of manifest.files) {
    const bytes = readFileSync(resolve(root, entry.path));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(hash(bytes), entry.sha256, entry.path);
  }
  const candidateManifest = JSON.parse(readFileSync(resolve(candidate, 'source-manifest.json')));
  const roots = { wallet: root, flat: resolve(root, '..'), golden: resolve(root, '../../omnichain-product') };
  assert.equal(hash(JSON.stringify(candidateManifest.files)), candidateManifest.sourceClosureSHA256);
  for (const entry of candidateManifest.files) {
    const bytes = readFileSync(resolve(roots[entry.root], entry.path));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(hash(bytes), entry.sha256, entry.path);
  }
  assert.equal(hash(readFileSync(resolve(candidate, 'source.patch'))), candidateManifest.sourcePatchSHA256);
  assert.equal(hash(readFileSync(resolve(candidate, 'baseline-manifest.json'))), candidateManifest.baselineManifestSHA256);
});

test('candidate changes only evidence imports, function name, and payout-to-ingress direction scope', () => {
  const expected = oldEvidence.replace('use crate::facts;', 'use claim_support::facts;')
    .replace('use crate::types::', 'use claim_support::types::')
    .replace('pub fn assert_registered_evidence(', 'pub fn assert_registered_ingress_evidence(')
    .replace(/if evidence\.wire\.wire_binding_version == 2 \{\s*assert\(evidence\.observation\.source_commitment == config\.escrow_endpoint_commitment\);\s*\}/,
      'assert(evidence.observation.destination_commitment == config.escrow_endpoint_commitment);');
  assert.equal(stripComments(newEvidence), stripComments(expected));
  assert.doesNotMatch(newEvidence, /pub fn assert_registered_evidence\(/);
  assert.doesNotMatch(newEvidence, /direction:|is_ingress:|allow_nonce:/);
});

test('CI51 statement and all receipt, note, refund, revocation and amount joins are unchanged', () => {
  const expected = oldMain.replace('use claim_support::{framing, evidence as claim_evidence};',
    'use claim_support::framing;\nuse ingress_v3_support::evidence as claim_evidence;')
    .replace('claim_evidence::assert_registered_evidence(', 'claim_evidence::assert_registered_ingress_evidence(');
  assert.equal(stripComments(newMain), stripComments(expected));
  const parameters = source => source.slice(source.indexOf('fn main('), source.indexOf(') {', source.indexOf('fn main(')));
  assert.equal(parameters(newMain), parameters(oldMain));
  assert.equal(CATALOG.native_claim_ingress.publicWords, profile.publicWords);
});

test('unchanged facts, source-only payout and distinct endpoints preserve the baseline blocker', () => {
  assert.match(oldEvidence, /if evidence\.wire\.wire_binding_version == 2 \{\s*assert\(evidence\.observation\.source_commitment == config\.escrow_endpoint_commitment\)/);
  assert.match(read('proof-relations/native-claim-lib/src/facts.nr'), /assert\(observed\.source_commitment != observed\.destination_commitment\)/);
  assert.match(read('proof-relations/native-claim-discharge/src/main.nr'), /assert\(evidence\.observation\.source_commitment == config\.escrow_endpoint_commitment\)/);
  assert.match(newEvidence, /use claim_support::facts;/);
  assert.match(newEvidence, /facts::assert_native_facts\(rule, evidence.effect, evidence.wire,/);
});

test('candidate is unregistered and has no actual artifact, key or accepted verifier identity', () => {
  assert.equal(profile.activation, false);
  for (const field of ['artifact', 'verificationKey', 'deployedVerifier', 'claimVerifierSetCommitment'])
    assert.equal(profile[field], null);
  assert.throws(() => relation(profile.candidateRelation), /PW_FIXED_RELATION/);
  assert.ok(CATALOG.native_claim_ingress.circuit.endsWith('/proof-relations/native-claim-ingress'));
  const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(resolve(directory, entry.name)) : [entry.name]);
  assert.ok(files(candidate).every(name => !/^(?:key\.vk|verifier\.sol|program\.json|proof.*)$/.test(name)));
});

test('new local Nargo dependencies resolve only to isolated candidate or captured baseline packages', () => {
  const allowed = new Set(Object.values(manifest.relations).flat().filter(file => file.path.endsWith('/Nargo.toml'))
    .map(file => resolve(file.root === 'wallet' ? root : file.root === 'flat' ? resolve(root, '..') : resolve(root, '../../omnichain-product'), file.path)));
  allowed.add(resolve(candidate, 'lib/Nargo.toml'));
  for (const relative of ['lib/Nargo.toml', 'circuits/native-claim-ingress-v3/Nargo.toml']) {
    const path = resolve(candidate, relative), text = readFileSync(path, 'utf8');
    assert.doesNotMatch(text, /git\s*=|tag\s*=|https?:|branch\s*=/);
    for (const match of text.matchAll(/path = "([^"]+)"/g)) {
      const dependency = resolve(dirname(path), match[1], 'Nargo.toml');
      assert.ok(allowed.has(dependency), dependency);
      assert.ok(readFileSync(dependency).length > 0);
    }
  }
});
