/** Remove only an authenticated departed account creator's private Vault lock.
 * This filesystem operation issues no SOURCE or account capability. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {unlink} from 'node:fs/promises';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {privateDirectory,readPrivate,syncDirectory} from './private-files-v1.mjs';
import {absent,validateProcess} from './process-identity-v1.mjs';
/** @param {unknown} value */
const hex=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.exec(value)?.[0]===value;
/** @param {unknown} creator @param {unknown} account */
export async function clearNativeSourceAccountCheckpointLockV1(creator,account){
 validateProcess(creator);assert.ok(account&&typeof account==='object'&&'confirmed'in account,'NATIVE_SOURCE_STALE_ACCOUNT_LOCK_OWNER');
 const confirmed=account.confirmed;assert.ok(confirmed&&typeof confirmed==='object'&&'directory'in confirmed&&typeof confirmed.directory==='string','NATIVE_SOURCE_STALE_ACCOUNT_LOCK_OWNER');
 const directory=confirmed.directory,path=join(directory,'operations.vault.lock');await privateDirectory(directory);let bytes;
 try{bytes=await readPrivate(path,1024);}catch(error){if(error&&typeof error==='object'&&'code'in error&&error.code==='ENOENT')return;throw error;}
 try{/** @type {unknown} */const lock=JSON.parse(bytes.toString('utf8'));exactRecord(lock,['version','pid','token']);assert.equal(lock.version,1);
  assert.equal(lock.pid,creator.pid,'NATIVE_SOURCE_STALE_ACCOUNT_LOCK_OWNER');assert.ok(hex(lock.token));await absent(creator);
  const again=await readPrivate(path,1024);try{assert.deepEqual(again,bytes,'NATIVE_SOURCE_STALE_ACCOUNT_LOCK_CHANGED');}finally{again.fill(0);}
  await unlink(path);await syncDirectory(directory);
 }finally{bytes.fill(0);}}
