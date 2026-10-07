/** Read-only original tree check and append-only claim for a consumed,
 * pre-principal receiver reopen. Authority is supplied only by the fixed
 * recovery dispatcher; this module never creates or clears a recovery grant. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {assertOwnedRecoveryScratchV1,sealStoppedNativeFilesV1,readPrivateRuntimeRecoveryV1} from '../../shared/runtime/owned-runtime-recovery-files-v1.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
async function pinnedSmall(cwd,pin,name,max=4096){
 assert.deepEqual(Object.keys(pin).sort(),['bytes','path','sha256']);assert.equal(pin.path,name);
 assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0&&pin.bytes<=max);assert.match(pin.sha256,/^[0-9a-f]{64}$/);
 const path=join(cwd,name),before=await lstat(path);
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1);assert.equal(before.mode&0o777,0o600);assert.equal(before.size,pin.bytes);
 const f=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{const st=await f.stat();for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(st[k],before[k]);const raw=await f.readFile();const after=await f.stat();for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k]);const named=await lstat(path);assert.ok(named.isFile()&&!named.isSymbolicLink()&&named.nlink===1);assert.equal(named.mode&0o777,0o600);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(named[k],before[k]);assert.equal(raw.length,pin.bytes);assert.equal(sha(raw),pin.sha256);return raw;}finally{await f.close();}
}
export async function assertOwnedReceiverPreopenRepairV1({record,repair}){
 assert.equal(record.schema,'OWNED_FIXED_EVM_CAPTURE_V1');assert.equal(record.family,'receiver');
 assert.equal(record.terminal.ownedProcessStopped,true);assert.equal(record.terminal.forced,false);
 assert.equal(repair.schema,'EXTERNAL_DEFI_RECEIVER_PREOPEN_REPAIR_V1');assert.equal(repair.repairOrdinal,1);
 assert.equal(repair.capturedGeneration,record.processGeneration);assert.ok(Number.isSafeInteger(record.processGeneration)&&record.processGeneration>=0&&record.processGeneration<15);
 assert.equal(repair.captureSHA256,record.privateRecord.sha256);
 assert.equal(repair.failedPhase,'REOPEN_ORIGINAL_RUNTIME');assert.equal(repair.originalRuntimeReturned,false);assert.equal(repair.originalGroupsClosed,true);
 assert.match(repair.approvedSourceSHA256,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(repair.permitDeadlineMs)&&Date.now()<repair.permitDeadlineMs,'EVM_REPAIR_ADMISSION_EXPIRED');
 await assertOwnedRecoveryScratchV1(record.cwd,'flat-owned-evm-v2-');
 const claimName=`wrapped-runtime-open-${record.processGeneration}.json`,mnemonicName=`reopen-mnemonic-${record.processGeneration+1}.txt`;
 const claim=JSON.parse(await pinnedSmall(record.cwd,repair.predecessorClaim,claimName));
 assert.deepEqual(claim,{schema:'NATIVE_RECOVERY_PERMANENT_OPEN_CLAIM_V1',generation:record.processGeneration,captureSHA256:record.privateRecord.sha256});
 const mnemonic=await pinnedSmall(record.cwd,repair.predecessorMnemonic,mnemonicName);
 const original=await readPrivateRuntimeRecoveryV1(record.cwd,record.privateRecord);
 assert.equal(original.schema,'OWNED_FIXED_EVM_PRIVATE_RECOVERY_V1');assert.equal(original.family,'receiver');
 assert.equal(original.cwd,record.cwd);assert.equal(original.processGeneration,record.processGeneration);
 assert.ok(typeof original.mnemonic==='string'&&mnemonic.equals(Buffer.from(original.mnemonic+'\n')),'EVM_REPAIR_ORIGINAL_MNEMONIC');
 const expected=[...record.files.files,...[repair.predecessorClaim,repair.predecessorMnemonic].map(x=>({...x,mode:'0600'}))].sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 assert.equal(new Set(expected.map(x=>x.path)).size,expected.length,'EVM_REPAIR_DUPLICATE_ORIGINAL_FILE');
 const actual=await sealStoppedNativeFilesV1(record.cwd);
 assert.deepEqual(actual,{files:expected,totalBytes:record.files.totalBytes+repair.predecessorClaim.bytes+repair.predecessorMnemonic.bytes},'EVM_REPAIR_ORIGINAL_TREE_CHANGED');
 return undefined;
}
async function originalHistory(record,repair){
 const capture=await pinnedSmall(record.cwd,record.privateRecord,'wrapped-runtime-capture.json',64*1024*1024);
 const terminalName='wrapped-runtime-terminal.json',terminalStat=await lstat(join(record.cwd,terminalName));
 assert.ok(terminalStat.isFile()&&!terminalStat.isSymbolicLink()&&terminalStat.nlink===1&&terminalStat.size>0&&terminalStat.size<=1024*1024);assert.equal(terminalStat.mode&0o777,0o600);
 const terminalFile=await open(join(record.cwd,terminalName),constants.O_RDONLY|constants.O_NOFOLLOW);
 let terminal;
 try{const st=await terminalFile.stat();for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(st[k],terminalStat[k]);terminal=await terminalFile.readFile();const after=await terminalFile.stat();for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[k],terminalStat[k]);}finally{await terminalFile.close();}
 const namedTerminal=await lstat(join(record.cwd,terminalName));assert.ok(namedTerminal.isFile()&&!namedTerminal.isSymbolicLink()&&namedTerminal.nlink===1);assert.equal(namedTerminal.mode&0o777,0o600);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(namedTerminal[k],terminalStat[k]);
 assert.deepEqual(JSON.parse(terminal),record,'EVM_REPAIR_ORIGINAL_TERMINAL_DESCRIPTOR');
 const prefix=`wrapped-runtime-history-${record.processGeneration}-repair-${repair.repairOrdinal}`;
 return [{path:prefix+'-capture.json',bytes:capture.length,sha256:sha(capture),raw:capture},{path:prefix+'-terminal.json',bytes:terminal.length,sha256:sha(terminal),raw:terminal}];
}
export async function claimOwnedReceiverPreopenRepairV1({record,repair}){
 await assertOwnedReceiverPreopenRepairV1({record,repair});
 const history=await originalHistory(record,repair);
 const name=`wrapped-runtime-repair-${record.processGeneration}-${repair.repairOrdinal}.json`;
 const f=await open(join(record.cwd,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await f.writeFile(JSON.stringify({schema:'NATIVE_RECEIVER_PREOPEN_REPAIR_CLAIM_V1',capturedGeneration:record.processGeneration,repairOrdinal:repair.repairOrdinal,captureSHA256:record.privateRecord.sha256,predecessorClaimSHA256:repair.predecessorClaim.sha256,approvedSourceSHA256:repair.approvedSourceSHA256,originalHistory:history.map(({raw,...pin})=>pin)}));await f.sync();}finally{await f.close();}
 for(const {raw,...pin} of history){
  const output=await open(join(record.cwd,pin.path),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await output.writeFile(raw);await output.sync();}finally{await output.close();}
  await pinnedSmall(record.cwd,pin,pin.path,64*1024*1024);
 }
 const d=await open(record.cwd,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await d.sync();}finally{await d.close();}
}
