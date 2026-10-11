import test from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,renameSync,symlinkSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {legacyDataRoot} from '@lianum/environment';
import {filePin,hash,root,CRS,TOOLCHAIN_AUDIT_SHA256} from '../../src/toolchain/wallet-resources.mjs';
import * as wallet from '../../src/toolchain/wallet-prover.mjs';
import * as assembly from '../../src/toolchain/assembly-prover.mjs';
import * as nativeKey from '../../src/verification/native-key.mjs';
import * as ownerKey from '../../src/verification/owner-key.mjs';
import * as previousWallet from '../../../../experiments/engine/private-core-proof/wallet-notes/prover.mjs';
import * as previousAssembly from '../../../../experiments/engine/private-core-proof/owner-independent/prover.mjs';
import * as previousNative from '../../../../experiments/engine/private-core-proof/generic-native/pin-key.mjs';
import * as previousOwner from '../../../../experiments/engine/private-core-proof/generic-wrappers/pin-owner-key.mjs';

test('historical proof entries share one active operation implementation',()=>{
 assert.equal(previousWallet.proveWallet,wallet.proveWallet);
 assert.equal(previousWallet.verifyWallet,wallet.verifyWallet);
 assert.equal(previousAssembly.proveAssembly,assembly.proveAssembly);
 assert.equal(previousAssembly.verifyAssembly,assembly.verifyAssembly);
 assert.equal(previousNative.validateNativeKey,nativeKey.validateNativeKey);
 assert.equal(previousOwner.validateOwnerPin,ownerKey.validateOwnerPin);
});

test('relocated validators keep fixed retained artifact roots and reject unknown modes',()=>{
 const engine=legacyDataRoot('engine');
 assert.equal(root,join(engine,'experiments/private-core-proof/wallet-notes/'));
 assert.equal(join(CRS),join(engine,'experiments/private-core-proof/native-notes/.local/crs/2097152/'));
 assert.equal(nativeKey.ROOT,engine);
 assert.equal(nativeKey.nativePaths('ready').circuit,join(engine,'experiments/private-core-proof/generic-native/circuits/ready'));
 assert.equal(fileURLToPath(ownerKey.PIN_PATH),join(engine,'experiments/private-core-proof/generic-wrappers/lib/src/approved_owner_key.nr'));
 assert.throws(()=>nativeKey.nativePaths('../ready'),/NATIVE_KEY_FIXED_MODE_REQUIRED/);
});

test('current file pin reader preserves byte and digest rejection',()=>{
 const directory=mkdtempSync(join(tmpdir(),'lianum-proof-pin-'));
 try {
  const path=join(directory,'artifact');writeFileSync(path,'original');
  const expected={bytes:8,sha256:hash('original')};
  assert.deepEqual(filePin(path,expected),expected);
  assert.throws(()=>filePin(path,{...expected,bytes:9}),/PC23_FILE_SIZE/);
  writeFileSync(path,'tampered');
  assert.throws(()=>filePin(path,expected),/PC23_FILE_HASH/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});


test('both current toolings resolve one lower-level resource and CRS implementation',async()=>{
 const resources=await import('@lianum/components/resources/wallet-resources');
 const policy=await import('@lianum/components/resources/private-resource-policy');
 const previousPolicy=await import('@lianum/engine/crypto/private-resource-policy');
 const crs=await import('@lianum/components/resources/private-verifier-crs');
 const previousCRS=await import('@lianum/engine/crypto/private-verifier-crs');
 const proofTooling=await import('../../src/tooling/tooling.mjs');
 const componentTooling=await import('../../../components/src/component-tooling.mjs');
 assert.deepEqual(proofTooling.activeResourceSourceRecords(),componentTooling.activeResourceSourceRecords());
 assert.equal(proofTooling.activeResourceSourceRecords().length,5);
 for(const tooling of [proofTooling,componentTooling]){
  assert.equal(tooling.resourceModuleURL.href,resources.WALLET_RESOURCES_MODULE_URL);
  assert.equal(tooling.verifierCRSModuleURL.href,crs.PRIVATE_VERIFIER_CRS_MODULE_URL);
  assert.equal((await import(tooling.resourceModuleURL)).guard,resources.guard);
  assert.equal((await import(tooling.verifierCRSModuleURL)).initializePrivateVerifierCRS,crs.initializePrivateVerifierCRS);
 }
 assert.equal(filePin,resources.filePin);
 assert.equal(policy.PRIVATE_RESOURCE_POLICY,previousPolicy.PRIVATE_RESOURCE_POLICY);
 assert.equal(resources.WALLET_RESOURCE_FLOORS,policy.PRIVATE_RESOURCE_FLOORS);
 assert.equal(crs.initializePrivateVerifierCRS,previousCRS.initializePrivateVerifierCRS);
 assert.equal(crs.PRIVATE_VERIFIER_CRS,previousCRS.PRIVATE_VERIFIER_CRS);
 assert.equal(TOOLCHAIN_AUDIT_SHA256,'81aecc452689cfb28709b7d6b3998a1e3c0532de82780a15b2e7a10b3f3e74d6');
 assert.deepEqual(policy.PRIVATE_RESOURCE_FLOORS,{availableRAM:2684354560,freeDisk:5368709120});
 assert.equal(policy.PRIVATE_PROOF_WORKER_RSS_LIMIT,3221225472);
});

test('independent resource reader detects forged self-reports, changed bodies and symlinks',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'lianum-resource-source-fixture-'));
 const componentSource=join(directory,'packages/components/src');
 const environment=join(directory,'packages/environment');
 try{
  mkdirSync(join(componentSource,'resources'),{recursive:true});
  mkdirSync(join(environment,'src'),{recursive:true});
  mkdirSync(join(directory,'scripts'));
  mkdirSync(join(directory,'node_modules/@lianum'),{recursive:true});
  writeFileSync(join(directory,'package.json'),JSON.stringify({name:'lianum',type:'module'}));
  writeFileSync(join(directory,'scripts/layout.json'),'{}');
  copyFileSync(new URL('../../../environment/package.json',import.meta.url),join(environment,'package.json'));
  copyFileSync(new URL('../../../environment/src/paths.mjs',import.meta.url),join(environment,'src/paths.mjs'));
  symlinkSync(environment,join(directory,'node_modules/@lianum/environment'));
  const tooling=await import('../../../components/src/component-tooling.mjs');
  const original=tooling.activeResourceSourceRecords();
  for(const record of original.filter(row=>row.root==='active-components'))
   copyFileSync(new URL('../../../components/src/'+record.path,import.meta.url),join(componentSource,record.path));
  copyFileSync(new URL('../../../components/src/component-tooling.mjs',import.meta.url),join(componentSource,'component-tooling.mjs'));
  const resource=join(componentSource,'resources/wallet-resources.mjs');
  // A substituted implementation can claim the old hashes. Its verifier must
  // independently read the actual bytes, even before this module is imported.
  writeFileSync(resource,readFileSync(resource,'utf8')+'\nexport const resourceSourceRecords = () => '+JSON.stringify(original)+';\n');
  const fixture=await import(pathToFileURL(join(componentSource,'component-tooling.mjs')));
  const before=fixture.activeResourceSourceRecords();
  const resourceRow=rows=>rows.find(row=>row.path==='resources/wallet-resources.mjs');
  assert.notEqual(resourceRow(before).sha256,resourceRow(original).sha256);
  assert.equal(resourceRow(before).sha256,hash(readFileSync(resource)));
  const policy=join(componentSource,'resources/private-resource-policy.mjs');
  writeFileSync(policy,readFileSync(policy,'utf8')+'\n// reviewed implementation changed\n');
  const after=fixture.activeResourceSourceRecords();
  assert.notEqual(before.find(row=>row.path.endsWith('/private-resource-policy.mjs')).sha256,
    after.find(row=>row.path.endsWith('/private-resource-policy.mjs')).sha256);
  assert.deepEqual(before.filter(row=>!row.path.endsWith('/private-resource-policy.mjs')),
    after.filter(row=>!row.path.endsWith('/private-resource-policy.mjs')));
  const environmentPath=join(environment,'src/paths.mjs');
  writeFileSync(environmentPath,readFileSync(environmentPath,'utf8')+'\n// resource locator changed\n');
  assert.notEqual(after.find(row=>row.root==='active-environment').sha256,
    fixture.activeResourceSourceRecords().find(row=>row.root==='active-environment').sha256);
  renameSync(policy,policy+'.redirected');
  symlinkSync(policy+'.redirected',policy);
  assert.throws(()=>fixture.activeResourceSourceRecords(),/FLAT_FILE_SYMLINK/);
 }finally{rmSync(directory,{recursive:true,force:true});}
});

test('relocated verifier CRS retains exact pins, clears copies and rejects tampered G2',async()=>{
 const {initializePrivateVerifierCRS,PRIVATE_VERIFIER_CRS}=await import('@lianum/components/resources/private-verifier-crs');
 const generator={x:Uint8Array.from([...Array(31).fill(0),1]),y:Uint8Array.from([...Array(31).fill(0),2])};
 const originalG2=readFileSync(CRS+'bn254_g2.dat');
 let calls=0,passed;
 const result=await initializePrivateVerifierCRS({async srsInitSrs(value){
  calls++;passed=value;
  assert.equal(value.numPoints,1);
  assert.equal(hash(value.pointsBuf),PRIVATE_VERIFIER_CRS.g1SHA256);
  assert.equal(hash(value.g2Point),PRIVATE_VERIFIER_CRS.g2SHA256);
 }},generator,originalG2);
 assert.equal(calls,1);
 assert.equal(result,PRIVATE_VERIFIER_CRS);
 assert.equal(result.fullCRSIntegrityRequired,true);
 assert.ok(passed.pointsBuf.every(value=>value===0));
 assert.ok(passed.g2Point.every(value=>value===0));
 assert.equal(generator.x[31],1);assert.equal(generator.y[31],2);
 assert.equal(hash(originalG2),PRIVATE_VERIFIER_CRS.g2SHA256);
 const tampered=Buffer.from(originalG2);tampered[127]^=1;
 await assert.rejects(initializePrivateVerifierCRS({async srsInitSrs(){calls++;}},generator,tampered),/PC18_VERIFIER_G2_PIN/);
 assert.equal(calls,1);
});
