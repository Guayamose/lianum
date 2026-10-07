/** Fixed source bridge for the SAME original synthetic java-tron node. Distinct
 * registered signer positions perform fresh separate reads. They do not imply
 * independent infrastructure, multiple nodes or public-network consensus. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {isOwnedLocalTronNativeValueV1,assertOwnedLocalTronNativeValueRuntimeLive,assertOwnedLocalTronNativeValueV1,openOwnedTronOriginalReadPort} from './owned-tron-native-value-runtime.mjs';
import {exact,hex,uint,sha256,clone} from './owned-tron-native-value-profile.mjs';
import {bindOriginalTronNativeTransfer} from './tron-native-transfer-wire.mjs';
const PROFILE_FIELDS=['schema','version','genesis','asset','sourceSetRoot','finalityPolicy','permissionPolicy','taposExpiryPolicy','obligation','maximumAncestry','maximumTaposDistance','maximumEvidenceLifetime','maximumBlockAgeMs','maximumClockSkewMs','maximumQueryMs'];
function index(value){assert.ok(typeof value==='string'&&/^[0-3]$/.test(value),'OWNED_TRON_SOURCE_POSITION');return value;}
export function describeOwnedLocalTronNativeValueSource(nativeRuntime,raw){
 assertOwnedLocalTronNativeValueRuntimeLive(nativeRuntime);exact(raw,['profile','sourceIndex']);const sourceIndex=index(raw.sourceIndex),p=raw.profile;exact(p,PROFILE_FIELDS);
 assert.equal(p.schema,'LIANUM_TRON_NATIVE_VALUE_SOURCE_PROFILE_V2');assert.equal(p.version,'2');const m=nativeRuntime.metadata;assert.equal(p.genesis,m.genesis,'OWNED_TRON_SOURCE_ACTUAL_GENESIS');
 for(const k of ['genesis','asset','sourceSetRoot','finalityPolicy','permissionPolicy','taposExpiryPolicy','obligation'])hex(p[k],32);
 for(const k of PROFILE_FIELDS.slice(9))uint(p[k]);
 const release={upstreamCommit:m.upstreamCommit,patchedNodeSHA256:m.patchedNodeSHA256,driverSHA256:m.driverSHA256,offlinePatchSHA256:m.offlinePatchSHA256,replayRecorderPatchSHA256:m.replayRecorderPatchSHA256};
 assert.match(release.upstreamCommit,/^[0-9a-f]{40}$/);for(const k of Object.keys(release).filter(k=>k!=='upstreamCommit'))hex(release[k],32,true);
 const clientRelease=sha256('LIANUM/owned-local-tron-release/1\0'+JSON.stringify(release));hex(m.configurationSHA256,32,true);
 const configuration=Object.fromEntries(PROFILE_FIELDS.filter(k=>k!=='sourceSetRoot').map(k=>[k,p[k]]));
 const chainConfiguration=sha256('LIANUM/owned-local-tron-configuration/1\0'+JSON.stringify({profile:configuration,nativeConfiguration:m.configurationSHA256}));
 return clone({identity:{operatorIdentity:sha256('LIANUM/owned-local-native-operator-slot/1\0'+sourceIndex),
  endpointIdentity:sha256('LIANUM/owned-local-tron-stdio-source/1\0'+JSON.stringify({genesis:m.genesis,configurationSHA256:m.configurationSHA256,clientRelease,sourceIndex})),clientRelease,chainConfiguration},
  genesis:m.genesis,chainId:null,family:'4',publicNetwork:false,trust:'COMMON_HOST_COMMON_NODE_SYNTHETIC'});
}
export async function createOwnedLocalTronNativeValueHealthSource(raw){
 exact(raw,['nativeRuntime','policy','source','original','currentRegistry','history']);const {nativeRuntime,policy,source,original,currentRegistry,history}=raw;
 await assertOwnedLocalTronNativeValueV1(nativeRuntime);exact(source,['identity','index','siblings']);
 const descriptor=describeOwnedLocalTronNativeValueSource(nativeRuntime,{profile:policy.profile,sourceIndex:source.index});assert.deepEqual(source.identity,descriptor.identity,'OWNED_TRON_SOURCE_DESCRIPTOR_REBOUND');
 const {signed}=bindOriginalTronNativeTransfer({nativeWire:original.nativeWire,expected:original.expected});
 const port=openOwnedTronOriginalReadPort(nativeRuntime,{nativeWire:signed.nativeWire,nativeId:signed.nativeId,transactionSHA256:signed.transactionSHA256});
 const checked=async(signal,work)=>{assert.ok(signal instanceof AbortSignal&&!types.isProxy(signal),'OWNED_TRON_SOURCE_SIGNAL');assert.equal(signal.aborted,false);port.assertLive();const result=await work();port.assertLive();assert.equal(signal.aborted,false);return result;};
 const transport=async(path,body,options)=>{exact(options,['signal']);return checked(options.signal,()=>{
   if(path==='/walletsolidity/getnowblock'){exact(body,[]);return port.readSolidBlock();}
   if(path==='/walletsolidity/getblockbynum'){exact(body,['num']);uint(body.num);return port.readBlock(body.num);}
   exact(body,['value']);assert.equal(body.value,signed.nativeId,'OWNED_TRON_SOURCE_ORIGINAL_ONLY');
   if(path==='/walletsolidity/gettransactionbyid')return port.readTransaction();
   if(path==='/walletsolidity/gettransactioninfobyid')return port.readTransactionInfo();
   throw new Error('OWNED_TRON_SOURCE_METHOD_DENIED');
  });};
 const readReplayContext=async(query,options)=>{exact(options,['signal']);exact(query,['schema','genesis','nativeId','transactionSHA256','blockId','blockHeight','transactionIndex','parentBlockId','ownerAddress']);
  assert.equal(query.schema,'LIANUM_TRON_PRETRANSACTION_REPLAY_CONTEXT_V1');assert.equal(query.genesis,descriptor.genesis);assert.equal(query.nativeId,signed.nativeId);assert.equal(query.transactionSHA256,signed.transactionSHA256);assert.equal(query.ownerAddress,signed.ownerAddress);
  return checked(options.signal,async()=>{const context=await port.readReplay({nativeId:signed.nativeId,blockId:query.blockId});for(const [k,v] of Object.entries(query))assert.equal(context[k],v,'OWNED_TRON_EXACT_VALIDATION_CONTEXT');return context;});};
 // Only the separately versioned V4 reader consumes the V4 original one-use
 // history token and receiver anchor. This module never manufactures one.
 const {createOwnedTronNativeValueHealthSource}=await import('./tron-native-value-health-source-v4.mjs');
 return createOwnedTronNativeValueHealthSource({policy,source:{...source,transport,readReplayContext},original,currentRegistry,history});
}
