import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const points = Number(process.argv[2]);
assert.ok(Number.isInteger(points) && points > 0 && points <= 2 ** 21);
assert.equal(points % 131072, 0, 'bb.js 5.2.0 compressed SRS requires complete 4 MiB blocks');
const approvedG1 = {
  131072: 'fad8203ae1fd103658d4bb33b2b4cf126a28352b5de4684737cff23cc15fb94b',
  2097152: '3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37',
};
assert.ok(approvedG1[points], 'Only the two reviewed CRS sizes are supported');
const sourcePath = resolve(root, 'node_modules/@aztec/bb.js/src/crs/net_crs.ts');
const source = readFileSync(sourcePath);
assert.ok(source.toString().includes("const CRS_PRIMARY_HOST = 'https://crs.aztec-cdn.foundation'"));
const hash = b => createHash('sha256').update(b).digest('hex');
const cache = resolve(root, '.local/crs', String(points));
mkdirSync(cache, { recursive: true });
const records = [];
for (const item of [
  { remote: 'g1_compressed.dat', local: 'bn254_g1_compressed.dat', size: points * 32, range: true },
  { remote: 'g2.dat', local: 'bn254_g2.dat', size: 128, range: false },
]) {
  const url = 'https://crs.aztec-cdn.foundation/' + item.remote;
  const headers = item.range ? { Range: `bytes=0-${item.size - 1}` } : {};
  const response = await fetch(url, { headers, redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, item.range ? 206 : 200, `Unexpected response for ${item.remote}`);
  if (item.range) assert.match(response.headers.get('content-range') ?? '', new RegExp(`^bytes 0-${item.size - 1}/[0-9]+$`));
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    assert.ok(length <= item.size, 'CRS response exceeded the exact requested bound');
    chunks.push(chunk);
  }
  assert.equal(length, item.size);
  const bytes = Buffer.concat(chunks);
  assert.equal(hash(bytes), item.range ? approvedG1[points] : '01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f', 'CRS bytes differ from the retained M7 download');
  writeFileSync(resolve(cache, item.local), bytes);
  records.push({ url, requestedRange: headers.Range ?? null, httpStatus: response.status, contentRange: response.headers.get('content-range'), etag: response.headers.get('etag'), bytes: length, sha256: hash(bytes), file: item.local });
  console.log(JSON.stringify({ downloaded: item.remote, bytes: length, sha256: hash(bytes) }));
}
const provenance = { classification: 'PUBLIC_CRS_BYTES_FROM_PINNED_OFFICIAL_LOADER_HOST', downloadedAt: new Date().toISOString(), bbVersion: '5.2.0', points, officialLoaderSourceSHA256: hash(source), sourceURL: 'https://github.com/AztecProtocol/aztec-packages/blob/v5.2.0/barretenberg/ts/src/crs/net_crs.ts', trust: 'HTTPS official source and recorded byte hashes; ceremony transcript and toxic-waste assumptions are not independently verified by this download', records };
writeFileSync(resolve(cache, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');
writeFileSync(resolve(root, '../../evidence', `m7-crs-${points}.json`), JSON.stringify(provenance, null, 2) + '\n');
