/** Original complete CRS, optionally its already reviewed official expansion.
 * No caller path, point count, receipt, key, private material or regeneration.
 */
import assert from 'node:assert/strict';
import {constants,closeSync,fstatSync,lstatSync,openSync,readFileSync,readSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT,LIMITS} from '@lianum/proofs/catalog';
import {hash,regular,resourceModuleURL} from '@lianum/proofs/tooling/tooling';
const PATH=resolve(ROOT,'../../../dev/cache/public-crs/full-v1/bn254_g1_full_uncompressed.dat');
const SHA256='2bb84462a0bdad2f6e6dd6182c7779c30aac703115e28f32ca2cc3b57c140622';
const identity=s=>['dev','ino','size','mode','nlink','mtimeNs','ctimeNs'].map(key=>[key,s[key].toString()]);
export function i84PublicCRSCachePinV1(){
  assert.equal(arguments.length,0);
  try{lstatSync(PATH);}catch(error){if(error.code==='ENOENT')return{used:false,reason:'EXACT_CACHE_ABSENCE'};throw error;}
  const bytes=regular(PATH);
  assert.equal(bytes.length,LIMITS.provingCRSPoints*64,'NV2_FULL_PUBLIC_CRS_SIZE');
  assert.equal(hash(bytes),SHA256,'NV2_FULL_PUBLIC_CRS_PIN');
  return{used:true,points:LIMITS.provingCRSPoints,bytes:bytes.length,sha256:SHA256,originalFullCRSVerified:true};
}
export async function createI84FullProvingCRSReaderV1(){
  assert.equal(arguments.length,0);const helpers=await import(resourceModuleURL),crs=helpers.verifyCRS();
  assert.equal(crs.points,LIMITS.provingCRSPoints,'NV2_ORIGINAL_FULL_CRS_REQUIRED');
  const cache=i84PublicCRSCachePinV1();let fd=null,retained=null,closed=false,used=false;
  if(cache.used){assert.equal(realpathSync(PATH),PATH,'NV2_PUBLIC_CRS_SYMLINK');
    fd=openSync(PATH,constants.O_RDONLY|constants.O_NOFOLLOW);
    try{const stat=fstatSync(fd,{bigint:true});assert.ok(stat.isFile(),'NV2_PUBLIC_CRS_REGULAR_FILE');assert.equal(stat.size,BigInt(LIMITS.provingCRSPoints*64),'NV2_FULL_PUBLIC_CRS_SIZE');retained=identity(stat);}
    catch(error){closeSync(fd);throw error;}}
  function current(){
    assert.equal(closed,false,'NV2_PUBLIC_CRS_READER_CLOSED');assert.deepEqual(helpers.verifyCRS(),crs,'NV2_ORIGINAL_FULL_CRS_CHANGED');
    if(fd===null){assert.deepEqual(i84PublicCRSCachePinV1(),cache,'NV2_PUBLIC_CRS_CACHE_CHANGED');return;}
    assert.deepEqual(identity(fstatSync(fd,{bigint:true})),retained,'NV2_PUBLIC_CRS_FD_CHANGED');
    assert.equal(realpathSync(PATH),PATH,'NV2_PUBLIC_CRS_SYMLINK');
    assert.deepEqual(identity(lstatSync(PATH,{bigint:true})),retained,'NV2_PUBLIC_CRS_PATH_CHANGED');
    const scratch=Buffer.alloc(65536),digest=createHash('sha256');let position=0;
    try{let n;while((n=readSync(fd,scratch,0,scratch.length,position))>0){position+=n;digest.update(scratch.subarray(0,n));}
      assert.equal(position,LIMITS.provingCRSPoints*64,'NV2_FULL_PUBLIC_CRS_SIZE');assert.equal(digest.digest('hex'),SHA256,'NV2_FULL_PUBLIC_CRS_PIN');
    }finally{scratch.fill(0);}
    assert.deepEqual(identity(fstatSync(fd,{bigint:true})),retained,'NV2_PUBLIC_CRS_FD_CHANGED');
  }
  return Object.freeze({
    report:Object.freeze(cache),
    read(){assert.equal(arguments.length,0);assert.equal(used,false,'NV2_ONE_FULL_CRS_LOAD');current();used=true;
      const bytes=fd===null?regular(helpers.CRS+'bn254_g1_compressed.dat'):readFileSync(fd);
      if(fd!==null){assert.equal(bytes.length,LIMITS.provingCRSPoints*64,'NV2_FULL_PUBLIC_CRS_SIZE');assert.equal(hash(bytes),SHA256,'NV2_FULL_PUBLIC_CRS_PIN');}
      current();return bytes;},
    assertCurrent(){assert.equal(arguments.length,0);current();},
    close(){assert.equal(arguments.length,0);if(closed)return;try{current();}finally{closed=true;if(fd!==null){closeSync(fd);fd=null;}}},
  });
}
