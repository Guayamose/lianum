/** Read-only evidence under the already-owned original Java child's scratch.
 * No RPC, clock change, DB write or runtime capability is created here. */
import assert from 'node:assert/strict';
import { readFile, readdir, lstat, realpath, readlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, basename } from 'node:path';
const sha = value => createHash('sha256').update(value).digest('hex');
const ROCKS_SHA256 = 'a0be18d4ba46f4e68ea762050b68c9958e208599c1480040526cc37400fb01af';
const REQUIRED_STORES = ['account', 'properties', 'tmp'];
export function assertTronAlignedRocksDbLibraryEvidence(rows) {
  assert.equal(arguments.length, 1);
  assert.ok(Array.isArray(rows) && rows.length === 1, 'TRON_ALIGNED_ONLY_ORIGINAL_ROCKSDB_JNI');
  const row = rows[0]; assert.equal(row.kind, 'ROCKSDB');
  assert.equal(row.sha256, ROCKS_SHA256, 'TRON_ALIGNED_LOADED_ROCKSDB_BINARY_PIN');
  assert.equal(row.bytes, 8412693); assert.equal(row.ownedPrivateScratch, true);
  assert.equal(row.mappedByOriginalJavaChild, true);
  assert.match(basename(row.path), /^librocksdbjni[^/]*\.so$/);
}
async function ownedRegular(path) {
  assert.equal(await realpath(path), path, 'TRON_ALIGNED_NATIVE_AUDIT_NO_SYMLINK');
  const info = await lstat(path);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.uid === process.getuid(), 'TRON_ALIGNED_NATIVE_AUDIT_OWNED_FILE');
  return { info, bytes: await readFile(path) };
}
export async function captureTronAlignedRocksDbNativeAudit(directory, identity) {
  assert.equal(arguments.length, 2, 'TRON_ALIGNED_NATIVE_AUDIT_NO_OPTIONS');
  const original = join('/proc', String(identity.pid));
  const text = await readFile(join(original, 'stat'), 'utf8'), fields = text.slice(text.lastIndexOf(') ') + 2).split(/\s+/);
  assert.equal(fields[19], identity.start); assert.equal(Number(fields[1]), identity.parent);
  assert.equal(Number(fields[2]), identity.group); assert.equal(Number(fields[3]), identity.session);
  const statusBefore = await readFile(join(original, 'status'), 'utf8');
  const uidBefore = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(statusBefore);
  assert.ok(uidBefore, 'TRON_ALIGNED_NATIVE_AUDIT_UID4_REQUIRED');
  assert.deepEqual(uidBefore.slice(1).map(Number), Array(4).fill(process.getuid()));
  assert.deepEqual(identity.uids, Array(4).fill(process.getuid()));
  assert.equal((await lstat(original)).uid, process.getuid());
  assert.equal(await readlink(join(original, 'exe')), identity.executable);
  assert.ok(identity.executable.endsWith('/jdk8/bin/java'), 'TRON_ALIGNED_AUDIT_ORIGINAL_JAVA');
  assert.equal(await realpath(directory), directory);
  const temporary = join(directory, 'jni-tmp'); assert.equal(await realpath(temporary), temporary);
  const argumentsActual = (await readFile(join(original, 'cmdline'))).toString('utf8').split('\0').filter(Boolean);
  assert.ok(argumentsActual.includes('-Djava.io.tmpdir=' + temporary), 'TRON_ALIGNED_ACTUAL_OWNED_JAVA_TMP');
  assert.equal(argumentsActual.filter(value => value.startsWith('-Djava.io.tmpdir=')).length, 1);
  const maps = await readFile(join(original, 'maps')); assert.ok(maps.length <= 1048576, 'TRON_ALIGNED_MAPS_BOUND');
  try {
  const mapped = [...new Set(maps.toString('utf8').trim().split('\n').map(line => {
    const match = /^[0-9a-f]+-[0-9a-f]+\s+\S+\s+\S+\s+\S+\s+\S+\s+(.+)$/.exec(line);
    return match?.[1] ?? '';
  }).filter(path => /(?:librocksdbjni|libleveldbjni)/.test(basename(path))))];
  const libraries = [];
  for (const path of mapped) {
    assert.ok(path.startsWith(temporary + '/') && !path.includes(' (deleted)'), 'TRON_ALIGNED_JNI_LIBRARY_OWNED_SCRATCH');
    const { info, bytes } = await ownedRegular(path);
    libraries.push({ kind: basename(path).startsWith('librocksdbjni') ? 'ROCKSDB' : 'LEVELDB', path,
      bytes: info.size, sha256: sha(bytes), ownedPrivateScratch: true, mappedByOriginalJavaChild: true });
  }
  assertTronAlignedRocksDbLibraryEvidence(libraries);
  const database = join(directory, 'output-directory/database');
  assert.equal(await realpath(database), database, 'TRON_ALIGNED_DATABASE_FIXED_PATH');
  const stores = [];
  const names = await readdir(database); assert.ok(names.length <= 256, 'TRON_ALIGNED_STORE_DIRECTORY_BOUND');
  for (const name of REQUIRED_STORES) {
    assert.ok(names.includes(name), 'TRON_ALIGNED_REQUIRED_REAL_STORE');
    const path = join(database, name, 'engine.properties'); const { info, bytes } = await ownedRegular(path);
    assert.ok(info.size > 0 && info.size <= 4096, 'TRON_ALIGNED_ENGINE_MARKER_BOUND');
    const values = bytes.toString('utf8').split(/\r?\n/).filter(line => !/^\s*(?:[#!]|$)/.test(line));
    assert.equal(values.length, 1, 'TRON_ALIGNED_ENGINE_SINGLE_PROPERTY');
    assert.match(values[0], /^ENGINE\s*[=:]\s*ROCKSDB\s*$/, 'TRON_ALIGNED_REAL_STORE_ROCKSDB');
    stores.push({ name, engine: 'ROCKSDB', bytes: bytes.length, sha256: sha(bytes) });
  }
  const config = await ownedRegular(join(directory, 'private-node.conf'));
  assert.ok(config.bytes.length <= 65536, 'TRON_ALIGNED_PRIVATE_CONFIGURATION_BOUND');
  const configuration = config.bytes.toString('utf8');
  assert.equal(configuration.split('db.engine="ROCKSDB"').length - 1, 1);
  assert.equal(configuration.split('timestamp="1749999999000"').length - 1, 1);
  const after = await readFile(join(original, 'stat'), 'utf8'), afterFields = after.slice(after.lastIndexOf(') ') + 2).split(/\s+/);
  assert.equal(afterFields[19], identity.start); assert.equal(Number(afterFields[1]), identity.parent);
  assert.equal(Number(afterFields[2]), identity.group); assert.equal(Number(afterFields[3]), identity.session);
  assert.equal((await lstat(original)).uid, process.getuid());
  const statusAfter = await readFile(join(original, 'status'), 'utf8');
  const uidAfter = /^Uid:\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/m.exec(statusAfter);
  assert.ok(uidAfter, 'TRON_ALIGNED_NATIVE_AUDIT_UID4_REQUIRED');
  assert.deepEqual(uidAfter.slice(1).map(Number), identity.uids);
  assert.equal(await readlink(join(original, 'exe')), identity.executable);
  return { maps, evidence: { format: 'LIANUM_TRON_ALIGNED_ROCKSDB_NATIVE_AUDIT_V1', originalIdentity: { ...identity, uid: process.getuid(), group: Number(fields[2]), session: Number(fields[3]) },
    javaTmpDirectoryOwned: true, effectiveArgv: argumentsActual, mapsBytes: maps.length, mapsSHA256: sha(maps),
    libraries, stores, configuredStorageEngine: 'ROCKSDB', configuredGenesisTimestampMs: '1749999999000',
    orderlyNativeShutdownEstablished: false } };
  } catch (error) {
    // Retain only already-authenticated, bounded private maps on a rejected engine/JNI audit.
    error.alignedPrivateMaps = maps; throw error;
  }
}
