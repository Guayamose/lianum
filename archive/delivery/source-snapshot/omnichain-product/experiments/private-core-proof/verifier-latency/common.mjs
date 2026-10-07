/** Isolated verification-only experiment. Import performs no backend operation. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, statfsSync, openSync, readSync, closeSync, fstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

export const root = fileURLToPath(new URL('.', import.meta.url));
export const project = fileURLToPath(new URL('../../../', import.meta.url));
export const hash = value => createHash('sha256').update(value).digest('hex');
export const floors = Object.freeze({availableRAM:3 * 1024 ** 3, freeDisk:5 * 1024 ** 3});
export const limits = Object.freeze({sampleMilliseconds:250, childTimeoutMilliseconds:300000, terminateGraceMilliseconds:5000});
export const modes = Object.freeze({
  fulfill: {target:'evm', publicInputCount:65, proofBytes:10688, wrongKeyMode:'refund',
    proof:'evidence/m23-shared-wallet-retained-result/2026-10-03T09-24-29-226Z/fulfill-1.proof',
    inputs:'evidence/m23-shared-wallet-retained-result/2026-10-03T09-24-29-226Z/fulfill-1.public-inputs.json',
    publicInputsSHA256:'85d1ef8c2440ab3941bfbeae92357b8bd784f09b9fcc84fca0567ad431620292'},
  authorization: {target:'noir-recursive', publicInputCount:81, proofBytes:14656, wrongKeyMode:'sol_local',
    proof:'evidence/m18-capability/2026-10-02T21-10-05-406Z/static-authorization/proof.bin',
    inputs:'evidence/m18-capability/2026-10-02T21-10-05-406Z/static-authorization/public-inputs.json',
    publicInputsSHA256:'8a8e2dced83c08c0cd259b8c2fc1d0ead61b4aa70a1330f8e5bd03bd9016db0b'},
});
export const capability = Object.freeze({
  current:'evidence/m18-readiness-v2-2026-10-02T22-08-20-126Z.json',
  currentSHA256:'6e376e351e5efbf726cb02ad5034e31157a374c68e237862ec923aeea7484672',
  original:'evidence/m18-capability-2026-10-02T21-10-05-406Z.json',
  originalSHA256:'3e291b6b47c258ec8e196e14d160a81facc83906a845f1fd292d489e64741e92',
  originalRun:'2026-10-02T21-10-05-406Z',
});
export function resources() {
  const disk = statfsSync(project), memory = process.memoryUsage();
  const match = /MemAvailable:\s+(\d+)\s+kB/.exec(readFileSync('/proc/meminfo','utf8'));
  assert.ok(match,'VL_MEMAVAILABLE_REQUIRED');
  return {availableRAM:Number(match[1]) * 1024, freeDisk:disk.bavail * disk.bsize,
    rss:memory.rss, heapUsed:memory.heapUsed, external:memory.external, arrayBuffers:memory.arrayBuffers};
}
export function guard() {
  const value = resources();
  assert.ok(value.availableRAM >= floors.availableRAM,'VL_AVAILABLE_RAM_FLOOR');
  assert.ok(value.freeDisk >= floors.freeDisk,'VL_DISK_FLOOR');
  return value;
}
export function filePin(path, expected) {
  const fd = openSync(path,'r'), chunk = Buffer.alloc(64 * 1024);
  try {
    const before = fstatSync(fd,{bigint:true}), digest = createHash('sha256');
    assert.ok(before.isFile(),'VL_FILE_REQUIRED');
    let bytes = 0, count, maximumChunkBytes = 0;
    while ((count = readSync(fd,chunk,0,chunk.length,null)) > 0) {
      bytes += count; maximumChunkBytes = Math.max(maximumChunkBytes,count); digest.update(chunk.subarray(0,count));
    }
    const after = fstatSync(fd,{bigint:true});
    assert.equal(after.size,before.size,'VL_FILE_CHANGED');
    assert.equal(after.mtimeNs,before.mtimeNs,'VL_FILE_CHANGED');
    assert.equal(BigInt(bytes),before.size,'VL_FILE_SIZE');
    const result = {bytes,sha256:digest.digest('hex'),maximumChunkBytes};
    if (expected) {
      assert.equal(result.sha256,expected.sha256,'VL_FILE_HASH');
      if (expected.bytes !== undefined) assert.equal(bytes,expected.bytes,'VL_FILE_SIZE');
    }
    return result;
  } finally { chunk.fill(0); closeSync(fd); }
}
export function verifyManifest() {
  const manifest = JSON.parse(readFileSync(join(root,'pins.json')));
  assert.equal(manifest.officialBarretenbergVersion,'5.2.0','VL_TOOLCHAIN_VERSION');
  assert.equal(manifest.officialSourceCommit,'49a592109ec4f18d79212b43d621891aaf36f7b6','VL_SOURCE_COMMIT');
  for (const [path,pin] of Object.entries(manifest.files)) {
    assert.ok(!path.startsWith('/') && !path.split('/').includes('..'),'VL_MANIFEST_PATH');
    filePin(join(project,path),pin);
  }
  return manifest;
}
export function safeError(error) {
  const firstLine = String(error?.message ?? '').split('\n',1)[0];
  return {name:/^[A-Za-z]{1,40}$/.test(error?.name ?? '') ? error.name : 'Error',
    code:/^(?:VL_|PC18_|PC23_)[A-Z0-9_]+$/.test(firstLine) ? firstLine : 'VL_OPERATION_FAILED'};
}
