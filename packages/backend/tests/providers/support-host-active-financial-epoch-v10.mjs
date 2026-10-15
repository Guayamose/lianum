/** Actual protected AEAD and secp-signed epoch storage; known HOST keys.
 * This fixture helper does not issue a financial Native/Source grant. */
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,createCipheriv,createPrivateKey,sign,ECDH} from 'node:crypto';
import * as Epoch from '../../src/chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs';
import {openSourceFinancialEpochStoreV5} from '../../src/chains/public-testnet/sepolia-source-financial-epoch-store-v5.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
export async function installHostActiveFinancialEpochV10(saved){let store;try{
  const base=Epoch.normalizeSourceFinancialPolicyDataV5(saved.anchor.native.source.configuration.policy),sourcePath=join(saved.nativeDirectory,'source-operations/native-wallet.json'),disk=JSON.parse(await readFile(sourcePath,'utf8')),row=disk.operations[0],keysDir=join(saved.nativeDirectory,'keys'),master=Buffer.alloc(32,9),nonce=Buffer.alloc(12,7);
  // HOST fixture envelope contains known non-user keys. The actual KeyStore
  // verifies AEAD, identity, file custody and actual epoch operator signatures.
  await mkdir(keysDir,{mode:0o700});await writeFile(join(keysDir,'wrapping-key.bin'),master,{mode:0o600});
  const clear=Buffer.from(JSON.stringify({profile:'PUBLIC_PAGED_SERVER_KEYS_V1',keysetId:base.keysetId,keys:saved.accounts.map((a,i)=>({networkId:a.networkId,key:Buffer.alloc(32,i+1).toString('hex')}))})),cipher=createCipheriv('aes-256-gcm',master,nonce);cipher.setAAD(Buffer.from('LIANUM/PAGED/PUBLIC-TESTNET/SERVER-KEYS/V1'));const encrypted=Buffer.concat([cipher.update(clear),cipher.final()]);clear.fill(0);
  await writeFile(join(keysDir,'provider-keys.aead'),JSON.stringify({profile:'PUBLIC_PAGED_SERVER_KEYS_AEAD_V1',keysetId:base.keysetId,nonce:nonce.toString('hex'),ciphertext:encrypted.toString('hex'),tag:cipher.getAuthTag().toString('hex')}),{mode:0o600});
  const password=sha(Buffer.concat([Buffer.from('LIANUM/ORIGINAL-SOURCE-FINANCIAL-EPOCH-STORE/5\0'+base.keysetId+'\0'),master]));master.fill(0);
  const policy=Epoch.normalizeSourceFinancialPolicyDataV5({...base,maximumTotalValueAtomic:'3000000000000000',expiresAt:Date.now()+3600000}),unsigned={profile:Epoch.SOURCE_FINANCIAL_EPOCH_V5,chainId:'11155111',genesis,keysetId:base.keysetId,account:base.account,basePolicySHA256:sha(JSON.stringify(base)),epoch:'1',predecessorEpochId:null,checkpoint:{identity:disk.configurationSHA256,revision:disk.revision,dataSHA256:sha(JSON.stringify(disk.operations)),policySHA256:sha(JSON.stringify(base))},reserved:{feeAtomic:disk.operations.reduce((total,item)=>total+BigInt(item.transaction.gasLimit)*BigInt(item.transaction.maxFeePerGas),0n).toString(),valueAtomic:disk.operations.reduce((total,item)=>total+BigInt(item.transaction.value??'0'),0n).toString()},limits:{maximumTotalSuccessorPools:'2',maximumSourcesPerWallet:'2'},policy,issuedAt:Date.now(),nonce:'8'.repeat(64)},epoch=Epoch.normalizeSourceFinancialEpochDataV5({...unsigned,epochId:Epoch.sourceFinancialEpochIdDataV5(unsigned)}),privateBytes=Buffer.alloc(32,1),pub=ECDH.convertKey(Buffer.from(saved.accounts[0].publicKey,'hex'),'secp256k1',undefined,undefined,'uncompressed'),key=createPrivateKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',d:privateBytes.toString('base64url'),x:pub.subarray(1,33).toString('base64url'),y:pub.subarray(33).toString('base64url')}});
  let signature=sign('sha256',Epoch.sourceFinancialEpochMessageV5(epoch),{key,dsaEncoding:'ieee-p1363'});const order=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n,s=BigInt('0x'+signature.subarray(32).toString('hex'));if(s>order/2n)signature=Buffer.concat([signature.subarray(0,32),Buffer.from((order-s).toString(16).padStart(64,'0'),'hex')]);privateBytes.fill(0);
  const epochPath=join(saved.nativeDirectory,'source-operations/financial-epochs.vault');store=await openSourceFinancialEpochStoreV5({path:epochPath,password,basePolicy:base,journalIdentity:disk.configurationSHA256,publicKey:saved.accounts[0].publicKey,createIfMissing:true});const original=await store.read(),accepted=await store.append(epoch,signature.toString('hex'),{revision:original.checkpoint.revision,dataSHA256:original.checkpoint.dataSHA256});store.close();store=null;signature.fill(0);
  // Rows here are HOST retained-state fixtures. Their wire is still the exact
  // real secp wire from the killed Source producer, checked by both consumers.
  for(const row of disk.operations)row.policySHA256=sha(JSON.stringify(policy));disk.revision++;await writeFile(sourcePath,JSON.stringify(disk),{mode:0o600});
  return {epoch,policy,checkpoint:accepted.checkpoint,sourcePath,disk};
 }finally{store?.close();}
}
