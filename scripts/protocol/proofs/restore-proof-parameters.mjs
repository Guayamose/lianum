/** Restore exact previously pinned public parameters; never downloads executables. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, statfsSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRIVATE_RESOURCE_FLOORS } from '../../../packages/protocol/src/crypto/private-resource-policy.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const experiment = root + 'experiments/private-core-proof/';
const directory = experiment + 'native-notes/.local/crs/2097152/';
const sha = value => createHash('sha256').update(value).digest('hex');
const loader = readFileSync(experiment + 'node_modules/@aztec/bb.js/src/crs/net_crs.ts');
assert.equal(sha(loader), '6c89e28caa3aaca2d2cc5d65c18d2ea60245254716898c26d68aef553fe4f271', 'OFFICIAL_CRS_LOADER_PIN');
const expected = [
  {
    url: 'https://crs.aztec-cdn.foundation/g1_compressed.dat',
    requestedRange: 'bytes=0-67108863',
    httpStatus: 206,
    bytes: 67108864,
    sha256: '3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37',
    file: 'bn254_g1_compressed.dat',
  },
  {
    url: 'https://crs.aztec-cdn.foundation/g2.dat',
    requestedRange: null,
    httpStatus: 200,
    bytes: 128,
    sha256: '01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f',
    file: 'bn254_g2.dat',
  },
];
function guard() {
  const availableRAM = Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) * 1024;
  const disk = statfsSync(root);
  assert.ok(availableRAM >= PRIVATE_RESOURCE_FLOORS.availableRAM, 'CRS_RAM_FLOOR');
  assert.ok(disk.bavail * disk.bsize >= PRIVATE_RESOURCE_FLOORS.freeDisk, 'CRS_DISK_FLOOR');
}
const report = {
  classification: 'RESTORED_IDENTICAL_PUBLIC_CRS_NOT_PROOF',
  fetchedAt: new Date().toISOString(),
  points: 2097152,
  officialLoaderSHA256: sha(loader),
  historicalReference: 'evidence/m15-notes-crs.json',
  records: [],
};
mkdirSync(directory, { recursive: true });
for (const record of expected) {
  guard();
  if (existsSync(directory + record.file)) {
    const existing = readFileSync(directory + record.file);
    assert.equal(existing.length, record.bytes, 'EXISTING_CRS_EXACT_SIZE');
    assert.equal(sha(existing), record.sha256, 'EXISTING_CRS_EXACT_HASH');
    report.records.push({ ...record, httpStatus: null, retrieval: 'verified-existing-bytes' });
    continue;
  }
  const response = await fetch(record.url, {
    headers: record.requestedRange ? { Range: record.requestedRange } : {},
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, record.httpStatus, 'CRS_HTTP_STATUS');
  let bytes = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    guard();
    bytes += chunk.length;
    assert.ok(bytes <= record.bytes, 'CRS_RESPONSE_SIZE_LIMIT');
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  assert.equal(data.length, record.bytes, 'CRS_EXACT_SIZE');
  assert.equal(sha(data), record.sha256, 'CRS_EXACT_HASH');
  writeFileSync(directory + record.file, data);
  report.records.push({ ...record, retrieval: 'new-exact-verified-fetch', contentRange: response.headers.get('content-range') });
}
writeFileSync(directory + 'provenance.json', JSON.stringify(report, null, 2) + '\n');
writeFileSync(root + '.local/development/restored-crs.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ points: report.points, verifiedFiles: report.records.map(({ file, bytes, sha256 }) => ({ file, bytes, sha256 })) }));
