import {currentNoirCompilerV1} from './current-run-paths-v1.mjs';
const {compile,createFileManager}=await currentNoirCompilerV1();
import {currentProofLibrariesV1,currentProbePathsV1} from './current-run-paths-v1.mjs';
const {Barretenberg, BackendType}=await currentProofLibrariesV1();
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const paths=currentProbePathsV1(process.argv[3]);
const root=paths.source;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  if (!String(input).startsWith('data:')) throw new Error('Compilation/statistics must be offline');
  return originalFetch(input, options); // Embedded WASM data, never an HTTP request.
};
mkdirSync(resolve(paths.compiled, ''), { recursive: true });
const name = process.argv[2] ?? 'arithmetic_sha256';
if (!/^[a-z][a-z_0-9]+$/.test(name)) throw new Error('Invalid circuit name');
const start = performance.now();
let fm = createFileManager(resolve(root, 'circuits', name));
// beta.25's Node file manager joins enumerated paths with '/' while the
// compiler entrypoint uses node:path.join. Normalize the public FileManager
// readdir results on Windows; no installed package/compiler bytes are edited.
const readdir = fm.readdir.bind(fm);
fm.readdir = async (...args) => (await readdir(...args)).map(path => normalize(path));
let selectedCompile = compile;
if (name === 'recursive_join') {
  // The Rust WASM module resolver interprets native Windows module paths as
  // POSIX paths. Use the same package's official browser bundle/memory FS;
  // no compiler/package patches, process-wide path overrides or HTTP fetches.
  const browser = await currentNoirCompilerV1(true);
  fm = browser.createFileManager('/pc5');
  selectedCompile = browser.compile;
  for (const file of ['Nargo.toml', 'src/main.nr', 'src/approved_vk.nr', 'src/bb_proof_verification.nr']) {
    const bytes = readFileSync(resolve(root, 'circuits', name, file));
    await fm.writeFile(file, new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }));
  }
}
const result = await selectedCompile(fm, undefined, message => void message);
writeFileSync(resolve(paths.compiled, '', name + '.json'), JSON.stringify(result.program));
console.log(JSON.stringify({ stage: 'compiled-not-proved', name, milliseconds: performance.now() - start, noirVersion: result.program.noir_version, publicParameterCount:result.program.abi.parameters.filter(v=>v.visibility==='public').length }));
// Statistics only: no proving/verifying call and no CRS network request here.
const api = await Barretenberg.new({ backend: BackendType.Wasm, threads: 1, skipSrsInit: true, memory: { initial: 37, maximum: 32768 }, logger: () => {} });
try {
  const stats = await api.circuitStats({ circuit: { name, bytecode: gunzipSync(Buffer.from(result.program.bytecode, 'base64')), verificationKey: new Uint8Array() }, includeGatesPerOpcode: false, settings: { ipaAccumulation: false, oracleHashType: name === 'recursive_join' ? 'keccak' : 'poseidon2', disableZk: false, optimizedSolidityVerifier: false } });
  writeFileSync(resolve(paths.compiled, '', name + '-stats.json'), JSON.stringify(stats, null, 2));
  console.log(JSON.stringify({ stage: 'stats-not-proof', name, stats, resourceUsage: process.resourceUsage() }));
} finally { await api.destroy(); }
