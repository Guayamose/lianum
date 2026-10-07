/** Fixed public rebuild; never manufactures historical acceptance. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, renameSync, realpathSync, lstatSync } from 'node:fs';
import { dirname, join, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as catalogModule from '../../catalog.mjs';
import * as toolsModule from '../../tooling/tooling.mjs';
import * as v3Module from '../metadata/native-ingress-v3-profile.mjs';
import * as compilerModule from '../../tooling/solidity-compiler.mjs';
import * as engineModule from '../../../../engine/src/execution/local/local-deployment.mjs';
export const catalog=catalogModule,tools=toolsModule,v3=v3Module,compiler=compilerModule,engine=engineModule;
export const helpers = await import(tools.resourceModuleURL);
export const DIRECTORY = join(catalog.ROOT, '.local/development-native-claims/v2');
export const PRIOR_DIRECTORY=join(catalog.ROOT,'.local/development-native-claims/v1');
export const PRIOR_MANIFEST_SHA='51dfbfb9414d8694a6de259287353d88ef1a8526952c1af278d31e640c508d57';
export const CO42_SOURCE = '7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5';
export const CO42_KEY = '0cfe032118e9e3d18dd9e4eadc1d738b9ec2116e65c8bed3e35a3db2416a2a83';
export const RETAINED_CONTRACTS = '.local/native-claims-contracts/e3e645b6-9466-4f3c-aab1-4dcaa93b7f51/compiled.json';
export const RETAINED_CONTRACTS_SHA = '263757f0d143276829e9bf21548a67ac7b3931f28fcdd42825a31093c486bda9';
export const STEPS = Object.freeze(['compile-v3', 'prepare-v3', 'constraints', 'contracts']);
export const parse = path => JSON.parse(tools.regular(path));
export function publish(path, bytes) {
  assert.ok(resolve(path).startsWith(DIRECTORY + '/'), 'NATIVE_REBUILD_FIXED_OUTPUT');
  const value = Buffer.from(bytes);
  let ancestor = dirname(path);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  assert.equal(realpathSync(ancestor), ancestor, 'NATIVE_REBUILD_OUTPUT_SYMLINK');
  assert.ok(lstatSync(ancestor).isDirectory());
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  if (existsSync(path)) assert.ok(tools.regular(path).equals(value), 'NATIVE_REBUILD_EXISTING_ARTIFACT_CHANGED');
  else writeFileSync(path, value, { flag: 'wx', mode: 0o600 });
  return tools.hash(value);
}
export const write = (path, value) => publish(path, tools.jsonBytes(value));
/** Noir's entrypoint file_map contains an absolute diagnostic path. Pin every
 * other byte of its public program representation while making this one path
 * independent of the developer's checkout. ACIR/ABI/hash/debug symbols stay exact. */
export function publicProgramSHA256(name,program) {
  const paths={native_claim_ingress_v3:'experiments/native-ingress-v3/circuits/native-claim-ingress-v3/src/main.nr',
    native_claim_discharge:'proof-relations/native-claim-discharge/src/main.nr'};
  assert.ok(Object.hasOwn(paths,name),'NATIVE_REBUILD_FIXED_PROGRAM_RELATION');
  const value=structuredClone(program);let entrypoints=0;
  for(const record of Object.values(value.file_map)) {
    if(record.path.startsWith('/')) {
      assert.ok(record.path.endsWith('/'+paths[name]),'NATIVE_REBUILD_ENTRYPOINT_PATH');
      record.path='wallet/'+paths[name];entrypoints++;
    }
  }
  assert.equal(entrypoints,1,'NATIVE_REBUILD_SINGLE_ENTRYPOINT_PATH');
  return tools.hash(JSON.stringify(value));
}
export function reusePriorV3() {
  if(!existsSync(join(PRIOR_DIRECTORY,'manifest.json')))return;
  const bytes=tools.regular(join(PRIOR_DIRECTORY,'manifest.json'));
  assert.equal(tools.hash(bytes),PRIOR_MANIFEST_SHA,'NATIVE_REBUILD_PRIOR_REVIEWED_BUILD');
  const manifest=JSON.parse(bytes),row=manifest.verifiers[0];
  assert.equal(row.sourceVersion,v3.NATIVE_INGRESS_V3_SOURCE_VERSION);assert.equal(row.keySHA256,v3.NATIVE_INGRESS_V3_KEY_SHA256);
  const original=join(PRIOR_DIRECTORY,'verifiers/native_claim_ingress_v3');
  const expected={'program.json':row.lineage.artifactSHA256,'compiled-manifest.json':row.lineage.compiledManifestSHA256,
    'key.vk':row.keySHA256,'key-manifest.json':row.lineage.keyManifestSHA256,'verifier.sol':row.soliditySHA256};
  for(const [file,pin] of Object.entries(expected)) {
    const bytes=tools.regular(join(original,file));assert.equal(tools.hash(bytes),pin);
    publish(join(DIRECTORY,'verifiers/native_claim_ingress_v3',file),bytes);
  }
}
export function replace(path, value) {
  const temporary = path + '.tmp-' + process.pid;
  publish(temporary, tools.jsonBytes(value));
  if (existsSync(path)) tools.regular(path);
  renameSync(temporary, path);
}
export function identities(toolchain) {
  const legacy = tools.circuitIdentity(catalog.relation('native_claim_ingress'), toolchain);
  const co42 = tools.circuitIdentity(catalog.relation('native_claim_discharge'), toolchain);
  assert.equal(tools.hash(JSON.stringify(co42)), CO42_SOURCE, 'NATIVE_REBUILD_CO42_ORIGINAL_SOURCE');
  const roots = { wallet: catalog.ROOT, flat: catalog.FLAT, golden: catalog.GOLDEN };
  const sources = legacy.sources.filter(file => file.root !== 'wallet'
    || !file.path.startsWith('proof-relations/native-claim-ingress/'));
  for (const path of [
    'experiments/native-ingress-v3/circuits/native-claim-ingress-v3/Nargo.toml',
    'experiments/native-ingress-v3/circuits/native-claim-ingress-v3/src/main.nr',
    'experiments/native-ingress-v3/lib/Nargo.toml',
    'experiments/native-ingress-v3/lib/src/evidence.nr',
    'experiments/native-ingress-v3/lib/src/lib.nr',
  ]) {
    const bytes = tools.regular(join(catalog.ROOT, path));
    sources.push({ root: 'wallet', path, bytes: bytes.length, sha256: tools.hash(bytes) });
  }
  sources.sort((a,b) => resolve(roots[a.root], a.path) < resolve(roots[b.root], b.path) ? -1 : 1);
  const ci51 = { ...legacy, relation: v3.NATIVE_INGRESS_V3_SPEC.name, sources };
  assert.equal(tools.hash(JSON.stringify(ci51)), v3.NATIVE_INGRESS_V3_SOURCE_VERSION,
    'NATIVE_REBUILD_V3_ORIGINAL_SOURCE');
  return { CI51: ci51, CO42: co42 };
}
export async function fingerprint() {
  const toolchain = helpers.verifyToolchain(), crs = helpers.verifyCRS();
  const files=new Map(),roots={wallet:catalog.ROOT,flat:catalog.FLAT,golden:catalog.GOLDEN};
  function visit(path) {
    path=resolve(path);if(files.has(path))return;
    const root=path.startsWith(catalog.ROOT+sep)?'wallet':path.startsWith(catalog.FLAT+sep)?'flat':'golden';
    assert.ok(path.startsWith(roots[root]+sep),'NATIVE_REBUILD_HOST_SOURCE_LOCATION');
    const bytes=tools.regular(path);files.set(path,{root,path:relative(roots[root],path).split(sep).join('/'),bytes:bytes.length,sha256:tools.hash(bytes)});
    if(!path.endsWith('.mjs'))return;
    for(const match of bytes.toString('utf8').matchAll(/(?:\bfrom\s+|^\s*import\s+)(['"])([^'"]+)\1/gm)) {
      if(match[2].startsWith('node:'))continue;
      assert.ok(match[2].startsWith('.'),'NATIVE_REBUILD_HOST_LOCAL_IMPORT');visit(resolve(dirname(path),match[2]));
    }
  }
  for(const path of ['proof-workers/native-claims-build-common.mjs','scripts/prepare-development-native-claims.mjs',
    'proof-workers/native-claims-build-worker.mjs','proof-workers/native-claims-parent-death.py',
    'experiments/native-ingress-v3/fixtures/synthetic-ingress-v3.mjs'])visit(join(catalog.ROOT,path));
  const execution=tools.executionSources(catalog.relation('native_claim_discharge'),'compile');
  for(const record of execution)visit(join(roots[record.root],record.path));
  const host=[...files.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([,record])=>record);
  return { toolchain, crs, identities: identities(toolchain), api: tools.verifyAPI(),
    vendor: tools.verifyVendor(), host,
    execution };
}
export async function co42Artifacts() {
  const spec = catalog.relation('native_claim_discharge'), toolchain = helpers.verifyToolchain();
  const identity = tools.circuitIdentity(spec, toolchain), sourceVersion = tools.hash(JSON.stringify(identity));
  assert.equal(sourceVersion, CO42_SOURCE);
  const context = { spec, identity, sourceVersion, toolchain, directory: tools.versionDirectory(spec, sourceVersion) };
  const compiled = await tools.loadCompiled(context), stats = await tools.loadStats(context, compiled);
  const prepared = await tools.loadPrepared(context, compiled, helpers.verifyCRS());
  assert.equal(tools.hash(prepared.key), CO42_KEY, 'NATIVE_REBUILD_CO42_ORIGINAL_VK');
  return { spec, context, compiled, stats, prepared };
}
