/** Real filesystem layouts only; no owner material, proof or network access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('public CRS cache follows the explicit resource root without colliding with the dev executable',()=>{
 const directory=mkdtempSync(join(tmpdir(),'lianum-public-crs-location-'));
 try{
  for(const resources of[null,'resources','portable/resources']){
   const root=join(directory,resources?.replaceAll('/','-')??'historical');
   mkdirSync(join(root,'packages/environment/src'),{recursive:true});
   mkdirSync(join(root,'packages/proofs/src/tooling'),{recursive:true});
   mkdirSync(join(root,'node_modules/@lianum'),{recursive:true});
   mkdirSync(join(root,'scripts'));
   writeFileSync(join(root,'package.json'),JSON.stringify({name:'lianum',type:'module'}));
   writeFileSync(join(root,'scripts/layout.json'),'{}');
   writeFileSync(join(root,'dev'),'#!/bin/sh\nexit 0\n');
   copyFileSync(new URL('../../../environment/src/paths.mjs',import.meta.url),join(root,'packages/environment/src/paths.mjs'));
   copyFileSync(new URL('../../../environment/package.json',import.meta.url),join(root,'packages/environment/package.json'));
   symlinkSync(join(root,'packages/environment'),join(root,'node_modules/@lianum/environment'));
   copyFileSync(new URL('../../src/tooling/public-proving-crs-location-v1.mjs',import.meta.url),join(root,'packages/proofs/src/tooling/public-proving-crs-location-v1.mjs'));
   if(resources)writeFileSync(join(root,'runtime-resources.json'),JSON.stringify({schema:'LIANUM_RUNTIME_RESOURCES_V1',status:'candidate',financialAcceptance:false,root:resources}));
   const script=`import assert from 'node:assert/strict';import{lstatSync,mkdirSync,writeFileSync,readFileSync}from'node:fs';import{dirname,join}from'node:path';
    import{legacyDataRoot,resourceMode}from'./packages/environment/src/paths.mjs';
    import{publicProvingCRSCachePath as cache}from'./packages/proofs/src/tooling/public-proving-crs-location-v1.mjs';
    const resources=${JSON.stringify(resources)};
    assert.equal(resourceMode,resources?'candidate':'historical-local');
    assert.equal(cache,join(process.cwd(),resources??'.internal/dev','cache/public-crs/full-v1/bn254_g1_full_uncompressed.dat'));
    if(resources==='resources')assert.throws(()=>lstatSync(join(legacyDataRoot('wallet'),'../../../dev/cache/public-crs/full-v1/bn254_g1_full_uncompressed.dat')),e=>e.code==='ENOTDIR');
    assert.throws(()=>lstatSync(cache),e=>e.code==='ENOENT');
    mkdirSync(dirname(cache),{recursive:true});writeFileSync(cache,'PUBLIC_PATH_FIXTURE');
    assert.equal(readFileSync(cache,'utf8'),'PUBLIC_PATH_FIXTURE');`;
   const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:root,encoding:'utf8'});
   assert.equal(result.status,0,result.stderr);
  }
 }finally{rmSync(directory,{recursive:true,force:true});}
});
