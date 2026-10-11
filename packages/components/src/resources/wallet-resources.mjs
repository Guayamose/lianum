/** Active toolchain validation. Frozen experiment bytes remain historical evidence. */
import {PRIVATE_RESOURCE_FLOORS} from './private-resource-policy.mjs';
import assert from 'node:assert/strict';
import {readFileSync,statfsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {legacyDataRoot} from '@lianum/environment';
import {filePin} from '../file-integrity.mjs';
export {filePin} from '../file-integrity.mjs';

// Preserve one canonical implementation in source and generated runtimes.
export const WALLET_RESOURCES_MODULE_URL = import.meta.url;
export const root=join(legacyDataRoot('engine'),'experiments/private-core-proof/wallet-notes/');
/** @param {string | NodeJS.ArrayBufferView} bytes */
export const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export const WALLET_RESOURCE_FLOORS=PRIVATE_RESOURCE_FLOORS;

export function resources(){
  const disk=statfsSync(root);
  return {
    availableRAM:Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))?.[1])*1024,
    freeDisk:disk.bavail*disk.bsize,
    rss:process.memoryUsage().rss,
  };
}
export function guard(){
  const result=resources();
  assert.ok(result.availableRAM>=WALLET_RESOURCE_FLOORS.availableRAM,'PC23_AVAILABLE_RAM_FLOOR');
  assert.ok(result.freeDisk>=WALLET_RESOURCE_FLOORS.freeDisk,'PC23_DISK_FLOOR');
  return result;
}

export const TOOLCHAIN_AUDIT_SHA256='81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6';
/** @typedef {{node:string,packages:{installed:boolean,path:string,packageJSONSHA256:string}[],wasm:{path:string,sha256:string,bytes:number}[],packageLockSHA256:string}} PinnedToolchainAudit */
export function verifyToolchain(){
  const path=root+'../../../evidence/m15-linux-package-provenance.json';
  filePin(path,{sha256:TOOLCHAIN_AUDIT_SHA256});
  // This schema belongs to the original, hash-checked audit, not caller input.
  /** @type {PinnedToolchainAudit} */
  const audit=JSON.parse(readFileSync(path,'utf8'));
  assert.equal(audit.node,process.version,'PC23_PINNED_NODE');
  for(const pkg of audit.packages.filter(pkg=>pkg.installed))
    filePin(root+'../'+pkg.path+'/package.json',{sha256:pkg.packageJSONSHA256});
  for(const wasm of audit.wasm)filePin(root+'../'+wasm.path,wasm);
  filePin(root+'../reused-package-lock.json',{sha256:audit.packageLockSHA256});
  return {node:process.version,noir:'1.0.0-beta.25',barretenberg:'5.2.0',auditSHA256:TOOLCHAIN_AUDIT_SHA256};
}

export const CRS=root+'../native-notes/.local/crs/2097152/';
/** @param {unknown} value @returns {asserts value is Record<string,unknown>} */
function provenanceRecord(value){
  assert.ok(value && typeof value==='object' && !Array.isArray(value),'PC23_CRS_PINS');
}
export function verifyCRS(){
  const expected=[
    {file:'bn254_g1_compressed.dat',bytes:67108864,sha256:'3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37'},
    {file:'bn254_g2.dat',bytes:128,sha256:'01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f'},
  ];
  /** @type {unknown} */
  const provenance=JSON.parse(readFileSync(CRS+'provenance.json','utf8'));
  provenanceRecord(provenance);
  assert.equal(provenance.points,2097152);
  assert.ok(Array.isArray(provenance.records),'PC23_CRS_PINS');
  const records=provenance.records.map(/** @param {unknown} value */ value=>{
    provenanceRecord(value);
    return {file:value.file,bytes:value.bytes,sha256:value.sha256};
  });
  assert.deepEqual(records,expected,'PC23_CRS_PINS');
  for(const record of expected)filePin(CRS+record.file,record);
  return {points:2097152,provenanceSHA256:filePin(CRS+'provenance.json').sha256,records:expected};
}
