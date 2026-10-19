/** Synthetic DATA and genuine cryptographic wire/quote framing only. There is
 * no original READY, observed public transfer, receipt, proof or spending grant. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {freshKey} from '@lianum/engine/notes/private-note-encoding';
import * as Q from '@lianum/mobile-protocol/device/paged-provider-quote-v4';
import {devicePagedEconomicProviderV3,normalizeDevicePagedEconomicSettlementRowV3} from '../../../mobile-protocol/src/device-paged-economic-view-v3.mjs';
import {signPagedNativeProviderQuoteV4,verifyPagedNativeProviderQuoteV4} from '../../src/providers/paged-native-quote-v4.mjs';
import {publicPagedTestnetNetworksV1} from '../../src/chains/public-testnet/profile-v1.mjs';
import {publicPagedAccountFromKeyV1,signPublicPagedPreparedV1} from '../../src/chains/public-testnet/wire-v1.mjs';
const h=v=>createHash('sha256').update('SYNTHETIC_PUBLIC_ECONOMIC_VIEW:'+v).digest('hex');
function fixture(){
 const key=freshKey(),point=devicePagedEconomicProviderV3('04'+key.x.toString('hex')+key.y.toString('hex')),config=publicPagedTestnetNetworksV1()[2],account=publicPagedAccountFromKeyV1('solana-devnet',Buffer.alloc(32,1)),target=publicPagedAccountFromKeyV1('solana-devnet',Buffer.alloc(32,2));
 const prepared={networkId:account.networkId,account,recipient:target.address,amountAtomic:'1000000',feeAtomic:'5000',wireKeyCommitment:h('K'),transaction:{kind:'PAGED_DEVNET_TRANSFER_MEMO_V1',intent:{sourcePublicKey:account.publicKey,recipientPublicKey:target.publicKey,recentBlockhash:h('declared-synthetic-blockhash'),lamports:'1000000',wireKeyCommitment:h('K')},lastValidBlockHeight:'100'}};
 const signed=signPublicPagedPreparedV1(account,prepared,Buffer.alloc(32,1)),descriptor={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://127.0.0.1:9448',pairingId:'synthetic-public-economic',devicePublicKey:point.publicKey,deadlineMs:Date.now()+60000,chainId:'31337',...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,h(k)])),...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))};
 const terms={profile:Q.DEVICE_PAGED_PROVIDER_QUOTE_V4,classification:'PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE',descriptor,providerIdentity:h('provider'),providerPublicKey:point.publicKey,signerIdentity:point.signerIdentity,graphId:'graph-synthetic-economic',rootId:h('root'),revision:1,budget:'100',preparationId:'paged-page-'+h('page').slice(0,32),id:'solana',ordinal:'0',dispatchId:h('dispatch'),actionSalt:h('salt'),deliver:{family:'SOL',genesis:config.rule.genesis,assetIdentity:config.rule.asset,chainDomain:config.configuration.chainDomain,unit:'lamport',decimals:9,amountAtomic:prepared.amountAtomic,recipient:target.address,sourceCommitment:h('source'),destinationCommitment:h('destination'),receiptKeyCommitment:h('K'),receiptRho:h('rho')},payout:{genesis:descriptor.genesis,chainId:descriptor.chainId,assetIdentity:descriptor.assetIdentity,unit:'atomic',amountAtomic:'100',commitment:h('payout'),beneficiary:point.address},feeCeiling:{assetIdentity:config.rule.asset,unit:'lamport',amountAtomic:'1000000',bearer:'PROVIDER'},inputCeiling:null,issuedAt:'1000',expiresAt:'2000',policy:Q.devicePagedProviderQuotePolicyV4()},quote=signPagedNativeProviderQuoteV4(key,terms,h('declared-synthetic-action'));verifyPagedNativeProviderQuoteV4(quote);
 const row={profile:'ORIGINAL_PAGED_NATIVE_ECONOMIC_SETTLEMENT_V3',classification:'PAGED_PUBLIC_TESTNET_RPC_PROVIDER_V1',descriptor,providerIdentity:terms.providerIdentity,checkpoint:{profile:'ORIGINAL_PAGED_NATIVE_PROVIDER_CHECKPOINT_V3',providerIdentity:terms.providerIdentity,configurationSHA256:h('configuration'),revision:1,dataSHA256:h('data')},id:'solana',authorizationRoot:h('auth'),actionCommitment:quote.actionCommitment,signerIdentity:point.signerIdentity,payoutCommitment:terms.payout.commitment,payoutAmount:'100',beneficiary:{chainId:descriptor.chainId,genesis:descriptor.genesis,assetIdentity:descriptor.assetIdentity,address:point.address,publicKey:point.publicKey},native:{family:'SOL',chainDomain:terms.deliver.chainDomain,genesis:config.rule.genesis,asset:config.rule.asset,amount:prepared.amountAtomic,source:account.address,destination:target.address,nativeId:signed.nativeId,status:'UNKNOWN',finalityKind:'2',confirmations:null,fee:{status:'UNKNOWN',asset:config.rule.asset,unit:'lamport',amount:null},conservation:{status:'UNKNOWN',balanced:null,crossAssetValueConservation:false}},quote};
 return{row,descriptor,signed,key};
}
test('public Solana economic DATA keeps the real signed-wire base58 ID and requires the same public quote class',()=>{
 const {row,descriptor,signed}=fixture();
 assert.equal(normalizeDevicePagedEconomicSettlementRowV3(row,descriptor).native.nativeId,signed.nativeId);
 for(const change of [r=>r.native.nativeId='1'+signed.nativeId,r=>r.native.nativeId='ab'.repeat(64),r=>r.quote=null,r=>r.classification='LOCAL_SYNTHETIC_COMMON_OPERATOR_3_OF_4',r=>r.quote.terms.deliver.amountAtomic='1000001']){const changed=structuredClone(row);change(changed);assert.throws(()=>normalizeDevicePagedEconomicSettlementRowV3(changed,descriptor),/MOBILE_PAGED|^Error: MOBILE_PUBLIC_SOLANA_SIGNATURE_DATA$/);}
});

function publicUniswapFixture(){
 const {row,descriptor,key}=fixture(),terms=structuredClone(row.quote.terms),network=publicPagedTestnetNetworksV1()[0];
 terms.id='uniswap';terms.deliver={...terms.deliver,family:'UNISWAP',genesis:network.rule.genesis,chainDomain:network.configuration.chainDomain,assetIdentity:h('output-token'),unit:'atomic',decimals:18,amountAtomic:'100',recipient:'0x'+'2'.repeat(40)};
 terms.feeCeiling={assetIdentity:descriptor.assetIdentity,unit:'wei',amountAtomic:'1000000',bearer:'PROVIDER'};
 terms.inputCeiling={assetIdentity:h('input-token'),unit:'atomic',amountAtomic:'200'};
 row.id=terms.id;row.quote=signPagedNativeProviderQuoteV4(key,terms,row.actionCommitment);verifyPagedNativeProviderQuoteV4(row.quote);
 row.native={...row.native,family:'UNISWAP',genesis:terms.deliver.genesis,chainDomain:terms.deliver.chainDomain,asset:terms.deliver.assetIdentity,amount:'100',source:'0x'+'1'.repeat(40),destination:terms.deliver.recipient,nativeId:'0x'+h('declared-synthetic-swap'),finalityKind:'3',status:'OBSERVED',confirmations:'2',fee:{status:'OBSERVED',asset:descriptor.assetIdentity,unit:'wei',amount:'10'},conservation:{status:'OBSERVED',kind:'PUBLIC_UNISWAP_EXACT_OUTPUT_V32',balanced:true,inputAsset:terms.inputCeiling.assetIdentity,inputSpent:'126',inputCeiling:'200',unusedInputCeiling:'74',outputAsset:terms.deliver.assetIdentity,outputDelivered:'100',protocolFeeAddedToInputSpent:false,crossAssetValueConservation:false}};
 return{row,descriptor};
}
test('public Uniswap settlement preserves the signed recipient and receipt amounts without inventing a local backing snapshot',()=>{
 const {row,descriptor}=publicUniswapFixture(),result=normalizeDevicePagedEconomicSettlementRowV3(row,descriptor);
 assert.equal(result.native.destination,row.quote.terms.deliver.recipient);
 assert.equal(result.native.conservation.inputSpent,'126');
 assert.equal(Object.hasOwn(result.native.conservation,'targetBacking'),false);
 const pending=structuredClone(row);Object.assign(pending.native,{status:'UNKNOWN',confirmations:null,fee:{status:'UNKNOWN',asset:descriptor.assetIdentity,unit:'wei',amount:null},conservation:{status:'UNKNOWN',balanced:null,crossAssetValueConservation:false}});
 assert.equal(normalizeDevicePagedEconomicSettlementRowV3(pending,descriptor).native.status,'UNKNOWN');
});
test('public Uniswap settlement rejects mismatched quotes, input ceilings, fees and invented backing evidence',()=>{
 const {row,descriptor}=publicUniswapFixture();
 for(const change of [
  r=>r.quote=null,
  r=>r.native.destination='0x'+'3'.repeat(40),
  r=>r.native.conservation.outputDelivered='101',
  r=>r.native.conservation.inputSpent='201',
  r=>r.native.conservation.unusedInputCeiling='73',
  r=>{r.native.conservation.inputCeiling='201';r.native.conservation.unusedInputCeiling='75';},
  r=>r.native.conservation.inputAsset=h('foreign-input'),
  r=>r.native.fee.asset=h('foreign-fee'),
  r=>r.native.conservation.kind='UNISWAP_EXACT_OUTPUT',
  r=>r.native.conservation.targetBacking={held:'100',liabilities:'100',surplus:'0',deficit:'0'},
  r=>r.native.conservation.protocolFeeAddedToInputSpent=true,
  r=>r.native.conservation.crossAssetValueConservation=true,
  r=>r.native.status='UNKNOWN',
  r=>r.classification='LOCAL_SYNTHETIC_COMMON_OPERATOR_3_OF_4',
 ]){const changed=structuredClone(row);change(changed);assert.throws(()=>normalizeDevicePagedEconomicSettlementRowV3(changed,descriptor),/MOBILE_PAGED/);}
});
