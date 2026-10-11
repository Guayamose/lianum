/** Original Nitro laboratory signer, allocated before native cluster birth.
 * The public official fixture is not user/device custody. Only the same original
 * client's private pair and the original provider's opaque request reach KEY.
 * No transport, signer, key, prepared DTO or caller callback creates authority.
 * Unknown delivery permits observation of the retained wire, never another send.
 */
import assert from 'node:assert/strict';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {constants,existsSync,readFileSync,realpathSync} from 'node:fs';
import {mkdir,open,lstat,realpath} from 'node:fs/promises';
import {dirname,join,parse} from 'node:path';
import {fileURLToPath} from 'node:url';
import {performance} from 'node:perf_hooks';
import {Vault} from '../../.internal/runtime/omnichain-product/src/vault.mjs';
import {canonical} from '../../.internal/runtime/omnichain-product/src/privacy.mjs';
import {cloneInput,frozenInput} from '../../packages/components/src/plain-input.mjs';
import {exactRecord} from '../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/paeg/commitments.mjs';
import {publicKeccak256} from '../../.internal/runtime/omnichain-product/src/private-cohort-public-native.mjs';
import {nativeEconomicLocalAddressV2,prepareNativeEconomicLocalSignerV2,consumeNativeEconomicLocalSignerV2,revokeNativeEconomicLocalSignerV2} from '../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/native-economic-local-signing-v2.mjs';
import { encodeCanonicalEvmUnsignedTransaction, assertSignedEvmTransaction } from '../../packages/backend/src/chains/evm/contracts/transaction-wire-codec.mjs';
import {normalizeOwnedEvmNativeValueArbitrumIntent,ownedEvmNativeValueAuditCommitments} from '../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/owned-evm-native-value-profile.mjs';
import {assertOwnedNativeValueEvmDispatchRequest} from '../../.internal/runtime/omnichain-flat-profile/flat-wallet/wallet-platform/modules/chain-adapters/native-value-evm-dispatch-gate.mjs';
import {assertOwnedArbitrumNitroNativeValueCustodyV1,readOwnedArbitrumNitroNativeValueIdentityV1,readOwnedArbitrumNitroNativeValueRpcV1,sendOwnedArbitrumNitroSignedTransactionOnceV1} from './owned-arbitrum-nitro-v1.mjs';

const SCHEMA='OWNED_ORIGINAL_NITRO_NATIVE_VALUE_CUSTODY_V1';
const ACCOUNTS_SHA='0af22a05583b70cda4d3b985ac710203a235d76c82513637fde96b68abeec412';
const slots=new WeakMap(),preparedEntries=new WeakMap();
const copy=cloneInput,freeze=frozenInput,hash=v=>createHash('sha256').update(canonical(v)).digest('hex');
const quantity=v=>{assert(typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(v)&&v.length<=66,'NITRO_NATIVE_QUANTITY');return BigInt(v);};
const hex=v=>'0x'+BigInt(v).toString(16);
const fileFields=['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'];
function repository(){let path=dirname(fileURLToPath(import.meta.url));while(path!==parse(path).root){
 if(existsSync(join(path,'scripts/layout.json'))&&existsSync(join(path,'package.json'))&&JSON.parse(readFileSync(join(path,'package.json'),'utf8')).name==='lianum')return realpathSync(path);path=dirname(path);}
 throw new Error('NITRO_NATIVE_ORIGINAL_REPOSITORY');}
async function privateDirectory(path){assert.equal(await realpath(path),path,'NITRO_NATIVE_PRIVATE_PATH');const s=await lstat(path);
 assert(s.isDirectory()&&!s.isSymbolicLink()&&(s.mode&0o777)===0o700&&s.uid===process.getuid(),'NITRO_NATIVE_PRIVATE_DIRECTORY');}
function state(custody){const s=slots.get(custody);assert(s&&!s.closed&&!s.poisoned,'NITRO_NATIVE_CUSTODY_UNAVAILABLE');return s;}
function live(custody,runtime){const s=state(custody);assert.equal(s.closing,false,'NITRO_NATIVE_CUSTODY_CLOSING');assertOwnedArbitrumNitroNativeValueCustodyV1(runtime,custody);
 if(s.runtime)assert.equal(s.runtime,runtime,'NITRO_NATIVE_ORIGINAL_CUSTODY_PAIR');return s;}
async function ciphertext(s){await privateDirectory(s.directory);const before=await lstat(s.vault.path);
 assert(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o777)===0o600&&before.uid===process.getuid()&&before.size>0&&before.size<=2*1024*1024,'NITRO_NATIVE_PRIVATE_FILE');
 const handle=await open(s.vault.path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const opened=await handle.stat();for(const k of fileFields)assert.equal(opened[k],before[k],'NITRO_NATIVE_PRIVATE_FILE_CHANGED');
 bytes=Buffer.alloc(before.size+1);let offset=0;while(offset<bytes.length){const r=await handle.read(bytes,offset,bytes.length-offset,offset);if(!r.bytesRead)break;offset+=r.bytesRead;}
 assert.equal(offset,before.size,'NITRO_NATIVE_PRIVATE_FILE_CHANGED');const digest=createHash('sha256').update(bytes.subarray(0,offset)).digest('hex');
 for(const after of [await handle.stat(),await lstat(s.vault.path)])for(const k of fileFields)assert.equal(after[k],before[k],'NITRO_NATIVE_PRIVATE_FILE_CHANGED');
 await privateDirectory(s.directory);return digest;}finally{bytes?.fill(0);await handle.close();}}
async function unchanged(s){try{assert.equal(await ciphertext(s),s.cipherSHA,'NITRO_NATIVE_CIPHERTEXT_CHANGED');}catch(e){s.poisoned=true;throw e;}}
async function authenticate(s,expected,replace=false){let record;try{const before=await ciphertext(s);if(!replace)assert.equal(before,s.cipherSHA,'NITRO_NATIVE_CIPHERTEXT_CHANGED');
 record=await s.vault.read(s.password);assert.deepEqual(record,expected,'NITRO_NATIVE_ORIGINAL_RECORD_CHANGED');assert.equal(await ciphertext(s),before,'NITRO_NATIVE_CIPHERTEXT_CHANGED');s.cipherSHA=before;
 }catch(e){s.poisoned=true;throw e;}finally{if(record?.data)record.data.privateKey='';}}
async function save(s,next){await unchanged(s);try{const saved=await s.vault.update(s.password,s.record.revision,()=>copy(next));
 await authenticate(s,saved,true);s.record=saved;}catch(e){s.poisoned=true;throw e;}}
function entryData(e){return {leaseId:e.prepared.binding.leaseId,phase:e.phase,prepared:copy(e.prepared),signed:e.signed?copy(e.signed):null};}
async function persist(s,e){const next=s.record.data.entries.map(item=>item.leaseId===e.prepared.binding.leaseId?entryData(e):item);
 assert(next.some(item=>item.leaseId===e.prepared.binding.leaseId),'NITRO_NATIVE_ORIGINAL_ENTRY');await save(s,{...s.record.data,entries:next});}

/** Fixed public laboratory fixture only. This does not issue a runtime/send
 * authority; the factory retains this opaque custody before spawning Python. */
export async function createOriginalArbitrumNativeValueCustodyV1(){assert.equal(arguments.length,0,'NITRO_NATIVE_NO_OPTIONS');
 const root=repository(),fixture=join(root,'.local/dependencies/arbitrum-nitro-v1/prepared-native-value-v1/scripts/accounts.ts');
 const fixtureStat=await lstat(fixture);assert(fixtureStat.isFile()&&!fixtureStat.isSymbolicLink()&&fixtureStat.uid===process.getuid()&&(fixtureStat.mode&0o777)===0o600,'NITRO_NATIVE_ORIGINAL_KEY_FIXTURE');
 assert.equal(await realpath(fixture),fixture);assert.equal(createHash('sha256').update(readFileSync(fixture)).digest('hex'),ACCOUNTS_SHA,'NITRO_NATIVE_ORIGINAL_KEY_FIXTURE');
 // Official namedAccount('user_alice') uses this SHA-256 seed; Alice is funded
 // by the pinned original setup. No caller key/name/mnemonic is accepted.
 const key=createHash('sha256').update('user_alice','utf8').digest();let retained=false;
 try{const address=await nativeEconomicLocalAddressV2(key),base=join(root,'.local/owned-arbitrum-native-value-keys-v1');
 await privateDirectory(join(root,'.local'));try{await mkdir(base,{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}await privateDirectory(base);
 const directory=join(base,randomUUID());await mkdir(directory,{mode:0o700});await privateDirectory(directory);
 const password=randomBytes(32).toString('hex'),vault=new Vault(join(directory,'original-nitro-native-value.vault'));
 const record=await vault.create({schema:SCHEMA,profile:'OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1',chainId:'42161',fixtureSHA256:ACCOUNTS_SHA,address,privateKey:key.toString('hex'),entries:[]},password);
 const custody=Object.freeze(Object.create(null)),s={directory,password,vault,record,key,address,cipherSHA:null,entries:new Map(),runtime:null,identity:null,closed:false,closing:false,poisoned:false,uncertain:false,active:null,signer:null};
 slots.set(custody,s);await authenticate(s,record,true);retained=true;return custody;
 }finally{if(!retained)key.fill(0);}}
export function readOriginalArbitrumNativeValueCustodyPublicV1(custody){assert.equal(arguments.length,1);const s=state(custody);
 return Object.freeze({address:s.address,scratchDirectory:s.directory,localLaboratorySigner:true,deviceCustody:false,publicNetwork:false});}
export async function bindOriginalArbitrumNativeValueCustodyV1(custody,runtime){assert.equal(arguments.length,2);const s=live(custody,runtime);
 assert.equal(s.runtime,null,'NITRO_NATIVE_ORIGINAL_CUSTODY_ALREADY_BOUND');s.runtime=runtime;
 const identity=copy(await readOwnedArbitrumNitroNativeValueIdentityV1(runtime));live(custody,runtime);assert.equal(identity.profile,'OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1');
 assert.equal(identity.chainId,'42161');assert.equal(runtime.metadata.evmGenesis,'0x'+identity.genesis);s.identity=freeze(identity);await unchanged(s);live(custody,runtime);}
async function currentIdentity(custody,runtime){const s=live(custody,runtime);assert(s.identity,'NITRO_NATIVE_ORIGINAL_IDENTITY_REQUIRED');
 assert.deepEqual(await readOwnedArbitrumNitroNativeValueIdentityV1(runtime),s.identity,'NITRO_NATIVE_ORIGINAL_IDENTITY_CHANGED');live(custody,runtime);await unchanged(s);live(custody,runtime);return s;}
const rpc=(runtime,method,params)=>readOwnedArbitrumNitroNativeValueRpcV1(runtime,method,params);
const requestFor=t=>({from:t.from,to:t.to,value:hex(t.value),data:t.data,gas:hex(t.gas),gasPrice:hex(t.gasPrice),nonce:hex(t.nonce),chainId:hex(t.chainId),type:'0x0'});
function header(value){assert(value&&/^0x[0-9a-f]{64}$/.test(value.hash)&&Array.isArray(value.transactions),'NITRO_NATIVE_HEADER');quantity(value.number);quantity(value.timestamp);return value;}
function assertEntry(custody,runtime,prepared){const s=live(custody,runtime),e=preparedEntries.get(prepared);
 assert(e&&s.entries.get(prepared.binding.leaseId)===e&&e.custody===custody&&e.prepared===prepared,'NITRO_NATIVE_ORIGINAL_PREPARATION_REQUIRED');return {s,e};}
/** Nitro produces blocks continuously. Prepared head must remain canonical;
 * fresh original nonce, funds, code and total L1+L2 estimate remain checked.
 * No prepared timestamp/fee/window is replaced and legacy Anvil is unchanged. */
export async function assertOriginalArbitrumNativeValuePreparedCurrentV1(custody,runtime,prepared){assert.equal(arguments.length,3);const {s,e}=assertEntry(custody,runtime,prepared);
 assert(['PREPARED','SIGNED','ATTESTED','SEND_PENDING'].includes(e.phase)&&!s.uncertain,'NITRO_NATIVE_PREPARATION_NOT_LIVE');const started=performance.now();await currentIdentity(custody,runtime);
 const tx=prepared.transaction,anchor=header(await rpc(runtime,'eth_getBlockByNumber',[prepared.head.number,false]));assert.equal(anchor.hash,prepared.head.hash,'NITRO_NATIVE_PREPARED_HEAD_CHANGED');
 const head=header(await rpc(runtime,'eth_getBlockByNumber',['latest',false]));assert(quantity(head.number)>=quantity(prepared.head.number)&&quantity(head.timestamp)>=quantity(prepared.head.timestamp),'NITRO_NATIVE_HEAD_REGRESSION');
 for(const tag of ['latest','pending'])assert.equal(quantity(await rpc(runtime,'eth_getTransactionCount',[tx.from,tag])).toString(),tx.nonce,'NITRO_NATIVE_PREPARED_NONCE_CHANGED');
 assert.equal(quantity(await rpc(runtime,'eth_getBalance',[tx.from,'latest'])).toString(),prepared.funds.balanceWei,'NITRO_NATIVE_PREPARED_BALANCE_CHANGED');
 const code=await rpc(runtime,'eth_getCode',[tx.to,'latest']);assert.equal('0x'+Buffer.from(publicKeccak256(Buffer.from(code.slice(2),'hex'))).toString('hex'),prepared.funds.targetCodeHash,'NITRO_NATIVE_PREPARED_CODE_CHANGED');
 assert(quantity(await rpc(runtime,'eth_gasPrice',[]))<=BigInt(tx.gasPrice),'NITRO_NATIVE_PREPARED_FEE_TOO_LOW');
 const estimate=quantity(await rpc(runtime,'eth_estimateGas',[requestFor(tx),'latest']));assert(estimate>0n&&estimate<=BigInt(tx.gas),'NITRO_NATIVE_PREPARED_TOTAL_GAS_TOO_HIGH');
 assert.equal(header(await rpc(runtime,'eth_getBlockByNumber',[prepared.head.number,false])).hash,prepared.head.hash,'NITRO_NATIVE_PREPARED_HEAD_CHANGED');
 assert(BigInt(prepared.funds.balanceWei)>=BigInt(tx.value)+BigInt(tx.gas)*BigInt(tx.gasPrice),'NITRO_NATIVE_SOLVER_VALUE_AND_TOTAL_FEE_FUNDS');
 await unchanged(s);live(custody,runtime);assert(performance.now()-started<30000,'NITRO_NATIVE_CURRENT_AUDIT_TOO_OLD');
 assert(['PREPARED','SIGNED','ATTESTED','SEND_PENDING'].includes(e.phase)&&!s.uncertain,'NITRO_NATIVE_PREPARATION_NOT_LIVE');}

export function dispatchOriginalArbitrumNativeValueV1(custody,runtime,request){assert.equal(arguments.length,3);const s=live(custody,runtime);
 assert.equal(s.active,null,'NITRO_NATIVE_DISPATCH_BUSY');assert.equal(s.uncertain,false,'NITRO_NATIVE_UNKNOWN_NO_FRESH_SEND');
 const scope=assertOwnedNativeValueEvmDispatchRequest(request,runtime);exactRecord(scope,['beforeSend','beforeSign','binding','onSigned','transaction']);
 const {transaction,binding}=normalizeOwnedEvmNativeValueArbitrumIntent({transaction:scope.transaction,binding:scope.binding},{accounts:[s.address],genesis:runtime.metadata.evmGenesis});
 assert(!s.entries.has(binding.leaseId),'NITRO_NATIVE_ORIGINAL_LEASE_USED_NO_RESEND');assert(s.record.data.entries.length<32,'NITRO_NATIVE_ORIGINAL_HISTORY_FULL');
 let entry={custody,prepared:null,signed:null,phase:'ADMITTED'},signer=null,keyPossible=false;
 // Hold acquisition before the first await; close can fence and drain it.
 const work=Promise.resolve().then(async()=>{try{await currentIdentity(custody,runtime);
 const head=header(await rpc(runtime,'eth_getBlockByNumber',['latest',false]));const nonce=await rpc(runtime,'eth_getTransactionCount',[transaction.from,'latest']);
 assert.equal(await rpc(runtime,'eth_getTransactionCount',[transaction.from,'pending']),nonce,'NITRO_NATIVE_NONCE_NOT_EXCLUSIVE');
 const gasPrice=quantity(await rpc(runtime,'eth_gasPrice',[]));assert(gasPrice>0n,'NITRO_NATIVE_FEE_PRICE');
 const tx={chainId:'42161',from:transaction.from,to:transaction.to,nonce:quantity(nonce).toString(),gasPrice:gasPrice.toString(),gas:quantity(transaction.gas).toString(),value:quantity(transaction.value).toString(),data:transaction.data};
 const balanceWei=quantity(await rpc(runtime,'eth_getBalance',[tx.from,head.number])).toString(),code=await rpc(runtime,'eth_getCode',[tx.to,head.number]);
 assert(typeof code==='string'&&/^0x(?:[0-9a-f]{2})*$/.test(code),'NITRO_NATIVE_TARGET_CODE');
 const estimatedGas=quantity(await rpc(runtime,'eth_estimateGas',[requestFor(tx),head.number])).toString(),maximumFeeWei=(BigInt(tx.gas)*gasPrice).toString();
 assert(BigInt(estimatedGas)>0n&&BigInt(estimatedGas)<=BigInt(tx.gas),'NITRO_NATIVE_TOTAL_GAS_ESTIMATE');assert(BigInt(balanceWei)>=BigInt(tx.value)+BigInt(maximumFeeWei),'NITRO_NATIVE_SOLVER_VALUE_AND_TOTAL_FEE_FUNDS');
 const exactHead={number:head.number,hash:head.hash,timestamp:head.timestamp},targetCodeHash='0x'+Buffer.from(publicKeccak256(Buffer.from(code.slice(2),'hex'))).toString('hex');
 const prepared=freeze({profile:'LIANUM_OWNED_LOCAL_EVM_NATIVE_VALUE_V1',binding,genesis:runtime.metadata.evmGenesis,head:exactHead,transaction:tx,unsignedWire:encodeCanonicalEvmUnsignedTransaction(tx),
 funds:{balanceWei,estimatedGas,targetCodeHash,maximumFeeWei,estimatedFeeWei:(BigInt(estimatedGas)*gasPrice).toString(),...ownedEvmNativeValueAuditCommitments({binding,transaction:tx,head:exactHead,balanceWei,estimatedGas,targetCodeHash})}});
 entry.prepared=prepared;entry.phase='PREPARED';s.entries.set(binding.leaseId,entry);preparedEntries.set(prepared,entry);
 await save(s,{...s.record.data,entries:[...s.record.data.entries,entryData(entry)]});live(custody,runtime);
 // Full original key record/curve/wire preparation precedes the final original
 // provider guard. Only the fixed synchronous ownership/fence check follows;
 // no await, RPC, import or external key read intervenes before KEY.
 await authenticate(s,s.record);live(custody,runtime);signer=await prepareNativeEconomicLocalSignerV2(s.key,prepared.transaction);s.signer=signer;
 await assertOriginalArbitrumNativeValuePreparedCurrentV1(custody,runtime,prepared);
 assert.equal(await scope.beforeSign(prepared),undefined,'NITRO_NATIVE_FINAL_KEY_GUARD_ASSERT_ONLY');live(custody,runtime);
 keyPossible=true;entry.phase='SIGNING_UNKNOWN';const signed=assertSignedEvmTransaction(consumeNativeEconomicLocalSignerV2(signer).nativeWire,prepared.transaction);
 assert.equal(signed.unsignedWire,prepared.unsignedWire);entry.signed=freeze({nativeWire:signed.nativeWire,nativeId:signed.nativeId,transactionSHA256:signed.transactionSHA256});entry.phase='SIGNED';
 await persist(s,entry);live(custody,runtime);assert.equal(await scope.onSigned(entry.signed),undefined,'NITRO_NATIVE_PROVIDER_GUARD_ASSERT_ONLY');
 entry.phase='ATTESTED';await persist(s,entry);live(custody,runtime);
 // The durable latch precedes the final original SEND guard and native RPC.
 entry.phase='SEND_PENDING';await persist(s,entry);assert.equal(await scope.beforeSend(),undefined,'NITRO_NATIVE_SEND_GUARD_ASSERT_ONLY');live(custody,runtime);
 entry.phase='BROADCAST_UNKNOWN';const result=await sendOwnedArbitrumNitroSignedTransactionOnceV1(runtime,entry.signed.nativeWire);
 assert.equal(result.transactionHash,entry.signed.nativeId,'NITRO_NATIVE_BROADCAST_HASH_CHANGED');assert.equal(result.admittedOnce,true);entry.phase='BROADCAST';await persist(s,entry);live(custody,runtime);
 return freeze({nativeId:entry.signed.nativeId,transactionSHA256:entry.signed.transactionSHA256});
 }catch(error){if(entry.prepared){entry.phase=keyPossible?'UNKNOWN':'PRE_SIGN_REJECTED';if(keyPossible)s.uncertain=true;
 if(!s.poisoned&&!s.closing)try{await persist(s,entry);}catch{}}
 throw error;}finally{if(signer)revokeNativeEconomicLocalSignerV2(signer);if(s.signer===signer)s.signer=null;}});
 s.active=work;return work.finally(()=>{if(s.active===work)s.active=null;});}

/** Actual receipt observation of this original retained wire. No proof, key,
 * mine, timestamp reset, send or finalized alias occurs on this path. The full
 * native health source still independently verifies receipt/trace/finality. */
export async function observeOriginalArbitrumNativeValueV1(custody,runtime,raw){assert.equal(arguments.length,3);const query=copy(raw);exactRecord(query,['nativeId','nativeWire','transactionSHA256']);
 const s=await currentIdentity(custody,runtime);for(const k of ['nativeId','transactionSHA256'])assert(/^[0-9a-f]{64}$/.test(query[k]),'NITRO_NATIVE_OBSERVATION_HASH');
 const e=[...s.entries.values()].find(item=>item.signed?.nativeId==='0x'+query.nativeId);assert(e,'NITRO_NATIVE_ORIGINAL_SIGNED_REQUIRED');
 assert.equal(query.nativeWire,e.signed.nativeWire);assert.equal(query.transactionSHA256,e.signed.transactionSHA256);assertSignedEvmTransaction(query.nativeWire,e.prepared.transaction);await unchanged(s);
 const observed=await rpc(runtime,'eth_getTransactionByHash',[e.signed.nativeId]),receipt=await rpc(runtime,'eth_getTransactionReceipt',[e.signed.nativeId]);
 if(!receipt)return freeze({status:observed?'pending':'unknown',nativeId:query.nativeId,nativeWire:null});assert(observed,'NITRO_NATIVE_OBSERVED_TRANSACTION_MISSING');
 const t=e.prepared.transaction;for(const k of ['from','to'])assert.equal(observed[k],t[k]);for(const k of ['nonce','gas','gasPrice','value','chainId'])assert.equal(quantity(observed[k]).toString(),t[k]);
 assert.equal(quantity(observed.type),0n);assert.equal(observed.input,t.data);assert.equal(receipt.transactionHash,e.signed.nativeId);
 for(const k of ['blockHash','blockNumber','transactionIndex'])assert.equal(observed[k],receipt[k],'NITRO_NATIVE_RECEIPT_JOIN');
 const included=header(await rpc(runtime,'eth_getBlockByNumber',[receipt.blockNumber,false]));assert.equal(included.hash,receipt.blockHash,'NITRO_NATIVE_CANONICAL_RECEIPT');
 assert.equal(included.transactions[Number(quantity(receipt.transactionIndex))],e.signed.nativeId,'NITRO_NATIVE_CANONICAL_TRANSACTION_INDEX');
 assert(quantity(included.number)>quantity(e.prepared.head.number)&&quantity(included.timestamp)>=quantity(e.prepared.head.timestamp),'NITRO_NATIVE_INCLUDED_BEFORE_PREPARATION');
 assert.equal(header(await rpc(runtime,'eth_getBlockByNumber',[e.prepared.head.number,false])).hash,e.prepared.head.hash,'NITRO_NATIVE_PREPARED_HEAD_CHANGED');
 assert(quantity(receipt.status)===0n||quantity(receipt.status)===1n);assert(quantity(receipt.gasUsed)<=BigInt(t.gas));
 assert.deepEqual(await rpc(runtime,'eth_getTransactionByHash',[e.signed.nativeId]),observed,'NITRO_NATIVE_OBSERVATION_CHANGED');
 assert.deepEqual(await rpc(runtime,'eth_getTransactionReceipt',[e.signed.nativeId]),receipt,'NITRO_NATIVE_OBSERVATION_CHANGED');
 await currentIdentity(custody,runtime);return freeze({status:quantity(receipt.status)===1n?'observed':'adverse',nativeId:query.nativeId,nativeWire:quantity(receipt.status)===1n?e.signed.nativeWire:null});}
export async function closeOriginalArbitrumNativeValueCustodyV1(custody){assert.equal(arguments.length,1);const s=slots.get(custody);assert(s,'NITRO_NATIVE_ORIGINAL_CUSTODY_REQUIRED');
 if(s.closeWork)return s.closeWork;s.closing=true;if(s.signer)revokeNativeEconomicLocalSignerV2(s.signer);
 s.closeWork=(async()=>{let timer;try{if(s.active)await Promise.race([s.active.catch(()=>{}),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('NITRO_NATIVE_CUSTODY_DRAIN_TIMEOUT')),30000);})]);}
 finally{clearTimeout(timer);s.closed=true;s.key.fill(0);s.password=null;if(s.record?.data)s.record.data.privateKey='';s.record=null;}
 return Object.freeze({closed:true,nativeKeyOutcomeUncertain:s.uncertain,privateJournalRetained:true});})() ;return s.closeWork;}
