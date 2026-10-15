/** Protected readonly DATA below the supervisor. This verifies the retained
 * server envelope and signed history; it emits no Original key handle, lane,
 * proof or permission. Native consumers independently reopen their own keys. */
import assert from 'node:assert/strict';
import {createHash,createDecipheriv} from 'node:crypto';
import {join} from 'node:path';
import {publicPagedAccountFromKeyV1} from '../../chains/public-testnet/wire-v1.mjs';
import {normalizeSourceFinancialPolicyDataV5} from '../../chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs';
import {openSourceFinancialEpochStoreV5} from '../../chains/public-testnet/sepolia-source-financial-epoch-store-v5.mjs';
import {assertPagedSourceReadDirectoryV4,readPagedSourcePrivateBytesV4} from './paged-source-read-files-v4.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const exact=(value,fields)=>assert.deepEqual(Object.keys(value).sort(),fields.slice().sort(),'PAGED_ACTIVE_FINANCIAL_DATA_FIELDS');
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export async function readPagedPublicFinancialHistoryDataV5(input){
 assert.equal(arguments.length,1);exact(input,['directory','keysetId','account','basePolicy']);await assertPagedSourceReadDirectoryV4(input.directory);assert.match(input.keysetId,/^[0-9a-f]{64}$/);const base=normalizeSourceFinancialPolicyDataV5(input.basePolicy);assert.equal(base.keysetId,input.keysetId);assert.equal(base.account,input.account.address);
 const directory=join(input.directory,'keys');await assertPagedSourceReadDirectoryV4(directory);let master,encrypted,clear,store;
 try{
  master=await readPagedSourcePrivateBytesV4(join(directory,'wrapping-key.bin'),32);assert.equal(master.length,32);
  encrypted=await readPagedSourcePrivateBytesV4(join(directory,'provider-keys.aead'),8192);const envelope=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(encrypted));exact(envelope,['profile','keysetId','nonce','ciphertext','tag']);assert.equal(envelope.profile,'PUBLIC_PAGED_SERVER_KEYS_AEAD_V1');assert.equal(envelope.keysetId,input.keysetId);assert.match(envelope.nonce,/^[0-9a-f]{24}$/);assert.match(envelope.tag,/^[0-9a-f]{32}$/);assert.match(envelope.ciphertext,/^(?:[0-9a-f]{2})+$/);
  const decipher=createDecipheriv('aes-256-gcm',master,Buffer.from(envelope.nonce,'hex'));decipher.setAAD(Buffer.from('LIANUM/PAGED/PUBLIC-TESTNET/SERVER-KEYS/V1'));decipher.setAuthTag(Buffer.from(envelope.tag,'hex'));clear=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'hex')),decipher.final()]);const raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear));exact(raw,['profile','keysetId','keys']);assert.equal(raw.profile,'PUBLIC_PAGED_SERVER_KEYS_V1');assert.equal(raw.keysetId,input.keysetId);assert.ok(Array.isArray(raw.keys)&&raw.keys.length===3);
  const ids=['ethereum-sepolia','bitcoin-testnet','solana-devnet'],accounts=raw.keys.map((row,index)=>{exact(row,['networkId','key']);assert.equal(row.networkId,ids[index]);assert.match(row.key,/^[0-9a-f]{64}$/);const key=Buffer.from(row.key,'hex');try{return publicPagedAccountFromKeyV1(row.networkId,key);}finally{key.fill(0);row.key=null;}});
  assert.equal(sha(JSON.stringify(accounts)),input.keysetId,'PAGED_ACTIVE_EPOCH_KEYSET');assert.deepEqual(accounts[0],input.account,'PAGED_ACTIVE_EPOCH_ACCOUNT');
  const password=sha(Buffer.concat([Buffer.from('LIANUM/ORIGINAL-SOURCE-FINANCIAL-EPOCH-STORE/5\0'+input.keysetId+'\0'),master])),identity=sha('ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4\0'+input.keysetId+'\0'+sha(JSON.stringify(input.basePolicy)));
  store=await openSourceFinancialEpochStoreV5({path:join(input.directory,'source-operations/financial-epochs.vault'),password,basePolicy:input.basePolicy,journalIdentity:identity,publicKey:accounts[0].publicKey,createIfMissing:false});const state=await store.read();
  const masterAfter=await readPagedSourcePrivateBytesV4(join(directory,'wrapping-key.bin'),32),encryptedAfter=await readPagedSourcePrivateBytesV4(join(directory,'provider-keys.aead'),8192);try{assert.ok(masterAfter.equals(master)&&encryptedAfter.equals(encrypted),'PAGED_ACTIVE_EPOCH_KEYSET_CHANGED');}finally{masterAfter.fill(0);encryptedAfter.fill(0);}
  return freeze({profile:'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_HISTORY_V5',basePolicy:state.basePolicy,effectivePolicy:state.effectivePolicy,limits:state.limits,history:state.epochs,checkpoint:state.checkpoint});
 }finally{store?.close();master?.fill(0);encrypted?.fill(0);clear?.fill(0);}
}
