import { createFileManager, compile } from '../node_modules/@noir-lang/noir_wasm/dist/web/main.mjs';
import { Barretenberg, BackendType } from '@aztec/bb.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
const root = fileURLToPath(new URL('.', import.meta.url));
process.on('uncaughtException', error => { console.error(error.message); process.exit(1); });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => { if (!String(input).startsWith('data:')) throw new Error('Offline compilation only'); return originalFetch(input, options); };
const fm = createFileManager('/qb');
for (const file of ['Nargo.toml', 'src/main.nr', 'src/sha256.nr', 'src/wire.nr']) {
  const bytes = readFileSync(resolve(root, 'circuits/quote_binding', file));
  await fm.writeFile(file, new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }));
}
const start = performance.now();
const result = await compile(fm, undefined, message => console.log(message));
const out = resolve(root, '../.local/qb'); mkdirSync(out, { recursive: true });
writeFileSync(resolve(out, 'circuit.json'), JSON.stringify(result.program));
console.log(JSON.stringify({ compiled: true, milliseconds: performance.now() - start, noirVersion: result.program.noir_version }));
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
try {
  const stats = await api.circuitStats({ circuit: { name: 'pc5-quote-binding', bytecode: gunzipSync(Buffer.from(result.program.bytecode, 'base64')), verificationKey: new Uint8Array() }, includeGatesPerOpcode: false, settings: { ipaAccumulation: false, oracleHashType: 'poseidon2', disableZk: false, optimizedSolidityVerifier: false } });
  const record = { classification: 'COMPILED_APPLICATION_SUBRELATION_STATISTICS_NOT_PROOF', ...stats, compilationMilliseconds: performance.now() - start, resourceUsage: process.resourceUsage() };
  writeFileSync(resolve(root, '../../../evidence/m8-qb-circuit-stats.json'), JSON.stringify(record, null, 2) + '\n'); console.log(JSON.stringify(record));
} finally { await api.destroy(); }
