import { compile, createFileManager } from '@noir-lang/noir_wasm';
import { Barretenberg, BackendType } from '@aztec/bb.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { shaHex } from './encoding.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
globalThis.fetch = async () => { throw new Error('PC15_COMPILE_MUST_BE_OFFLINE'); };
const output = root + '.local/compiled/'; mkdirSync(output, { recursive: true });
const records = [];
for (const name of ['authorization', 'official_vector', 'wrong_key']) {
  const start = performance.now();
  const result = await compile(createFileManager(root + 'circuits/' + name), undefined, console.log);
  writeFileSync(output + name + '.json', JSON.stringify(result.program));
  records.push({ name, compilationMilliseconds: performance.now() - start, noirVersion: result.program.noir_version, sourceSHA256: shaHex(readFileSync(root + 'circuits/' + name + '/src/main.nr')), compressedBytecodeSHA256: shaHex(Buffer.from(result.program.bytecode, 'base64')), abi: result.program.abi });
}
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
try {
  for (const record of records) {
    const program = JSON.parse(readFileSync(output + record.name + '.json'));
    record.stats = await api.circuitStats({ circuit: { name: record.name, bytecode: gunzipSync(Buffer.from(program.bytecode, 'base64')), verificationKey: new Uint8Array() }, includeGatesPerOpcode: true, settings: { ipaAccumulation: false, oracleHashType: 'keccak', disableZk: false, optimizedSolidityVerifier: false } });
    console.log(JSON.stringify({ name: record.name, stats: record.stats, resourceUsage: process.resourceUsage() }));
  }
} finally { await api.destroy(); }
const result = { classification: 'ACTUAL_COMPILER_AND_CONSTRAINT_STATISTICS_NOT_PROOF', node: process.version, engineWarning: 'Historical engine pin 24.14.0; actual runtime differs', backend: 'Wasm', threads: 1, verifierTarget: 'evm', zeroKnowledge: true, records, resourceUsage: process.resourceUsage(), memoryUsage: process.memoryUsage() };
writeFileSync(root + '../../evidence/m15-auth-compile.json', JSON.stringify(result, null, 2) + '\n');
