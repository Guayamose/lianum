import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { createFileManager, compile } from '../audits/node_modules/@noir-lang/noir_wasm/dist/web/main.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { H } from './wire.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
process.on('uncaughtException', error => { console.error(error.message); process.exit(1); });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => { if (!String(input).startsWith('data:')) throw new Error('Offline KAT compilation'); return originalFetch(input, options); };
const vectors = [
  { name: 'RFC6234-SHA256-1', message: Buffer.from('abc'), digest: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad', official: true },
  { name: 'RFC6234-SHA256-2', message: Buffer.from('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), digest: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1', official: true },
  { name: 'RFC6234-SHA256-4', message: Buffer.from('0123456701234567012345670123456701234567012345670123456701234567'.repeat(10)), digest: '594847328451bdfa85056225462cc1d867d877fb388df0ce35f25ab5562bfbb5', official: true },
  { name: 'RFC6234-SHA256-6', message: Buffer.from([0x19]), digest: '68aa2e2ee5dff96e3355e6c7ee373e3d6a4e17f75f9518d843709c0c9bc3e3d4', official: true },
  ...[0, 55, 63, 64, 65, 58, 337, 344, 538].map(length => { const message = Buffer.from(Array.from({ length }, (_, i) => (i * 13 + 7) % 256)); return { name: 'Node-independent-boundary-' + length, message, digest: H(message).toString('hex'), official: false }; }),
];
for (const v of vectors) assert.equal(H(v.message).toString('hex'), v.digest, 'Official known answer mismatch');
const fm = createFileManager('/sha-kat');
const main = 'mod sha256;\nfn main(' + vectors.map((v, i) => (v.message.length ? `m${i}: [u8; ${v.message.length}], ` : '') + `h${i}: [u8; 32]`).join(', ') + ') {\n' + vectors.map((v, i) => `assert(sha256::digest(${v.message.length ? 'm' + i : '[0; 0]'}) == h${i});`).join('\n') + '\n}\n';
for (const [file, bytes] of [['Nargo.toml', Buffer.from('[package]\nname="sha_kat"\ntype="bin"\nauthors=[]\n[dependencies]\n')], ['src/main.nr', Buffer.from(main)], ['src/sha256.nr', readFileSync(resolve(root, 'circuits/quote_binding/src/sha256.nr'))]]) await fm.writeFile(file, new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }));
const { program } = await compile(fm);
const noir = new Noir(program), input = {};
vectors.forEach((v, i) => { if (v.message.length) input['m' + i] = [...v.message]; input['h' + i] = [...Buffer.from(v.digest, 'hex')]; });
await noir.execute(input);
const negatives = [];
for (let i = 0; i < vectors.length; i++) {
  const changed = structuredClone(input); changed['h' + i][0] ^= 1;
  await assert.rejects(noir.execute(changed), /Cannot satisfy constraint/);
  negatives.push({ name: vectors[i].name + '-changed-digest', rejected: true, provenance: 'locally derived mutation; not an official negative vector' });
}
const report = { classification: 'SHA256_KNOWN_ANSWER_AND_DERIVED_NEGATIVE_WITNESS_CHECKS_NOT_PROOFS', officialSource: 'https://www.rfc-editor.org/rfc/rfc6234.html#section-8.5', officialPositiveCount: 4, independentBoundaryCount: 9, vectors: vectors.map(v => ({ name: v.name, messageHex: v.message.toString('hex'), digest: v.digest, official: v.official })), negatives, proofCount: 0 };
writeFileSync(resolve(root, '../../../evidence/m8-sha256-vectors.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ officialPositive: 4, additionalBoundaries: 9, derivedNegative: negatives.length, proofsGenerated: 0 }));
