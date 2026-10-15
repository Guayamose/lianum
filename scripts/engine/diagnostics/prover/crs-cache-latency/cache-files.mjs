/** Write-once public CRS evidence. This module performs no backend operation. */
import assert from 'node:assert/strict';
import {constants,openSync,closeSync,writeFileSync,fsyncSync,fstatSync,readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,dirname,basename,resolve} from 'node:path';
import {root,hash,filePin} from './common.mjs';

export function validateRunDirectory(directory) {
  assert.equal(dirname(resolve(directory)),resolve(root),'CC_CACHE_DIRECTORY_PARENT');
  assert.match(basename(directory),/^run-[A-Za-z0-9_-]{1,100}$/,'CC_CACHE_DIRECTORY_NAME');
  const stat = lstatSync(directory);
  assert.ok(stat.isDirectory() && !stat.isSymbolicLink(),'CC_CACHE_DIRECTORY_TYPE');
  assert.equal(realpathSync(directory),resolve(directory),'CC_CACHE_DIRECTORY_REALPATH');
  assert.equal(stat.uid,process.getuid(),'CC_CACHE_DIRECTORY_OWNER');
  assert.equal(stat.mode & 0o077,0,'CC_CACHE_DIRECTORY_PERMISSIONS');
}
function writeOnce(path,bytes) {
  const fd = openSync(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o444);
  try { writeFileSync(fd,bytes); fsyncSync(fd); }
  finally { closeSync(fd); }
  const directory = openSync(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY);
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
function readonlyFile(path,expected) {
  const stat = lstatSync(path);
  assert.ok(stat.isFile() && !stat.isSymbolicLink(),'CC_CACHE_FILE_TYPE');
  assert.equal(stat.uid,process.getuid(),'CC_CACHE_FILE_OWNER');
  assert.equal(stat.mode & 0o222,0,'CC_CACHE_WRITEABLE');
  assert.equal(stat.nlink,1,'CC_CACHE_HARDLINK');
  return filePin(path,expected);
}
export function writeDerivedCache(directory,points,sourceLineage) {
  validateRunDirectory(directory);
  assert.ok(points instanceof Uint8Array,'CC_DERIVED_BYTES');
  assert.equal(points.length,134217728,'CC_DERIVED_SIZE');
  const cache = {bytes:points.length,sha256:hash(points)};
  cache.file = 'bn254_g1_uncompressed-'+cache.sha256+'.dat';
  writeOnce(join(directory,cache.file),points);
  readonlyFile(join(directory,cache.file),cache);
  const record = {
    classification:'PUBLIC_CRS_ONLY_OFFICIAL_COMPRESSED_RESPONSE_DERIVATION_NOT_PROOF',
    schemaVersion:1,createdAt:new Date().toISOString(),
    method:'bb.js5.2.0 Barretenberg.new explicit Wasm; srsInitSrs(compressed).pointsBuf',
    sourceLineage,cache,
    safety:'Write-once content-addressed read-only file; SHA256 and original full CRS pins rechecked before use. This is not an OS immutable or tamper-proof claim.',
  };
  const bytes = Buffer.from(JSON.stringify(record,null,2)+'\n');
  writeOnce(join(directory,'derivation.json'),bytes);
  const derivation = readonlyFile(join(directory,'derivation.json'),{bytes:bytes.length,sha256:hash(bytes)});
  return {derivationSHA256:derivation.sha256,derivationBytes:derivation.bytes,cache};
}
export function readDerivedCache(directory,expectedSHA256,expectedLineage,loadPoints=true) {
  validateRunDirectory(directory);
  assert.match(expectedSHA256,/^[0-9a-f]{64}$/,'CC_DERIVATION_PIN');
  const path = join(directory,'derivation.json');
  assert.ok(lstatSync(path).size > 0 && lstatSync(path).size <= 65536,'CC_DERIVATION_SIZE');
  const derivation = readonlyFile(path,{sha256:expectedSHA256});
  const recordBytes = readFileSync(path);
  assert.equal(hash(recordBytes),expectedSHA256,'CC_DERIVATION_CHANGED');
  const record = JSON.parse(recordBytes);
  assert.equal(record.schemaVersion,1,'CC_DERIVATION_VERSION');
  assert.equal(record.classification,'PUBLIC_CRS_ONLY_OFFICIAL_COMPRESSED_RESPONSE_DERIVATION_NOT_PROOF','CC_DERIVATION_KIND');
  if (expectedLineage) assert.deepEqual(record.sourceLineage,expectedLineage,'CC_DERIVATION_LINEAGE');
  assert.equal(record.cache.bytes,134217728,'CC_DERIVED_SIZE');
  assert.match(record.cache.sha256,/^[0-9a-f]{64}$/,'CC_DERIVED_PIN');
  assert.equal(record.cache.file,'bn254_g1_uncompressed-'+record.cache.sha256+'.dat','CC_CONTENT_ADDRESSED_FILENAME');
  const cachePath = join(directory,record.cache.file);
  readonlyFile(cachePath,record.cache);
  let points;
  if (loadPoints) {
    const fd = openSync(cachePath,constants.O_RDONLY|constants.O_NOFOLLOW);
    try {
      const before = fstatSync(fd,{bigint:true});
      points = readFileSync(fd);
      const after = fstatSync(fd,{bigint:true});
      assert.equal(before.size,after.size,'CC_CACHE_CHANGED'); assert.equal(before.mtimeNs,after.mtimeNs,'CC_CACHE_CHANGED');
      assert.equal(before.ino,after.ino,'CC_CACHE_CHANGED');
    } finally { closeSync(fd); }
    assert.equal(points.length,record.cache.bytes,'CC_DERIVED_SIZE');
    assert.equal(hash(points),record.cache.sha256,'CC_DERIVED_PIN');
  }
  return {points,record,reference:{derivationSHA256:derivation.sha256,derivationBytes:derivation.bytes,cache:record.cache}};
}
