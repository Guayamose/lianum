/** Five fixed local synthetic-chain signers, encrypted before Anvil starts.
 * Only the economic issuer receives recovery credentials, inside its own AEAD.
 * Genesis and runtime snapshot JSON contain public account state only. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {constants} from 'node:fs';
import {open,lstat,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {Vault} from '../../../../../engine/src/crypto/vault.mjs';
import {canonical} from '../../../../../engine/src/crypto/privacy.mjs';
import {consumeNativeEconomicObservedCustodyRequestV2} from './owned-evm-v2-runtime.mjs';
import {nativeEconomicLocalAddressV2,prepareNativeEconomicLocalSignerV2,consumeNativeEconomicLocalSignerV2,revokeNativeEconomicLocalSignerV2} from './native-economic-local-signing-v2.mjs';
export const NATIVE_ECONOMIC_ANVIL_PIN_V2=Object.freeze(['foundry-v1.8.4/anvil','be5129d636ea18440d43908536f13ba6578859b695f2ca33f1f09a00aa9dc176']);
const slots=new WeakMap(),signingLeases=new WeakMap(),hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const schema='NATIVE_ECONOMIC_LOCAL_KEYS_V2';
const quantity=n=>'0x'+BigInt(n).toString(16);
function config(input,observedOriginal=false){
 assert.ok(input&&Object.getPrototypeOf(input)===Object.prototype);assert.deepEqual(Reflect.ownKeys(input).sort(),['cwd','family','profile']);
 const {cwd,family,profile}=input;assert.ok(family==='receiver'||family==='graphNative');
 assert.deepEqual(Object.keys(profile).sort(),['accountBalanceWei','accountCount','chainId','genesisTimestamp','hardfork','manualMining','maxGas','name','publicNetwork'].sort());
 assert.equal(profile.accountCount,5);assert.equal(profile.hardfork,'cancun');assert.equal(profile.maxGas,30000000);assert.equal(profile.accountBalanceWei,'10000000000000000000');
 assert.equal(profile.chainId,family==='receiver'?31337:1);
 if(observedOriginal){
  assert.equal(profile.name,family==='receiver'?'LOCAL_NATIVE_ECONOMIC_OBSERVED_RECEIVER_V2':'LOCAL_NATIVE_ECONOMIC_OBSERVED_GRAPH_V2');
  assert.ok(Number.isSafeInteger(profile.genesisTimestamp)&&profile.genesisTimestamp>0&&profile.genesisTimestamp<=Math.floor(Date.now()/1000),'ECONOMIC_OBSERVED_ORIGINAL_GENESIS_TIME');
 }else assert.equal(profile.genesisTimestamp,family==='receiver'?1900000210:1900000310);
 assert.equal(profile.publicNetwork,false);assert.equal(profile.manualMining,true);return {cwd,family,profile:structuredClone(profile)};
}
async function privateDirectory(cwd){assert.equal(await realpath(cwd),cwd);const st=await lstat(cwd);assert.ok(st.isDirectory()&&!st.isSymbolicLink()&&(st.mode&0o777)===0o700&&st.uid===process.getuid());}
function publicGenesis(profile,accounts){
 const config={chainId:profile.chainId,homesteadBlock:0,eip150Block:0,eip155Block:0,eip158Block:0,byzantiumBlock:0,constantinopleBlock:0,petersburgBlock:0,istanbulBlock:0,berlinBlock:0,londonBlock:0,terminalTotalDifficulty:0,mergeNetsplitBlock:0,shanghaiTime:0,cancunTime:0};
 return {config,nonce:'0x0000000000000000',timestamp:quantity(profile.genesisTimestamp),extraData:'0x',gasLimit:quantity(profile.maxGas),difficulty:'0x0',mixHash:'0x'+'00'.repeat(32),coinbase:'0x'+'00'.repeat(20),number:0,gasUsed:'0x0',parentHash:'0x'+'00'.repeat(32),baseFeePerGas:'0x3b9aca00',blobGasUsed:'0x0',excessBlobGas:'0x0',alloc:Object.fromEntries(accounts.map(a=>[a.slice(2),{balance:quantity(profile.accountBalanceWei),nonce:'0x0',code:'0x',storage:{}}]))};
}
const custodyFileFields=['dev','ino','uid','size','mode','nlink','mtimeMs','ctimeMs'];
const MAX_CUSTODY_CIPHERTEXT_BYTES=2*1024*1024;
function alive(state){assert.ok(!state.closed&&!state.poisoned,'NATIVE_ECONOMIC_ORIGINAL_CUSTODY');}
function poison(state){
 state.poisoned=true;
 for(const lease of [...state.leases])revokeNativeEconomicCustodySigningV2(lease);
}
/** Fresh physical read of the immutable ciphertext, not a cached native view.
 * Only a full AEAD/key check can establish the retained digest below. */
async function ciphertext(state){
 alive(state);await privateDirectory(state.cwd);alive(state);
 const before=await lstat(state.vault.path);
 assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o777)===0o600&&before.uid===process.getuid());
 assert.ok(before.size>0&&before.size<=MAX_CUSTODY_CIPHERTEXT_BYTES,'NATIVE_ECONOMIC_KEYS_FILE_SIZE');
 const file=await open(state.vault.path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const opened=await file.stat();assert.ok(opened.isFile());
  for(const key of custodyFileFields)assert.equal(opened[key],before[key],'NATIVE_ECONOMIC_KEYS_FILE_CHANGED');
  const bytes=Buffer.alloc(before.size+1);let offset=0;
  while(offset<bytes.length){
   const {bytesRead}=await file.read(bytes,offset,bytes.length-offset,offset);
   if(bytesRead===0)break;offset+=bytesRead;
  }
  assert.equal(offset,before.size,'NATIVE_ECONOMIC_KEYS_FILE_CHANGED');
  const digest=createHash('sha256').update(bytes.subarray(0,offset)).digest('hex');
  const after=await file.stat();
  for(const key of custodyFileFields)assert.equal(after[key],before[key],'NATIVE_ECONOMIC_KEYS_FILE_CHANGED');
  const named=await lstat(state.vault.path);
  for(const key of custodyFileFields)assert.equal(named[key],before[key],'NATIVE_ECONOMIC_KEYS_FILE_CHANGED');
  await privateDirectory(state.cwd);alive(state);
  return Object.freeze({pin:Object.freeze({bytes:offset,sha256:digest}),identity:Object.freeze(Object.fromEntries(custodyFileFields.map(key=>[key,before[key]])))});
 }finally{await file.close();}
}
async function retainedCiphertext(state){
 try{
  const current=await ciphertext(state);alive(state);
  assert.ok(state.ciphertext,'NATIVE_ECONOMIC_KEYS_AUTHENTICATED_CIPHERTEXT_REQUIRED');
  assert.deepEqual(current.pin,state.ciphertext,'NATIVE_ECONOMIC_KEYS_CIPHERTEXT_CHANGED');return current.pin;
 }catch(error){poison(state);throw error;}
}
async function check(state){
 let current;
 try{
  const before=await ciphertext(state);alive(state);
  if(state.ciphertext)assert.deepEqual(before.pin,state.ciphertext,'NATIVE_ECONOMIC_KEYS_CIPHERTEXT_CHANGED');
  current=await state.vault.read(state.password);alive(state);
  assert.equal(current.revision,state.revision,'NATIVE_ECONOMIC_KEYS_REVISION_CHANGED');assert.equal(hash(current.data),state.commitment,'NATIVE_ECONOMIC_KEYS_CHANGED');
  assert.deepEqual(Object.keys(current.data).sort(),['accounts','family','privateKeys','profile','runtimePin','schema'].sort());
  assert.equal(current.data.schema,schema);assert.equal(current.data.family,state.family);assert.deepEqual(current.data.profile,state.profile);assert.deepEqual(current.data.runtimePin,NATIVE_ECONOMIC_ANVIL_PIN_V2);
  assert.deepEqual(current.data.accounts,state.accounts);assert.equal(current.data.privateKeys.length,5);
  for(let i=0;i<5;i++){
   assert.ok(typeof current.data.privateKeys[i]==='string'&&/^[0-9a-f]{64}$/.exec(current.data.privateKeys[i])?.[0]===current.data.privateKeys[i]);const key=Buffer.from(current.data.privateKeys[i],'hex');
   try{assert.equal(await nativeEconomicLocalAddressV2(key),state.accounts[i],'NATIVE_ECONOMIC_KEYS_PUBLIC_BINDING');alive(state);}finally{key.fill(0);}
  }
  const after=await ciphertext(state);alive(state);
  assert.deepEqual(after,before,'NATIVE_ECONOMIC_KEYS_CIPHERTEXT_CHANGED');
  // The digest is published only after authenticating this exact file's AEAD,
  // record, revision and all five original public-key bindings.
  if(!state.ciphertext)state.ciphertext=after.pin;
  return current;
 }catch(error){current?.data?.privateKeys?.fill('');poison(state);throw error;}
}
function original(custody){const state=slots.get(custody);assert.ok(state&&!state.closed&&!state.poisoned,'NATIVE_ECONOMIC_ORIGINAL_CUSTODY');return state;}
function capability(state){const cap=Object.freeze(Object.create(null));slots.set(cap,state);return cap;}
export async function createNativeEconomicLocalCustodyV2(input){
 assert.equal(arguments.length,1);return createOriginalNativeEconomicCustodyV2(config(input));
}
/** Private one-use request from the two new fixed observed runtime factories.
 * A copied configuration cannot select an observed genesis or acquire signers. */
export async function createNativeEconomicObservedLocalCustodyV2(token){
 assert.equal(arguments.length,1);return createOriginalNativeEconomicCustodyV2(config(consumeNativeEconomicObservedCustodyRequestV2(token),true));
}
async function createOriginalNativeEconomicCustodyV2(state){
 await privateDirectory(state.cwd);
 const accounts=[],privateKeys=[];state.password=randomBytes(32).toString('hex');state.vault=new Vault(join(state.cwd,'native-economic-keys-v2.vault'));
 try{
  for(let i=0;i<5;i++){const key=randomBytes(32);try{accounts.push(await nativeEconomicLocalAddressV2(key));privateKeys.push(key.toString('hex'));}finally{key.fill(0);}}
  assert.equal(new Set(accounts).size,5);state.accounts=accounts;state.closed=false;state.leases=new Set();
  const data={schema,family:state.family,profile:state.profile,runtimePin:[...NATIVE_ECONOMIC_ANVIL_PIN_V2],accounts,privateKeys};
  const record=await state.vault.create(data,state.password);state.revision=record.revision;state.commitment=hash(record.data);await check(state);
  const bytes=Buffer.from(canonical(publicGenesis(state.profile,accounts))),path=join(state.cwd,'native-economic-genesis-v2.json');
  const file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  const directory=await open(state.cwd,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);try{await directory.sync();}finally{await directory.close();}
  state.genesis={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};await assertNativeEconomicGenesisV2(state.genesis);
  return capability(state);
 }finally{privateKeys.fill('');}
}
export async function assertNativeEconomicGenesisV2(pin){
 assert.equal(arguments.length,1);assert.deepEqual(Object.keys(pin).sort(),['bytes','path','sha256']);
 const before=await lstat(pin.path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&before.nlink===1&&(before.mode&0o777)===0o600&&before.uid===process.getuid());assert.equal(before.size,pin.bytes);assert.ok(pin.bytes>0&&pin.bytes<16384);
 const file=await open(pin.path,constants.O_RDONLY|constants.O_NOFOLLOW);try{
  const st=await file.stat();for(const k of ['dev','ino','uid','size','mtimeMs','ctimeMs'])assert.equal(st[k],before[k]);
  const bytes=await file.readFile();assert.equal(bytes.length,pin.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),pin.sha256,'NATIVE_ECONOMIC_GENESIS_CHANGED');
  const after=await file.stat();for(const k of ['dev','ino','uid','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k]);
 }finally{await file.close();}const named=await lstat(pin.path);for(const k of ['dev','ino','uid','size','mtimeMs','ctimeMs'])assert.equal(named[k],before[k]);
}
export async function reopenNativeEconomicLocalCustodyV2(input,retained){
 assert.equal(arguments.length,2);const state=config(input);assert.deepEqual(Object.keys(retained).sort(),['accounts','commitment','genesis','password','path','revision']);
 assert.equal(retained.path,join(state.cwd,'native-economic-keys-v2.vault'));assert.ok(typeof retained.password==='string'&&/^[0-9a-f]{64}$/.exec(retained.password)?.[0]===retained.password);assert.equal(retained.revision,0);
 assert.equal(retained.genesis.path,join(state.cwd,'native-economic-genesis-v2.json'));assert.ok(Array.isArray(retained.accounts)&&retained.accounts.length===5&&new Set(retained.accounts).size===5);
 state.password=retained.password;state.revision=retained.revision;state.commitment=retained.commitment;state.accounts=structuredClone(retained.accounts);state.genesis=structuredClone(retained.genesis);state.vault=new Vault(retained.path);state.closed=false;state.leases=new Set();
 const record=await check(state);await assertNativeEconomicGenesisV2(state.genesis);
 // The fixed genesis must describe these authenticated signers, not a copied
 // config that merely matches a caller-supplied digest.
 assert.equal(createHash('sha256').update(canonical(publicGenesis(state.profile,record.data.accounts))).digest('hex'),state.genesis.sha256,'NATIVE_ECONOMIC_GENESIS_KEY_BINDING');
 return capability(state);
}
export function nativeEconomicLocalCustodyPublicV2(custody){
 assert.equal(arguments.length,1);const state=original(custody);return Object.freeze({accounts:Object.freeze([...state.accounts]),genesis:Object.freeze({...state.genesis}),commitment:state.commitment,revision:state.revision});
}
export async function checkNativeEconomicLocalCustodyV2(custody){
 assert.equal(arguments.length,1);const state=original(custody);
 try{await retainedCiphertext(state);await assertNativeEconomicGenesisV2(state.genesis);return nativeEconomicLocalCustodyPublicV2(custody);}
 catch(error){poison(state);throw error;}
}
export async function signNativeEconomicCustodyTransactionV2(custody,transaction){
 assert.equal(arguments.length,2);original(custody);
 const prepared=Object.freeze({transaction:Object.freeze(structuredClone(transaction))});
 const lease=await prepareNativeEconomicCustodySigningV2(custody,prepared);
 try{return consumeNativeEconomicCustodySigningV2(custody,lease,prepared);}
 finally{revokeNativeEconomicCustodySigningV2(lease);}
}
export async function captureNativeEconomicLocalCustodyV2(custody){
 assert.equal(arguments.length,1);const state=original(custody);assert.equal(state.leases.size,0,'NATIVE_ECONOMIC_KEYS_REQUIRE_IDLE');await check(state);original(custody);assert.equal(state.leases.size,0,'NATIVE_ECONOMIC_KEYS_REQUIRE_IDLE');await assertNativeEconomicGenesisV2(state.genesis);
 return {path:state.vault.path,password:state.password,revision:state.revision,commitment:state.commitment,accounts:[...state.accounts],genesis:{...state.genesis}};
}
/** Authenticate/load entirely before the runtime's original final guard. */
export async function prepareNativeEconomicCustodySigningV2(custody,prepared){
 assert.equal(arguments.length,2);const state=original(custody);
 assert.ok(prepared&&Object.isFrozen(prepared)&&Object.isFrozen(prepared.transaction),'NATIVE_ECONOMIC_FIXED_PREPARATION');
 const tx=prepared.transaction;assert.equal(tx.chainId,String(state.profile.chainId));
 const record=await check(state);original(custody);const index=state.accounts.indexOf(tx.from);assert.ok(index>=0,'NATIVE_ECONOMIC_ORIGINAL_SIGNER_REQUIRED');
 const key=Buffer.from(record.data.privateKeys[index],'hex');let signer=null;
 try{
  signer=await prepareNativeEconomicLocalSignerV2(key,tx);original(custody);
  const lease=Object.freeze(Object.create(null));signingLeases.set(lease,{state,custody,prepared,signer,consumed:false});state.leases.add(lease);return lease;
 }catch(error){if(signer)revokeNativeEconomicLocalSignerV2(signer);throw error;}
 finally{key.fill(0);record.data.privateKeys.fill('');}
}
/** Synchronous and one-use after the guard. No reads/imports/awaits/callbacks. */
export function consumeNativeEconomicCustodySigningV2(custody,lease,prepared){
 assert.equal(arguments.length,3);const state=original(custody),entry=signingLeases.get(lease);
 assert.ok(entry&&entry.state===state&&entry.custody===custody&&entry.prepared===prepared&&!entry.consumed&&state.leases.has(lease),'NATIVE_ECONOMIC_ORIGINAL_SIGNING_LEASE');
 entry.consumed=true;state.leases.delete(lease);
 try{return consumeNativeEconomicLocalSignerV2(entry.signer);}finally{revokeNativeEconomicLocalSignerV2(entry.signer);}
}
export function revokeNativeEconomicCustodySigningV2(lease){
 assert.equal(arguments.length,1);const entry=signingLeases.get(lease);assert.ok(entry,'NATIVE_ECONOMIC_ORIGINAL_SIGNING_LEASE');
 entry.consumed=true;entry.state.leases.delete(lease);revokeNativeEconomicLocalSignerV2(entry.signer);
}
export function closeNativeEconomicLocalCustodyV2(custody){
 assert.equal(arguments.length,1);const state=slots.get(custody);assert.ok(state,'NATIVE_ECONOMIC_ORIGINAL_CUSTODY');
 state.closed=true;for(const lease of [...state.leases])revokeNativeEconomicCustodySigningV2(lease);state.password='';return {closed:true};
}
