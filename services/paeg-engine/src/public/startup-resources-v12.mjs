/** Check the actual worker filesystem before Original acquisition or RPC. */
import assert from 'node:assert/strict';
import {readFile,statfs} from 'node:fs/promises';
import {join} from 'node:path';
export async function assertPublicStartupResourcesV12(root,policy){
 const [memory,disk]=await Promise.all([readFile('/proc/meminfo','utf8'),statfs(join(root,'packages/backend/src/operations/local/device-paged-graph-recipient-v3.mjs'))]);
 const availableRAM=Number(/MemAvailable:\s+(\d+)/.exec(memory)?.[1]??0)*1024,freeDisk=disk.bavail*disk.bsize;
 const requiredDisk=policy.floors.freeDisk+2*1024**3;
 assert.ok(availableRAM>=policy.floors.availableRAM,'PAEG_STARTUP_RAM_FLOOR');
 assert.ok(freeDisk>=requiredDisk,'PAEG_STARTUP_DISK_HEADROOM');
 return Object.freeze({stage:'STARTUP_RESOURCES_VERIFIED',availableRAM,freeDisk,requiredRAM:policy.floors.availableRAM,requiredDisk});
}
