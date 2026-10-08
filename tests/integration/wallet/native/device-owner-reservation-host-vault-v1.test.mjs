import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {HostCrypto,openDeviceReservationHostVaultV1} from './device-owner-reservation-host-vault-v1.mjs';

test('the Expo digest adapter accepts ArrayBuffer and hashes only the original view bytes',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'lianum-device-digest-'));
 let host;
 try{
  host=await openDeviceReservationHostVaultV1({appRoot:fileURLToPath(new URL('../../../../apps/mobile',import.meta.url)),
   directory:join(directory,'vault'),fetch:()=>{throw Error('HOST_DIGEST_NETWORK_NOT_ALLOWED');}});
  const abc=Uint8Array.of(97,98,99),framed=Uint8Array.of(255,97,98,99,254);
  for(const bytes of [abc.buffer,abc,framed.subarray(1,4),new DataView(framed.buffer,1,3)]){
   const digest=await HostCrypto.digest('SHA-256',bytes);
   assert.ok(digest instanceof ArrayBuffer);
   assert.equal(Buffer.from(digest).toString('hex'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  }
  assert.equal(host.evidence().writes,0);
 }finally{if(host){host.close();host.retire();}rmSync(directory,{recursive:true,force:true});}
});
