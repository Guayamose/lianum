/** Real local process birth/absence checks, without source authority. */
import assert from 'node:assert/strict';
import {lstat,readFile} from 'node:fs/promises';
import {exactRecord} from '@lianum/components/encoding/commitments';
const procFields=['pid','startTicks','uid','pgrp','session'];
/** @typedef {{pid:number,startTicks:string,uid:number,pgrp:number,session:number}} NativeSourceProcessIdentityV1 */
/** @param {unknown} pid @returns {Promise<NativeSourceProcessIdentityV1>} */
export async function processIdentity(pid){assert.ok(typeof pid==='number'&&Number.isSafeInteger(pid)&&pid>0,'NATIVE_SOURCE_PROCESS_ID');const path='/proc/'+pid;
 const a=await lstat(path);assert.ok(process.getuid,'NATIVE_SOURCE_PROCESS_UID');assert.equal(a.uid,process.getuid(),'NATIVE_SOURCE_PROCESS_UID');const raw=await readFile(path+'/stat','utf8');
 const end=raw.lastIndexOf(')');assert.ok(end>0&&raw.slice(0,raw.indexOf(' '))===String(pid),'NATIVE_SOURCE_PROCESS_STAT');const f=raw.slice(end+2).trimEnd().split(/ +/);
 for(const i of [2,3,19])assert.ok(/^[1-9][0-9]*$/.exec(f[i])?.[0]===f[i],'NATIVE_SOURCE_PROCESS_STAT');
 const result={pid,startTicks:f[19],uid:a.uid,pgrp:Number(f[2]),session:Number(f[3])};validateProcess(result);return result;
}
/** @param {unknown} value @returns {asserts value is NativeSourceProcessIdentityV1} */
export function validateProcess(value){exactRecord(value,procFields);assert.ok(process.getuid,'NATIVE_SOURCE_PROCESS_IDENTITY');assert.ok(typeof value.pid==='number'&&Number.isSafeInteger(value.pid)&&value.pid>0&&typeof value.uid==='number'&&Number.isSafeInteger(value.uid)&&value.uid===process.getuid()&&typeof value.pgrp==='number'&&Number.isSafeInteger(value.pgrp)&&value.pgrp>0&&typeof value.session==='number'&&Number.isSafeInteger(value.session)&&value.session>0,'NATIVE_SOURCE_PROCESS_IDENTITY');assert.ok(typeof value.startTicks==='string'&&/^[1-9][0-9]*$/.exec(value.startTicks)?.[0]===value.startTicks,'NATIVE_SOURCE_PROCESS_IDENTITY');}
/** @param {unknown} value */
export async function absent(value){validateProcess(value);try{await lstat('/proc/'+value.pid);assert.fail('NATIVE_SOURCE_OLD_PROCESS_PRESENT');}catch(e){if(!e||typeof e!=='object'||!('code'in e)||(e.code!=='ENOENT'&&e.code!=='ESRCH'))throw e;}}
