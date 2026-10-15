/** Real SIGKILL/Supervisor/Authority/OWNER and protected physical history
 * reader. Server key envelope/approved epoch and chain are explicit HOST test
 * fixtures with real AEAD/secp signatures; no issuer, SNARK or public payment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,createCipheriv,createPrivateKey,sign,ECDH} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import * as Sup from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
import * as Epoch from '../../src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs';
import {openSourceFinancialEpochStoreV5} from '../../src/chains/public-testnet/sepolia-source-financial-epoch-store-v5.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),fixture=new URL('../../../../apps/mobile/tests/device-paged-active-crash-child-v4.mjs',import.meta.url),genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
test('ACTIVE recovery validates signed historical policy for newer rows without reviving expired Source grants',{timeout:90000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'active-financial-history-'));let child,supervisor,store,output='';
 try{
  child=spawn(process.execPath,['--experimental-test-module-mocks',fixture.pathname],{env:{...process.env,LIANUM_ACTIVE_CRASH_DIRECTORY:directory,LIANUM_ACTIVE_CRASH_STAGE:'UNKNOWN',LIANUM_ACTIVE_FINANCIAL_EPOCH:'1'},stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const ready=await Promise.race([once(child,'message').then(([data])=>data),once(child,'exit').then(([code,signal])=>{throw Error('HOST_CHILD_FAILED '+code+'/'+signal+' '+output);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('HOST_CHILD_TIMEOUT '+output)),45000).unref())]);assert.equal(ready.profile,'HOST_ORIGINAL_ACTIVE_READY_V4');
  const saved=(await new Vault(join(directory,'HOST-fixture-state.vault')).read('HOST_ACTIVE_FIXTURE_SECRET_NOT_USER_32')).data;
  const exited=once(child,'exit');child.kill('SIGKILL');assert.equal((await exited)[1],'SIGKILL');child=null;
  const base=Epoch.normalizeSourceFinancialPolicyDataV5(saved.anchor.native.source.configuration.policy),sourcePath=join(saved.nativeDirectory,'source-operations/native-wallet.json'),disk=JSON.parse(await readFile(sourcePath,'utf8')),row=disk.operations[0],keysDir=join(saved.nativeDirectory,'keys'),master=Buffer.alloc(32,9),nonce=Buffer.alloc(12,7);
  // HOST fixture envelope contains known non-user keys. The actual KeyStore
  // verifies AEAD, identity, file custody and actual epoch operator signatures.
  await mkdir(keysDir,{mode:0o700});await writeFile(join(keysDir,'wrapping-key.bin'),master,{mode:0o600});
  const clear=Buffer.from(JSON.stringify({profile:'PUBLIC_PAGED_SERVER_KEYS_V1',keysetId:base.keysetId,keys:saved.accounts.map((a,i)=>({networkId:a.networkId,key:Buffer.alloc(32,i+1).toString('hex')}))})),cipher=createCipheriv('aes-256-gcm',master,nonce);cipher.setAAD(Buffer.from('LIANUM/PAGED/PUBLIC-TESTNET/SERVER-KEYS/V1'));const encrypted=Buffer.concat([cipher.update(clear),cipher.final()]);clear.fill(0);
  await writeFile(join(keysDir,'provider-keys.aead'),JSON.stringify({profile:'PUBLIC_PAGED_SERVER_KEYS_AEAD_V1',keysetId:base.keysetId,nonce:nonce.toString('hex'),ciphertext:encrypted.toString('hex'),tag:cipher.getAuthTag().toString('hex')}),{mode:0o600});
  const password=sha(Buffer.concat([Buffer.from('LIANUM/ORIGINAL-SOURCE-FINANCIAL-EPOCH-STORE/5\0'+base.keysetId+'\0'),master]));master.fill(0);
  const policy=Epoch.normalizeSourceFinancialPolicyDataV5({...base,maximumTotalValueAtomic:'3000000000000000',expiresAt:Date.now()+3600000}),unsigned={profile:Epoch.SOURCE_FINANCIAL_EPOCH_V5,chainId:'11155111',genesis,keysetId:base.keysetId,account:base.account,basePolicySHA256:sha(JSON.stringify(base)),epoch:'1',predecessorEpochId:null,checkpoint:{identity:disk.configurationSHA256,revision:disk.revision,dataSHA256:sha(JSON.stringify(disk.operations)),policySHA256:sha(JSON.stringify(base))},reserved:{feeAtomic:(BigInt(row.transaction.gasLimit)*BigInt(row.transaction.maxFeePerGas)).toString(),valueAtomic:row.transaction.value},limits:{maximumTotalSuccessorPools:'2',maximumSourcesPerWallet:'2'},policy,issuedAt:Date.now(),nonce:'8'.repeat(64)},epoch=Epoch.normalizeSourceFinancialEpochDataV5({...unsigned,epochId:Epoch.sourceFinancialEpochIdDataV5(unsigned)}),privateBytes=Buffer.alloc(32,1),pub=ECDH.convertKey(Buffer.from(saved.accounts[0].publicKey,'hex'),'secp256k1',undefined,undefined,'uncompressed'),key=createPrivateKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',d:privateBytes.toString('base64url'),x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url')}});
  let signature=sign('sha256',Epoch.sourceFinancialEpochMessageV5(epoch),{key,dsaEncoding:'ieee-p1363'});const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+signature.subarray(32).toString('hex'));if(s>order/2n)signature=Buffer.concat([signature.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);privateBytes.fill(0);
  const epochPath=join(saved.nativeDirectory,'source-operations/financial-epochs.vault');store=await openSourceFinancialEpochStoreV5({path:epochPath,password,basePolicy:base,journalIdentity:disk.configurationSHA256,publicKey:saved.accounts[0].publicKey,createIfMissing:true});const original=await store.read(),accepted=await store.append(epoch,signature.toString('hex'),{revision:original.checkpoint.revision,dataSHA256:original.checkpoint.dataSHA256});store.close();store=null;signature.fill(0);
  // Rows here are HOST retained-state fixtures. Their wire is still the exact
  // real secp wire from the killed Source producer, checked by both consumers.
  row.policySHA256=sha(JSON.stringify(policy));disk.revision++;await writeFile(sourcePath,JSON.stringify(disk),{mode:0o600});
  const financialBefore=await readFile(saved.authorityInput.journal.path),ownerBefore=await readFile(join(directory,'private-owner.vault')),sourceBefore=await readFile(sourcePath),historyBefore=await readFile(epochPath),block={number:'0x1',hash:'0x'+'f'.repeat(64),parentHash:'0x'+'e'.repeat(64),timestamp:'0x'+1900000250n.toString(16),gasLimit:'0x1c9c380',baseFeePerGas:'0x1'},receipts=new Map(saved.system.deployments.map(r=>[r.receipt.transactionHash,r.receipt]));let posts=0;
  t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{const r=JSON.parse(options.body);let result;switch(r.method){case'eth_chainId':result='0xaa36a7';break;case'eth_getBlockByNumber':result=r.params[0]==='0x0'?{hash:genesis}:block;break;case'eth_getCode':result='0x6000';break;case'eth_getTransactionReceipt':result=receipts.get(r.params[0])??null;break;case'eth_sendRawTransaction':posts++;throw Error('HOST_NO_PUBLIC_POST');default:throw Error('HOST_RPC_UNEXPECTED:'+r.method);}return new Response(JSON.stringify({jsonrpc:'2.0',id:r.id,result}),{status:200});});
  // Signature corruption is rejected even though the policy DTO looks valid.
  const historyDisk=JSON.parse(await readFile(epochPath,'utf8'));await writeFile(epochPath,JSON.stringify({...historyDisk,ciphertext:historyDisk.ciphertext?.replace(/^../,'ff')}),{mode:0o600});await assert.rejects(Sup.openOriginalPagedPublicActiveRecoveryV4(saved.supervisorInput));await writeFile(epochPath,historyBefore,{mode:0o600});
  const unknownPolicy=structuredClone(disk);unknownPolicy.operations[0].policySHA256='00'.repeat(32);await writeFile(sourcePath,JSON.stringify(unknownPolicy),{mode:0o600});await assert.rejects(Sup.openOriginalPagedPublicActiveRecoveryV4(saved.supervisorInput),/PAGED_ACTIVE_UNKNOWN_SOURCE_POLICY/);await writeFile(sourcePath,sourceBefore,{mode:0o600});
  assert.ok(Date.now()>base.expiresAt,'historical base period has genuinely elapsed while wallet descriptor remains alive');
  supervisor=await Sup.openOriginalPagedPublicActiveRecoveryV4(saved.supervisorInput);
  const native=Sup.consumeOriginalPagedComponentRecoveryV3(await supervisor.issueComponent('native'),'native');
  assert.equal(native.source.checkpoint.policySHA256,row.policySHA256);assert.deepEqual(native.source.checkpoint.financialEpoch,accepted.checkpoint);assert.equal(native.source.checkpoint.identity,disk.configurationSHA256);assert.equal(native.source.checkpoint.revision,disk.revision);assert.equal(supervisor.descriptor().deadlineMs,saved.descriptor.deadlineMs);
  for(const name of ['deployment','authority','provider'])Sup.consumeOriginalPagedComponentRecoveryV3(await supervisor.issueComponent(name),name);await supervisor.complete();
  assert.deepEqual(await readFile(saved.authorityInput.journal.path),financialBefore);assert.deepEqual(await readFile(join(directory,'private-owner.vault')),ownerBefore);assert.deepEqual(await readFile(sourcePath),sourceBefore);assert.deepEqual(await readFile(epochPath),historyBefore);assert.equal(posts,0);
  await supervisor.close();supervisor=null;t.mock.method(Date,'now',()=>saved.descriptor.deadlineMs+1);assert.equal((await Sup.readOriginalPagedPublicRecoveryModeV4(saved.supervisorInput)).mode,'ACTIVE_DEAD_EXPIRED_FENCED');await assert.rejects(Sup.openOriginalPagedPublicActiveRecoveryV4(saved.supervisorInput),/PAGED_ACTIVE_SOURCE_FINANCIAL_EXPIRED/);assert.equal(posts,0);
 }finally{store?.close();if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}await supervisor?.close();await rm(directory,{recursive:true,force:true});}
});
