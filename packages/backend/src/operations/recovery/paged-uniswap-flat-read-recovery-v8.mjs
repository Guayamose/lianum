import {DEVICE_OPERATION_CONSENT_MS_V41} from '@lianum/mobile-protocol/device/paged-owner-v3';
/** Authenticated captured USDC output-note reads. No financial account,
 * constructor permission, proof producer or signing lane is opened here. */
import assert from 'node:assert/strict';
import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';
import {join} from 'node:path';
import {Vault} from '@lianum/engine/crypto/vault';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import * as M from './paged-public-uniswap-mixed-supervisor-v4.mjs';
import {openOriginalPagedPublicSourceReadValidatorV4,closeOriginalPagedPublicSourceReadValidatorV4} from './paged-public-source-read-validator-v4.mjs';
import {readPagedSourcePrivateBytesV4,hashPagedSourcePrivateFileV4} from './paged-source-read-files-v4.mjs';
import {createOriginalPagedSepoliaRpcV4} from '../../chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {readSepoliaUniswapFlatLedgerDataV4} from '../../chains/public-testnet/sepolia-uniswap-flat-ledger-data-v4.mjs';
import {readDeviceNoteStatusV1} from '../../accounts/authority/device-note-observation-v1.mjs';

const issuers=new WeakMap(),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
async function optionalEpochHash(path,max){try{return await hashPagedSourcePrivateFileV4(path,max);}catch(error){if(error.code==='ENOENT')return null;throw error;}}
async function protectedFile(path){const bytes=await readPagedSourcePrivateBytesV4(path,2097152);bytes.fill(0);}

export async function openOriginalPagedUniswapFlatReadRecoveryV8(token,input){
 assert.equal(arguments.length,2);P.externalFlatExactV1(input,['journalPassword']);assert.ok(typeof input.journalPassword==='string'&&input.journalPassword.length>=16&&input.journalPassword.length<=256);
 const reader=await M.consumeOriginalPagedPublicUniswapFlatReadV8(token);
 let password=input.journalPassword,validator,rpc,closed=false,closing,work=Promise.resolve(),queued=0;
 const challenges=new Map(),files=new Map();
 async function close(){if(closing)return closing;return closing=(async()=>{closed=true;challenges.clear();await work;try{await closeOriginalPagedPublicSourceReadValidatorV4(validator);if(rpc){rpc.lifecycle.acknowledge();await rpc.runtime.close();}}finally{password=null;M.closeOriginalPagedPublicUniswapFlatReadV8(reader);}})();}
 try{
  const saved=await M.readOriginalPagedPublicUniswapFlatReadV8(reader),authority=saved.authority,descriptor=P.normalizeExternalFlatDescriptorV1(authority.descriptor),target=saved.target.system,pool=target.target.pools[1];
  assert.equal(saved.profile,'ORIGINAL_PUBLIC_UNISWAP_FLAT_READ_CAPTURE_V8');assert.equal(saved.supervisor.phase,'CAPTURED');assert.equal(authority.targetPlanSHA256,target.planSHA256);assert.equal(descriptor.profile,P.DEVICE_EXTERNAL_FLAT_SHARE_V1);
  const sourceReader=await M.readOriginalPagedPublicUniswapFlatValidationReaderV8(reader),sourceScope=await M.readOriginalPagedPublicUniswapSourceReadV6(sourceReader);
  assert.equal(sourceScope.authority.descriptor.devicePublicKey,descriptor.devicePublicKey);assert.equal(sourceScope.authority.descriptor.origin,descriptor.origin);
  const expected={pool:pool.address.slice(2),poolCodeHash:pool.codeHash.slice(2),scope:pool.domain.scope,policy:pool.domain.policy,assetIdentity:pool.assetIdentity.slice(2),asset:pool.asset.slice(2),assetCodeHash:pool.assetCodeHash.slice(2),genesis:sourceScope.authority.descriptor.genesis,domainCommitment:pool.domainCommitment.slice(2),hub:target.target.hub.address.slice(2),hubCodeHash:target.target.hub.codeHash.slice(2),hubDomain:pool.domain.hubDomain,ledgerNamespace:pool.domain.ledgerNamespace};
  assert.deepEqual(descriptor.poolTerms,expected,'UNISWAP_FLAT_READ_TARGET_BINDING');assert.deepEqual(descriptor.assetMetadata,{kind:'ERC20',symbol:'USDC',decimals:6});
  // Corroborate retained compiled constructors, original signed source rows,
  // keys and finalized receipts through the existing Original readonly path.
  validator=await openOriginalPagedPublicSourceReadValidatorV4(sourceReader);
  const native=saved.native.directory;
  for(const [path,max]of [[join(native,'dispatch-journal/native-wallet.json'),33554432],[join(native,'receiver-bootstrap/native-wallet.json'),33554432],[join(native,'source-operations/native-wallet.json'),33554432],[join(native,'keys/wrapping-key.bin'),32],[join(native,'keys/provider-keys.aead'),8192]])files.set(path,{max,sha256:await hashPagedSourcePrivateFileV4(path,max)});
  const epochPath=join(native,'source-operations/financial-epochs.vault');files.set(epochPath,{max:2097152,sha256:await optionalEpochHash(epochPath,2097152),optionalEpoch:true});
  await closeOriginalPagedPublicSourceReadValidatorV4(validator);validator=null;
  rpc=await createOriginalPagedSepoliaRpcV4(saved.native.source.configuration.receiver);
  const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),y:Buffer.from(descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}}),journal=new Vault(authority.journalPath);
  const live=()=>assert.ok(!closed,'UNISWAP_FLAT_READ_CLOSED');
  async function current(){
   live();assert.deepEqual(await M.readOriginalPagedPublicUniswapFlatReadV8(reader),saved,'UNISWAP_FLAT_READ_CAPTURE_CHANGED');
   for(const [path,row]of files)assert.equal(await (row.optionalEpoch?optionalEpochHash(path,row.max):hashPagedSourcePrivateFileV4(path,row.max)),row.sha256,'UNISWAP_FLAT_READ_SOURCE_CHANGED');
   await protectedFile(authority.journalPath);const row=await journal.read(password);
   P.externalFlatExactV1(row.data,['schema','identity','descriptor','targetPlanSHA256','jobs','pending']);assert.equal(row.data.schema,'ORIGINAL_PUBLIC_SEPOLIA_UNISWAP_FLAT_JOURNAL_V4');assert.equal(row.data.identity,authority.identity);assert.deepEqual(row.data.descriptor,descriptor);assert.equal(row.data.targetPlanSHA256,target.planSHA256);assert.equal(row.revision,authority.journalRevision,'UNISWAP_FLAT_READ_JOURNAL_REVISION');assert.equal(hash(row.data),authority.journalDataSHA256,'UNISWAP_FLAT_READ_JOURNAL_HIGHWATER');assert.equal(row.data.pending,null);assert.ok(Array.isArray(row.data.jobs)&&row.data.jobs.length<=2&&!row.data.jobs.some(job=>job.stage==='PROVING'));
   live();return row.data;
  }
  async function ledger(){
   const head=await rpc.runtime.block();
   // Only fixed targets from the authenticated retained constructor set can
   // be read. Source highwaters above cannot advance while this reader lives.
   await Promise.all(target.constructors.map(async row=>{assert.equal(await rpc.runtime.code(row.expectedAddress,head.number),row.expectedCode,'UNISWAP_FLAT_READ_CODE_CHANGED');assert.deepEqual(await rpc.runtime.receipt(row.receipt.transactionHash),row.receipt,'UNISWAP_FLAT_READ_RECEIPT_CHANGED');}));
   const view=await readSepoliaUniswapFlatLedgerDataV4(rpc.runtime,target,head);await rpc.runtime.assertCanonical(head);return view;
  }
  await current();
  function enqueue(fn){live();assert.ok(queued<8,'UNISWAP_FLAT_READ_QUEUE_BOUND');queued++;const task=work.then(()=>{live();return fn();}).finally(()=>queued--);work=task.catch(()=>{});return task;}
  function fresh(row){P.validateExternalFlatFreshV1(row.access);assert.ok(performance.now()<row.deadline,'UNISWAP_FLAT_READ_PERMISSION_EXPIRED');}
  const handle=Object.freeze(Object.create(null));
  const state={descriptor,
   challenge:()=>enqueue(async()=>{await current();for(const [id,row]of challenges)if(row.access.expiresAt<=Date.now()||row.deadline<=performance.now())challenges.delete(id);assert.ok(challenges.size<16,'UNISWAP_FLAT_READ_CHALLENGE_BOUND');const access=P.normalizeExternalFlatAccessV1({profile:descriptor.profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey,challengeId:randomBytes(32).toString('hex'),nonce:randomBytes(32).toString('hex'),...(()=>{const issuedAt=Date.now();return{issuedAt,expiresAt:issuedAt+DEVICE_OPERATION_CONSENT_MS_V41};})()});challenges.set(access.challengeId,{access,deadline:performance.now()+DEVICE_OPERATION_CONSENT_MS_V41});return structuredClone(access);}),
   status:body=>enqueue(async()=>{const request=P.externalFlatExactV1(body,['access','signature']),access=P.normalizeExternalFlatAccessV1(request.access),row=challenges.get(access.challengeId);assert.ok(row,'UNISWAP_FLAT_READ_ORIGINAL_PERMISSION');challenges.delete(access.challengeId);assert.deepEqual(access,row.access,'UNISWAP_FLAT_READ_PERMISSION_BINDING');fresh(row);const signature=P.normalizeExternalFlatSignatureV1(request.signature);assert.ok(verify('sha256',P.externalFlatPermissionMessageV1(access),{key,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')),'UNISWAP_FLAT_READ_POP');const data=await current(),view=await ledger();await current();fresh(row);return readDeviceNoteStatusV1(descriptor,data,{head:{number:BigInt(view.head.number).toString(),hash:view.head.hash.slice(2),timestamp:BigInt(view.head.timestamp).toString()},ledger:{commitments:view.commitments.map(v=>'0x'+v),nullifiers:view.nullifiers.map(v=>'0x'+v),publicState:view.publicState}},true);}),close};
  issuers.set(handle,state);return handle;
 }catch(error){await close();throw error;}
}
export function readOriginalPagedUniswapFlatReadDescriptorV8(handle){assert.equal(arguments.length,1);const state=issuers.get(handle);assert.ok(state,'UNISWAP_FLAT_READ_ORIGINAL_ISSUER');return freeze(structuredClone(state.descriptor));}
export function dispatchOriginalPagedUniswapFlatReadV8(handle,action,body){assert.equal(arguments.length,3);const state=issuers.get(handle);assert.ok(state,'UNISWAP_FLAT_READ_ORIGINAL_ISSUER');assert.ok(['challenge','status'].includes(action),'UNISWAP_FLAT_READ_ONLY');if(action==='challenge'){if(Object.hasOwn(body??{},'pairingId')){P.externalFlatExactV1(body,['pairingId']);assert.equal(body.pairingId,state.descriptor.pairingId,'UNISWAP_FLAT_READ_PAIRING');}else P.externalFlatExactV1(body,[]);}return state[action](body);}
export async function closeOriginalPagedUniswapFlatReadV8(handle){assert.equal(arguments.length,1);const state=issuers.get(handle);issuers.delete(handle);await state?.close();}
