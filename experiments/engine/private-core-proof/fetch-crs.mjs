import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shaHex } from './encoding.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const points = 131072;
const stats = JSON.parse(readFileSync(root + '../../evidence/m15-auth-compile.json'));
assert.equal(stats.records.find(r => r.name === 'authorization').stats.numGatesDyadic, points);
const loader = readFileSync(root + 'node_modules/@aztec/bb.js/src/crs/net_crs.ts');
assert.ok(loader.toString().includes("const CRS_PRIMARY_HOST = 'https://crs.aztec-cdn.foundation'"));
const cache = root + '.local/crs/' + points; mkdirSync(cache, { recursive: true });
const records = [];
for (const [remote, file, length, expectedSHA256] of [
  ['g1_compressed.dat', 'bn254_g1_compressed.dat', points * 32, 'fad8203ae1fd103658d4bb33b2b4cf126a28352b5de4684737cff23cc15fb94b'],
  ['g2.dat', 'bn254_g2.dat', 128, '01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f'],
]) {
  const url = 'https://crs.aztec-cdn.foundation/' + remote;
  const range = remote.startsWith('g1') ? `bytes=0-${length - 1}` : null;
  const response = await fetch(url, { headers: range ? { Range: range } : {}, redirect: 'error', signal: AbortSignal.timeout(60000) });
  assert.equal(response.status, range ? 206 : 200);
  if (range) assert.match(response.headers.get('content-range'), new RegExp(`^bytes 0-${length - 1}/[0-9]+$`));
  let total = 0; const chunks = [];
  for await (const chunk of response.body) { total += chunk.length; assert.ok(total <= length); chunks.push(chunk); }
  const data = Buffer.concat(chunks); assert.equal(data.length, length); assert.equal(shaHex(data), expectedSHA256);
  writeFileSync(cache + '/' + file, data);
  records.push({ url, file, requestedRange: range, httpStatus: response.status, contentRange: response.headers.get('content-range'), bytes: length, sha256: expectedSHA256 });
}
const result = { classification: 'OFFICIAL_PUBLIC_BN254_CRS_NOT_PROOF', fetchedAt: new Date().toISOString(), points, bbVersion: '5.2.0', officialLoaderSHA256: shaHex(loader), trust: 'Matches historical official CDN byte pins; does not independently audit ceremony or toxic-waste assumption', records };
writeFileSync(cache + '/provenance.json', JSON.stringify(result, null, 2) + '\n');
writeFileSync(root + '../../evidence/m15-auth-crs.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
