/** Current host-source adoption, separate from retained compiler/artifact identity. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants,existsSync,lstatSync,openSync,fstatSync,readFileSync,closeSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {projectRoot} from '@lianum/environment';

const adoptionPath = 'scripts/development/adopted-generation.json';
/** @param {Uint8Array} bytes */
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const hashPattern = /^[0-9a-f]{64}$/;
/** @type {(keyof import('node:fs').Stats)[]} */
const statFields = ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeMs', 'ctimeMs'];

/** @param {unknown} value @returns {Record<string, unknown>} */
function record(value) {
  assert.ok(value !== null && typeof value === 'object' && !Array.isArray(value), 'CURRENT_SOURCE_RECORD');
  return /** @type {Record<string, unknown>} */ (value);
}

/** @param {unknown} value @returns {string} */
function hash(value) {
  assert.ok(typeof value === 'string' && hashPattern.test(value), 'CURRENT_SOURCE_DIGEST');
  return value;
}

/** @param {Buffer} bytes @returns {Record<string, unknown>} */
const jsonRecord = bytes => record(/** @type {unknown} */ (JSON.parse(bytes.toString('utf8'))));

/** @param {string} relative @param {{sha256: string, bytes?: number}} [expected] */
function regular(relative, expected) {
  assert.ok(typeof relative === 'string' && relative && !relative.startsWith('/')
    && !relative.includes('\\') && relative.split('/').every(part => part && part !== '.' && part !== '..'),
  'CURRENT_SOURCE_PUBLIC_PATH');
  const path = join(projectRoot, relative);
  assert.equal(realpathSync(path), resolve(path), 'CURRENT_SOURCE_ALIAS');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(fd);
    assert.ok(before.isFile() && before.nlink === 1 && before.size <= 128 * 1024 * 1024,
      'CURRENT_SOURCE_REGULAR_FILE');
    const bytes = readFileSync(fd), after = fstatSync(fd), named = lstatSync(path);
    for (const field of statFields) {
      assert.ok(before[field] === after[field] && before[field] === named[field], 'CURRENT_SOURCE_CHANGED_DURING_READ');
    }
    if (expected) {
      assert.equal(bytes.length, expected.bytes ?? bytes.length, 'CURRENT_SOURCE_BYTES');
      assert.equal(digest(bytes), expected.sha256, 'CURRENT_SOURCE_PIN');
    }
    return bytes;
  } finally { closeSync(fd); }
}

export function hasAdoptedSourceGeneration() {
  assert.equal(arguments.length, 0);
  return existsSync(join(projectRoot, adoptionPath));
}

/** All inputs come from the reviewed adoption record, never an HTTP request.
 * A source check grants no custody handle, signing permit or proof authority. */
export function assertAdoptedSourceGeneration() {
  assert.equal(arguments.length, 0);
  const adoptionBytes = regular(adoptionPath);
  const adoption = jsonRecord(adoptionBytes);
  assert.equal(adoption.schema, 'LIANUM_ADOPTED_SOURCE_GENERATION_V1');
  const generation = hash(adoption.generation), candidateSHA256 = hash(adoption.candidateSHA256);
  const base = '.local/generations/' + generation;
  const sourceBytes = regular(base + '/sources.json', {sha256: generation});
  const sources = jsonRecord(sourceBytes);
  assert.equal(sources.schema, 'LIANUM_DEVELOPMENT_SOURCE_GENERATION_V1');
  const candidateBytes = regular(base + '/candidate-release.json', {sha256: candidateSHA256});
  const candidate = jsonRecord(candidateBytes);
  assert.equal(candidate.schema, 'LIANUM_DEVELOPMENT_RELEASE_CANDIDATE_V7');
  assert.equal(candidate.sourceGeneration, generation);
  assert.equal(record(candidate.artifactInspection).status, 'VERIFIED_RETAINED_ARTIFACTS');
  const contract = record(sources.currentSourceContract), sourceSHA256 = hash(contract.sourceClosureSHA256);
  assert.equal(candidate.currentSourceClosureSHA256, sourceSHA256);
  assert.ok(Array.isArray(contract.files) && contract.files.length > 0 && contract.files.length <= 8192);
  const files = /** @type {unknown[]} */ (contract.files);
  const seen = new Set();
  /** @type {Map<string, Readonly<{source: string, sourceSHA256: string}>>} */
  const sourceFiles = new Map();
  for (const value of files) {
    const row = record(value);
    assert.ok(typeof row.path === 'string' && typeof row.source === 'string', 'CURRENT_SOURCE_PATH');
    assert.ok(typeof row.bytes === 'number' && Number.isSafeInteger(row.bytes) && row.bytes >= 0,
      'CURRENT_SOURCE_BYTE_COUNT');
    assert.ok(!seen.has(row.path), 'CURRENT_SOURCE_DUPLICATE');
    seen.add(row.path);
    const sourceHash = hash(row.sourceSHA256);
    regular(row.source, {sha256: sourceHash});
    sourceFiles.set(row.source, Object.freeze({source: row.source, sourceSHA256: sourceHash}));
    if (row.path !== row.source) regular(row.path, {bytes: row.bytes, sha256: hash(row.sha256)});
  }
  assert.deepEqual(regular(adoptionPath), adoptionBytes, 'CURRENT_SOURCE_ADOPTION_CHANGED');
  assert.deepEqual(regular(base + '/sources.json'), sourceBytes, 'CURRENT_SOURCE_GENERATION_CHANGED');
  assert.deepEqual(regular(base + '/candidate-release.json'), candidateBytes, 'CURRENT_SOURCE_CANDIDATE_CHANGED');
  return Object.freeze({generation, sourceSHA256,
    sources: files.length, pagedManifestSHA256: hash(record(candidate.pagedReuseReceipt).manifestSHA256),
    sourceFiles: Object.freeze([...sourceFiles.values()])});
}
