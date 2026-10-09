/** Pure original guard/diagnostic HOST. No Anvil, authority, keys, proof or effect. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {mkdtemp,chmod,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EXTERNAL_DEFI_RECEIVER_PRIVATE_SCHEMA_V3,assertOwnedExternalDefiStateDumpV3,assertOwnedExternalDefiPrivateRecordV3,decodeOwnedExternalDefiStateV3} from '../../../../src/chains/evm/runtime/owned-external-defi-receiver-state-v3.mjs';
import {decodeOwnedEvmStateFileV1,writeOwnedExternalDefiStateFileV3,assertOwnedEvmStateFileV1} from '../../../../src/chains/evm/runtime/owned-evm-state-file-v1.mjs';
import {assertOwnedEvmRecoveryStateDumpV1,ownedEvmRecoveryStateBoundFailureV1} from '../../../../src/chains/evm/runtime/owned-evm-recovery-state-bound-v1.mjs';

function failure(value){try{assertOwnedEvmRecoveryStateDumpV1(value);}catch(error){return error;}assert.fail('HOST expected original bound rejection');}
const fields=['schema','type','characterLength','maximumCharacters','withinCharacterBound','hexPrefix','positiveEvenByteLength','lowerHexEncoding',
 'gzipHeaderMagicAndMethod','gzipHeaderFlags','gzipHeaderReservedBitsClear','gzipFooterISizeHintBytes','gzipFooterISizeHintWithinDecodedBound',
 'gzipFooterHintOnly','gzipFooterHintAuthenticated','gzipFooterISizeHintModulo2Pow32'].sort();
test('original state bound keeps its cause, fixed cap and numeric private diagnostics',()=>{
 assertOwnedEvmRecoveryStateDumpV1('0x00');assertOwnedEvmRecoveryStateDumpV1('0xdeadbeef');
 for(const value of [null,undefined,false,123,1n,Symbol('HOST_PRIVATE_SYMBOL'),()=>{}]){
  const error=failure(value),view=ownedEvmRecoveryStateBoundFailureV1(error);
  assert.equal(error.code,'ERR_ASSERTION');assert.deepEqual(Object.keys(view).sort(),fields);
  assert.equal(view.characterLength,null);assert.equal(view.hexPrefix,null);assert.equal(view.lowerHexEncoding,null);
  assert.equal(view.maximumCharacters,33554432);assert.ok(Object.isFrozen(view));
 }
 for(const [value,expected] of [
  ['0x',{hexPrefix:true,positiveEvenByteLength:false,lowerHexEncoding:null}],
  ['0x0',{hexPrefix:true,positiveEvenByteLength:false,lowerHexEncoding:null}],
  ['0xGG',{hexPrefix:true,positiveEvenByteLength:true,lowerHexEncoding:false}],
  ['0Xaa',{hexPrefix:false,positiveEvenByteLength:true,lowerHexEncoding:null}],
  ['HOST_PRIVATE_BYTES',{hexPrefix:false,positiveEvenByteLength:true,lowerHexEncoding:null}],
 ]){
  const error=failure(value),view=ownedEvmRecoveryStateBoundFailureV1(error);
  assert.equal(error.code,'ERR_ASSERTION');assert.equal(view.type,'STRING');assert.equal(view.characterLength,value.length);
  assert.equal(view.withinCharacterBound,true);for(const [key,want]of Object.entries(expected))assert.equal(view[key],want);
  assert.ok(!JSON.stringify(view).includes(value));
 }
 // A large but valid hex fixture can expose the pair-regex engine limit. This
 // checks preservation against the unchanged literal, never financial acceptance.
 for(const length of [1048576,4194304,33554432]){
  const value='0x'+'aa'.repeat((length-2)/2);let originalError=null,newError=null;
  try{assert.ok(typeof value==='string'&&value.length<=32*1024*1024&&/^0x(?:[0-9a-f]{2})+$/.test(value),'EVM_RECOVERY_STATE_BOUND');}catch(error){originalError=error;}
  try{assertOwnedEvmRecoveryStateDumpV1(value);}catch(error){newError=error;}
  assert.equal(Boolean(newError),Boolean(originalError));
  if(newError){const view=ownedEvmRecoveryStateBoundFailureV1(newError);assert.equal(view.characterLength,length);
   assert.equal(view.withinCharacterBound,true);assert.equal(view.positiveEvenByteLength,true);assert.equal(view.lowerHexEncoding,true);
   assert.equal(newError.name,originalError.name);assert.equal(newError.code,originalError.code);
  }
 }
 const oversized='0x'+'aa'.repeat(16777216),view=ownedEvmRecoveryStateBoundFailureV1(failure(oversized));
 assert.equal(view.characterLength,33554434);assert.equal(view.withinCharacterBound,false);assert.equal(view.lowerHexEncoding,null);
 // Explicit hostile HOST strings, not compressed native data or accepted state.
 // The unchanged original guard rejects first; fixed-byte hints cannot accept it.
 const padding='aa'.repeat(16777216),isize=value=>Buffer.from([value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255]).toString('hex');
 for(const value of [0,134217727,134217728,134217729,4294967295]){
  const input='0x1f8b0800'+padding+'00000000'+isize(value),error=failure(input),hint=ownedEvmRecoveryStateBoundFailureV1(error);
  assert.equal(error.code,'ERR_ASSERTION');assert.equal(hint.withinCharacterBound,false);assert.equal(hint.lowerHexEncoding,null);
  assert.equal(hint.gzipHeaderMagicAndMethod,true);assert.equal(hint.gzipHeaderFlags,0);assert.equal(hint.gzipHeaderReservedBitsClear,true);
  assert.equal(hint.gzipFooterISizeHintBytes,value);assert.equal(hint.gzipFooterISizeHintWithinDecodedBound,value<=134217728);
  assert.equal(hint.gzipFooterHintOnly,true);assert.equal(hint.gzipFooterHintAuthenticated,false);assert.equal(hint.gzipFooterISizeHintModulo2Pow32,true);
 }
 for(const [header,footer,flags,reserved,magic]of [
  ['1f8b0800','0000000G',0,true,true],['1f8b0800','0000000\n',0,true,true],
  ['1f8b08e0','00000000',224,false,true],['1f8b0900','00000000',null,null,false],
  ['1f8b08GG','00000000',null,null,null],
 ]){
  const input='0x'+header+'GG'.repeat(16)+'00000000'+footer,error=failure(input),hint=ownedEvmRecoveryStateBoundFailureV1(error);
  assert.equal(error.code,'ERR_ASSERTION');assert.equal(hint.gzipHeaderMagicAndMethod,magic);assert.equal(hint.gzipHeaderFlags,flags);
  assert.equal(hint.gzipHeaderReservedBitsClear,reserved);assert.equal(hint.gzipFooterISizeHintBytes,null);assert.equal(hint.gzipFooterISizeHintWithinDecodedBound,null);
 }
 // A valid-looking footer may be forged despite invalid middle/CRC; it stays a
 // hint and never changes the original malformed encoding rejection.
 const corrupt='0x1f8b0800'+'GG'.repeat(16)+'00000000'+isize(123);
 const rejected=failure(corrupt),untrusted=ownedEvmRecoveryStateBoundFailureV1(rejected);
 assert.equal(untrusted.lowerHexEncoding,false);assert.equal(untrusted.gzipFooterISizeHintBytes,123);assert.equal(untrusted.gzipFooterHintAuthenticated,false);
});

test('original state bound diagnostic rejects copied, opaque and hostile errors without traps',()=>{
 let invoked=0;
 const value=new Proxy({raw:'HOST_PRIVATE_VALUE'},{get(){invoked++;throw Error('HOST_GETTER');},ownKeys(){invoked++;throw Error('HOST_KEYS');}});
 const error=failure(value);assert.equal(ownedEvmRecoveryStateBoundFailureV1(error).type,'OBJECT');assert.equal(invoked,0);
 for(const opaque of [value,Object.defineProperty({},'stateDump',{get(){invoked++;throw Error('HOST_BLOB_GETTER');}}),new String('0x1f8b0800')]){
  const original=failure(opaque),view=ownedEvmRecoveryStateBoundFailureV1(original);
  assert.equal(original.code,'ERR_ASSERTION');assert.equal(view.type,'OBJECT');assert.equal(view.gzipHeaderMagicAndMethod,null);
  assert.equal(view.gzipHeaderFlags,null);assert.equal(view.gzipFooterISizeHintBytes,null);assert.equal(view.gzipFooterHintAuthenticated,false);
 }
 assert.equal(invoked,0);
 assert.equal(ownedEvmRecoveryStateBoundFailureV1({...error}),null);assert.equal(ownedEvmRecoveryStateBoundFailureV1(value),null);
 const accessor=Object.defineProperty({},'cause',{get(){invoked++;throw Error('HOST_CAUSE_GETTER');}});
 assert.equal(ownedEvmRecoveryStateBoundFailureV1(accessor),null);assert.equal(invoked,0);
 const wrapped=new Error('HOST_PRIVATE_MESSAGE',{cause:error});
 assert.deepEqual(ownedEvmRecoveryStateBoundFailureV1(wrapped),ownedEvmRecoveryStateBoundFailureV1(error));
 const nativeWrapper={data:{cause:error}};assert.deepEqual(ownedEvmRecoveryStateBoundFailureV1(nativeWrapper),ownedEvmRecoveryStateBoundFailureV1(error));
 const cycle={};cycle.cause=cycle;assert.equal(ownedEvmRecoveryStateBoundFailureV1(cycle),null);
 const view=ownedEvmRecoveryStateBoundFailureV1(wrapped);assert.ok(!JSON.stringify(view).includes('HOST_PRIVATE'));
 assert.throws(()=>{view.type='STRING';});assert.equal(ownedEvmRecoveryStateBoundFailureV1(error).type,'OBJECT');
 assert.throws(()=>ownedEvmRecoveryStateBoundFailureV1(error,'HOST_EXTRA'),{code:'ERR_ASSERTION'});
});

// Explicit format HOSTs: synthetic ORIGINAL Anvil JSON layout, real gzip/FD
// transport and hashes. No native process, key, financial effect or token.
function externalV3StateFixture(stateDump) {
 return {schema:EXTERNAL_DEFI_RECEIVER_PRIVATE_SCHEMA_V3,family:'receiver',cwd:'/HOST_PRIVATE',profile:'PAEG_LOCAL_FAKE_CLOCK_V1',runtimePin:['HOST_ONLY'],
  processGeneration:0,originalProcessId:123,genesisHash:'HOST_GENESIS',genesisHeader:{number:'0x0'},accounts:Array(5).fill('HOST_ACCOUNT'),head:{number:'0x1'},accountState:[],stateDump,
  localCustodyCommitment:'HOST_AEAD_COMMITMENT',lastTimestamp:'1',ingressMutationEpoch:'0',uncertainMutation:false,uncertainSignedHash:null,transactions:[],receipts:[],lifecycle:[],sourceLineageCommitment:null};
}
const originalAnvilStateBytes=()=>Buffer.from('{"accounts":{},"best_block_number":1,"block":{"number":"0x1"},"blocks":[{"number":"0x0"},{"number":"0x1"}],"historical_states":[{"fixture":"full-history"}],"transactions":[]}\n');
const gzipHex=bytes=>'0x'+gzipSync(bytes).toString('hex');
test('External5 V3 retains original gzip and decoded bytes with split bounds and unchanged legacy format',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'external-state-v3-host-'));await chmod(directory,0o700);t.after(()=>rm(directory,{recursive:true,force:true}));
 const decoded=originalAnvilStateBytes(),snapshot=gzipHex(decoded),state=externalV3StateFixture(snapshot),before=JSON.stringify(state);
 const view=assertOwnedExternalDefiPrivateRecordV3(state);assert.equal(JSON.stringify(state),before);
 assert.equal(view.encodedBytes,Buffer.byteLength(',"stateDump":'+JSON.stringify(snapshot)));
 assert.equal(view.recordBytes,view.encodedBytes+view.metadataBytes);assert.equal(view.recordBytes,Buffer.byteLength(before));
 const bytes=decodeOwnedExternalDefiStateV3(snapshot);assert.deepEqual(bytes.bytes,decoded);
 assert.equal(bytes.originalSHA256,createHash('sha256').update(Buffer.from(snapshot.slice(2),'hex')).digest('hex'));
 const pin=await writeOwnedExternalDefiStateFileV3({cwd:directory,suffix:'1',stateDump:snapshot});
 assert.deepEqual(await readFile(pin.path),decoded);assert.equal(pin.originalSHA256,bytes.originalSHA256);assert.equal(pin.sha256,bytes.sha256);
 await assertOwnedEvmStateFileV1(pin);await assert.rejects(writeOwnedExternalDefiStateFileV3({cwd:directory,suffix:'1',stateDump:snapshot}),{code:'EEXIST'});
 const physical=await stat(pin.path);assert.equal(physical.mode&0o777,0o600);assert.equal(physical.nlink,1);
 await writeFile(pin.path,Buffer.alloc(decoded.length,0x20));await assert.rejects(assertOwnedEvmStateFileV1(pin),/PRIVATE_STATE_CHANGED/);
 // This byte test crosses the ORIGINAL 32MiB character limit, while V3's
 // distinct encoded slot remains below its own 48MiB limit. It is not a gzip
 // capture: only the respective encoding guards are exercised here.
 const aboveLegacy='0x1f8b08'+'00'.repeat(16*1024*1024);
 assert.throws(()=>assertOwnedEvmRecoveryStateDumpV1(aboveLegacy));assertOwnedExternalDefiStateDumpV3(aboveLegacy);
 assert.throws(()=>decodeOwnedEvmStateFileV1(aboveLegacy),/ORIGINAL_DUMP_ENCODING/);
 assert.throws(()=>assertOwnedExternalDefiStateDumpV3('0x1f8b08'+'00'.repeat(24*1024*1024)),/ENCODED_BOUND/);
 assertOwnedEvmRecoveryStateDumpV1('0x00');assert.throws(()=>assertOwnedExternalDefiStateDumpV3('0x00'),/ORIGINAL_GZIP/);
});

test('External5 V3 rejects wrong family/profile, metadata overflow, gzip bombs, tamper and opaque values',()=>{
 const snapshot=gzipHex(originalAnvilStateBytes());
 for(const field of ['schema','family','profile','sourceLineageCommitment']){
  const changed=externalV3StateFixture(snapshot);changed[field]='HOST_WRONG_PROFILE';assert.throws(()=>assertOwnedExternalDefiPrivateRecordV3(changed));
 }
 const metadata=externalV3StateFixture(snapshot);metadata.genesisHeader={oversized:'x'.repeat(16*1024*1024)};
 assert.throws(()=>assertOwnedExternalDefiPrivateRecordV3(metadata),/METADATA_BOUND/);
 for(const bad of [snapshot+'\n',snapshot.toUpperCase(),snapshot.slice(0,-1),'0x1f8b08gg'])assert.throws(()=>decodeOwnedExternalDefiStateV3(bad),/HEX_ENCODING|ORIGINAL_GZIP/);
 const damaged=Buffer.from(snapshot.slice(2),'hex');damaged[damaged.length-8]^=1;
 assert.throws(()=>decodeOwnedExternalDefiStateV3('0x'+damaged.toString('hex')));
 // A forged footer never supplies decoded-size authorization: zlib validates
 // checksum/ISIZE and maxOutputLength against the ACTUAL inflated bytes.
 const forged=Buffer.from(snapshot.slice(2),'hex');forged.writeUInt32LE(1,forged.length-4);
 assert.throws(()=>decodeOwnedExternalDefiStateV3('0x'+forged.toString('hex')));
 const bomb=gzipHex(Buffer.alloc(128*1024*1024+1,0x20));assert.throws(()=>decodeOwnedExternalDefiStateV3(bomb),{code:'ERR_BUFFER_TOO_LARGE'});
 const wrongState=gzipHex(Buffer.from('{"accounts":{},"best_block_number":0,"block":{},"blocks":[],"transactions":[]}'));
 assert.throws(()=>decodeOwnedExternalDefiStateV3(wrongState));
 let invoked=0;const opaque=new Proxy(externalV3StateFixture(snapshot),{get(){invoked++;throw Error('HOST_GET');},ownKeys(){invoked++;throw Error('HOST_KEYS');}});
 assert.throws(()=>assertOwnedExternalDefiPrivateRecordV3(opaque),/DATA_OBJECT/);
 const getter=externalV3StateFixture(snapshot);Object.defineProperty(getter,'stateDump',{enumerable:true,get(){invoked++;throw Error('HOST_BLOB_GETTER');}});
 assert.throws(()=>assertOwnedExternalDefiPrivateRecordV3(getter),/DATA_ACCESSOR/);assert.equal(invoked,0);
 const transformed=externalV3StateFixture(snapshot);transformed.genesisHeader.toJSON=()=>{invoked++;return {};};
 assert.throws(()=>assertOwnedExternalDefiPrivateRecordV3(transformed),/DATA_PROPERTY|DATA_OBJECT/);assert.equal(invoked,0);
 const cycle=externalV3StateFixture(snapshot);cycle.genesisHeader.self=cycle.genesisHeader;assert.throws(()=>assertOwnedExternalDefiPrivateRecordV3(cycle),/DATA_CYCLE/);
});
