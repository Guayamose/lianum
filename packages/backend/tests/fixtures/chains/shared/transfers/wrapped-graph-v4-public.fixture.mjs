/** Public mathematical signatures only: no private key object, signing API,
 * native process, backend or RPC. Hash substitute is schema-flow ONLY. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {registrationFixture} from '../../../operations/deployments/wrapped/wrapped-v4-host-fixtures.mjs';
import {custodyProfileCommitment} from '../../../../../src/claims/protocol/registry-envelope-v2.mjs';
export const G=await import('../../../../../src/chains/shared/transfers/generic-native-value-v2.mjs');
export const E=await import('../../../../../src/chains/evm/transfers/evm-native-value-v2.mjs');
export const T=await import('../../../../../src/chains/tron/transfers/tron-native-graph-profile.mjs');
export const B=await import('../../../../../src/chains/shared/dispatch/wrapped-claim-dispatch-binding-v1.mjs');
export const J=await import('../../../../../src/chains/shared/dispatch/wrapped-claim-dispatch-journal-v1.mjs');
import {originalFixture} from '../../evm/transfers/evm-native-transfer-fixture.mjs';
import {bindOriginalEvmGraphTransfer,encodeEvmGraphTransferMemo} from '../../../../../src/chains/evm/transfers/evm-graph-transfer-binding.mjs';
import {receiptKeyCommitment} from '@lianum/engine/native/native-receipt-binding';
import {createCommitmentCodec} from '@lianum/components/encoding/commitments';
import {encodeStatement} from '@lianum/components/encoding/statements';
import {ownedEvmNativeValueAuditCommitments} from '../../../../../src/chains/evm/transfers/owned-evm-native-value-profile.mjs';
import {nativeTransferActionCommitment} from '@lianum/engine/execution/native/dispatch/native-capsules';
import {nativeProviderIdentity,nativeDeliveryRiskCommitment,NATIVE_ADMISSION_LOSS_CLAUSE} from '@lianum/engine/execution/native/dispatch/native-admission';
export const H=x=>createHash('sha256').update('SOURCE-ONLY-NATIVE-DISPATCH/'+x).digest('hex'),Z='0'.repeat(64),F=x=>'00'+H(x).slice(2);
export const traceHash=async fields=>(1n+fields.reduce((n,v,i)=>n+v*BigInt(i+1),0n)%((1n<<250n)-1n)).toString(16).padStart(64,'0');
const publicVectors=JSON.parse(readFileSync(new URL('../../../operations/deployments/wrapped/fixtures/wrapped-v4-public-native-value.json',import.meta.url)));
const tronVectors=JSON.parse(readFileSync(new URL('../../tron/transfers/fixtures/wrapped-graph-v4-public-tron.json',import.meta.url)));
const tronFixture=JSON.parse(readFileSync(new URL('../../tron/transfers/fixtures/wrapped-graph-v4-original-tron-memo.json',import.meta.url))),tronOriginal=tronFixture.original;
function tree(leaves,depth){let level=[...leaves,...Array(2**depth-leaves.length).fill(Z)];const levels=[level];
 for(let d=0;d<depth;d++){level=Array.from({length:level.length/2},(_,i)=>G.sha256(Buffer.from('01'+level[i*2]+level[i*2+1],'hex')));levels.push(level);}
 return {root:level[0],path:i=>({index:String(i),siblings:Array.from({length:depth},(_,d)=>levels[d][(i>>d)^1])})};}
function sources(chain){const ids=[0,1,2,3].map(i=>({operatorIdentity:registrationFixture().profiles[0].sources[i].identity.operatorIdentity,endpointIdentity:H(chain+'endpoint'+i),clientRelease:H(chain+'release'),chainConfiguration:H(chain+'configuration')}));
 const t=tree(ids.map(G.sourceCommitment),2);return {root:t.root,sources:ids.map((identity,i)=>({identity,...t.path(i)}))};}
export async function fixture(chain='ethereum',type=0,{ownedTron=false,providerKeyOverride=null,keysOverride=null,leaseIdOverride=null,registrationOverride=null,poolOverride=null,domainOverride=null}={}){
 const secret=ownedTron?tronFixture.syntheticReceiptSecret:H('secret'),namespace=registrationOverride?.registry.quorum.hubDomain??(ownedTron?tronFixture.syntheticNamespace:H('hub')),K=receiptKeyCommitment({ledgerNamespace:namespace,secret}),f=originalFixture(chain==='tron'?'ethereum':chain,type,{data:encodeEvmGraphTransferMemo(K),gasPrice:'1000000000',nonce:'0'});
 const nativeProfiles=['ethereum','base','arbitrum','bnb'].map(name=>{const native=originalFixture(name,0),s=sources(name);return {profile:E.createProfile({chain:name,genesisHash:native.genesisHash,sourceSetRoot:s.root,
   maximumAncestry:'32',maximumEvidenceLifetime:'30',maximumBlockAgeMs:'1800000',maximumClockSkewMs:'5000',maximumQueryMs:'10000'}),sources:s.sources};});
 const ts=sources('tron');nativeProfiles.push({profile:{...tronVectors.profile,...(ownedTron?{genesis:'0000000000000000'+'11'.repeat(24),asset:T.tronGraphAsset('0000000000000000'+'11'.repeat(24))}:{}),sourceSetRoot:ts.root},sources:ts.sources});const profiles=registrationOverride?structuredClone(registrationOverride.profiles):[...registrationFixture().profiles.slice(0,2),...nativeProfiles.map(row=>({...row,kind:'native-value'}))];const pt=tree(profiles.map(x=>x.kind==='custody'?custodyProfileCommitment(x.profile):G.profileCommitment(x.profile)),3);
 profiles.forEach((x,i)=>x.profilePath=pt.path(i));
 const index=chain==='tron'?4:['ethereum','base','arbitrum','bnb'].indexOf(chain),profile=registrationOverride?profiles.find(row=>row.kind==='native-value').profile:profiles[index+2].profile;
 const registry=registrationOverride?structuredClone(registrationOverride.registry):{schema:E.REGISTRY_SCHEMA,quorum:{...publicVectors.registry.quorum,hubDomain:namespace,rulesRoot:pt.root,...(keysOverride?{keys:keysOverride}:{})}};
 let bound,original,transaction;
 if(chain==='tron'){original=structuredClone(ownedTron?tronFixture.canonical:tronOriginal);bound=T.bindOriginalTronGraphTransfer(original,profile.genesis);const d=bound.signed;
  transaction=Object.fromEntries(['ownerAddress','recipientAddress','amountSun','refBlockBytes','refBlockHash','timestampMs','expirationMs','permissionId','wireKeyCommitment'].map(k=>[k,d[k]]));
 }else{const fees=type===2?{maxPriorityFeePerGas:f.expected.maxPriorityFeePerGas,maxFeePerGas:f.expected.maxFeePerGas}:{gasPrice:f.expected.gasPrice};
  original={nativeWire:f.original.nativeWire,expected:{...f.original.expected,chainId:f.expected.chainId,genesisHash:f.genesisHash,type:String(type),gas:f.expected.gas,fees,wireKeyCommitment:K}};
  bound=bindOriginalEvmGraphTransfer(original,{chain,genesisHash:f.genesisHash});const d=bound.signed;
  transaction={type:String(type),chainId:d.chainId,nonce:d.nonce,from:d.from,to:d.to,value:d.value,gas:d.gas,fees,wireKeyCommitment:K};}
 const domain={scope:H('scope'),policy:H('policy'),asset:H('PRIVATE_USER_ASSET_DISTINCT_FROM_SOLVER_NATIVE_ASSET'),hubDomain:namespace,ledgerNamespace:namespace,
   registryCommitment:G.registryCommitment(registry),verifierSetCommitment:H('verifiers'),...domainOverride};
 const providerKey=providerKeyOverride??publicVectors.registry.quorum.keys[0],payoutCommitment=H('payout'),deliveryRiskSalt=H('risk');
 const action={...bound.actionTerms,signerIdentity:nativeProviderIdentity(providerKey),executionFrom:ownedTron?'1899999990':'1900000300',executionUntil:ownedTron?'1900000300':'1900000800',settleBefore:ownedTron?'1900000400':'1900000900',
   receiptRho:H('rho'),deliveryRiskCommitment:H('placeholder'),actionSalt:H('action-salt')};
 action.deliveryRiskCommitment=nativeDeliveryRiskCommitment({clause:NATIVE_ADMISSION_LOSS_CLAUSE,hubDomain:namespace,registryCommitment:domain.registryCommitment,chainDomain:action.chainDomain,
   sourceCommitment:action.sourceCommitment,destinationCommitment:action.destinationCommitment,amount:action.amount,scope:domain.scope,policy:domain.policy,asset:domain.asset,payoutCommitment,settleBefore:action.settleBefore,salt:deliveryRiskSalt});
 const binding=B.normalizeNativeValueDispatchBinding({domain,pool:poolOverride??'10'.repeat(20),registry,profiles,profileCommitment:G.profileCommitment(profile),providerKey,
   native:{solverEndpoint:chain==='tron'?bound.signed.ownerAddress:bound.signed.from,recipientEndpoint:chain==='tron'?bound.signed.recipientAddress:bound.signed.to},
   quote:{action,payoutCommitment,deliveryRiskSalt},acceptedLossClause:NATIVE_ADMISSION_LOSS_CLAUSE,leaseId:leaseIdOverride??H('original-lease')});
 const fee=chain==='tron'?100n:BigInt(transaction.gas)*BigInt(transaction.fees[type===2?'maxFeePerGas':'gasPrice']);
 const prepared=B.assertNativeValuePrepared(binding,{leaseId:binding.leaseId,profileCommitment:binding.profileCommitment,genesis:profile.genesis,nativeHead:{hash:H('native-head'),number:'0',timestamp:ownedTron?'1900000000':'1900000310'},
   transaction,unsignedWire:B.nativeValueUnsignedWire(binding,transaction),liquidity:{sourceEndpoint:binding.native.solverEndpoint,balanceAtomic:(BigInt(action.amount)+fee+1000n).toString(),maximumFeeAtomic:fee.toString(),estimatedFeeAtomic:(fee/2n).toString(),ownershipCommitment:H('ownership'),observationCommitment:H('observation')}});
 const signed=B.assertNativeValueSigned(binding,prepared,{nativeWire:original.nativeWire});
 const descriptor={...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(k=>[k,domain[k]])),snapshotDigest:H('checkpoint'),localCommitment:H('local'),dispatchId:H('dispatch'),
   chainDomain:action.chainDomain,evidencePolicy:binding.profileCommitment,actionCommitment:nativeTransferActionCommitment(action),payoutCommitment,readyFrom:ownedTron?'1899999995':'1900000310',readyUntil:ownedTron?'1900000120':'1900000710'};
 const codec=createCommitmentCodec({hashFields:traceHash}),d=await codec.domainCommitment(domain),readinessBlind=H('blind'),joinCommitment=F('join');
 const ready={domainCommitment:d,authorizationRoot:F('authorization'),checkpoint:descriptor.snapshotDigest,readinessEvidenceState:F('evidence'),joinCommitment,
   readinessCommitment:await codec.readinessCommitment(d,joinCommitment,readinessBlind,descriptor),readyFrom:descriptor.readyFrom,readyUntil:descriptor.readyUntil};
 const {readinessCommitment,...dependency}=ready;
 const request={dependencyProof:{proof:'01'.repeat(32),publicInputs:[...encodeStatement('dependency',dependency)]},readyProof:{proof:'02'.repeat(32),publicInputs:[...encodeStatement('ready',ready)]},
   readinessOpening:{domain,descriptor,readinessBlind},action,deliveryRiskSalt,receiptSpendSecret:secret};
 return {binding,prepared,signed,original,request,profile,secret};
}
export function lowerPreparation(f,intent){const t=f.prepared.transaction;
 const transaction={chainId:t.chainId,from:t.from,to:t.to,nonce:t.nonce,gasPrice:t.fees.gasPrice,gas:t.gas,value:t.value,data:encodeEvmGraphTransferMemo(t.wireKeyCommitment)},
   head={number:'0x0',hash:'0x'+f.prepared.nativeHead.hash,timestamp:'0x'+BigInt(f.prepared.nativeHead.timestamp).toString(16)},balanceWei=f.prepared.liquidity.balanceAtomic,estimatedGas='50000',targetCodeHash='0x'+H('code'),binding=B.nativeValueEvmScopeBinding(f.binding,intent);
 const raw={profile:'LIANUM_OWNED_LOCAL_EVM_NATIVE_VALUE_V1',binding,genesis:'0x'+f.profile.genesis,head,transaction,unsignedWire:f.prepared.unsignedWire,
   funds:{balanceWei,estimatedGas,targetCodeHash,maximumFeeWei:f.prepared.liquidity.maximumFeeAtomic,estimatedFeeWei:(50000n*BigInt(t.fees.gasPrice)).toString(),
     ...ownedEvmNativeValueAuditCommitments({binding,transaction,head,balanceWei,estimatedGas,targetCodeHash})}};
 return {raw,prepared:B.normalizeOriginalNativeValueEvmPreparation(f.binding,intent,raw)};
}

export async function tronLowerFixture(options={}){
 const f=await fixture('tron',0,{...options,ownedTron:true}),intent=await B.bindNativeValueDispatchRequest(f.binding,f.request,{hashFields:traceHash});
 const P=await import('../../../../../src/chains/tron/transfers/owned-tron-native-value-profile.mjs');
 const t=f.prepared.transaction,height=BigInt('0x'+t.refBlockBytes).toString(),head={id:BigInt(height).toString(16).padStart(16,'0')+t.refBlockHash+'22'.repeat(16),number:height,timestampMs:t.timestampMs};
 const snapshot={genesis:f.profile.genesis,head,solid:{...head},reference:{...head},ownerAddress:t.ownerAddress,recipientAddress:t.recipientAddress,
  ownerPermission:{id:'0',type:'Owner',threshold:'1',keys:[{address:t.ownerAddress,weight:'1'}]},ownerBalanceSun:'1000000000000000',recipientExists:true,recipientType:'Normal',transactionFeeSun:'1000',memoFeeSun:'1000000',pendingCount:'0',chainParametersSHA256:H('parameters'),resourcesSHA256:H('resources'),configurationSHA256:H('configuration')};
 const raw=P.prepareOwnedTronNative({binding:B.nativeValueTronScopeBinding(f.binding,intent),intent:Object.fromEntries(['ownerAddress','recipientAddress','amountSun','wireKeyCommitment'].map(k=>[k,t[k]])),snapshot,nowMs:t.timestampMs});
 const prepared=B.normalizeOriginalNativeValueTronPreparation(f.binding,intent,raw),signed=B.assertNativeValueSigned(f.binding,prepared,{nativeWire:f.original.nativeWire});
 return {...f,intent,raw,prepared,signed,P};
}
