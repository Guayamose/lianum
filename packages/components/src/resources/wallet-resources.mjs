/** Active toolchain validation. Frozen experiment bytes remain historical evidence. */
import {PRIVATE_RESOURCE_FLOORS,PRIVATE_RESOURCE_POLICY,PRIVATE_PROOF_WORKER_RSS_LIMIT} from './private-resource-policy.mjs';
import assert from 'node:assert/strict';
import {readFileSync,statfsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {legacyDataRoot} from '@lianum/environment';
// Preserve one canonical implementation in source and generated runtimes.
export const WALLET_RESOURCES_MODULE_URL = import.meta.url;
export const root=join(legacyDataRoot('engine'),'experiments/private-core-proof/wallet-notes/');
export const hash=b=>createHash('sha256').update(b).digest('hex');
export const WALLET_RESOURCE_FLOORS=PRIVATE_RESOURCE_FLOORS;
export function resources(){const d=statfsSync(root);return{availableRAM:Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo','utf8'))[1])*1024,freeDisk:d.bavail*d.bsize,rss:process.memoryUsage().rss};}
export function guard(){const r=resources();assert.ok(r.availableRAM>=WALLET_RESOURCE_FLOORS.availableRAM,'PC23_AVAILABLE_RAM_FLOOR');assert.ok(r.freeDisk>=WALLET_RESOURCE_FLOORS.freeDisk,'PC23_DISK_FLOOR');return r;}
import {filePin} from '../file-integrity.mjs';
export {filePin} from '../file-integrity.mjs';
export const TOOLCHAIN_AUDIT_SHA256='81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6';
export function verifyToolchain(){const path=root+'../../../evidence/m15-linux-package-provenance.json';filePin(path,{sha256:TOOLCHAIN_AUDIT_SHA256});const audit=JSON.parse(readFileSync(path));assert.equal(audit.node,process.version,'PC23_PINNED_NODE');for(const p of audit.packages.filter(p=>p.installed))filePin(root+'../'+p.path+'/package.json',{sha256:p.packageJSONSHA256});for(const w of audit.wasm)filePin(root+'../'+w.path,w);filePin(root+'../reused-package-lock.json',{sha256:audit.packageLockSHA256});return{node:process.version,noir:'1.0.0-beta.25',barretenberg:'5.2.0',auditSHA256:TOOLCHAIN_AUDIT_SHA256};}
export const CRS=root+'../native-notes/.local/crs/2097152/';
export function verifyCRS(){const expected=[{file:'bn254_g1_compressed.dat',bytes:67108864,sha256:'3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37'},{file:'bn254_g2.dat',bytes:128,sha256:'01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f'}];const p=JSON.parse(readFileSync(CRS+'provenance.json'));assert.equal(p.points,2097152);assert.deepEqual(p.records.map(({file,bytes,sha256})=>({file,bytes,sha256})),expected,'PC23_CRS_PINS');for(const r of expected)filePin(CRS+r.file,r);return{points:2097152,provenanceSHA256:filePin(CRS+'provenance.json').sha256,records:expected};}
