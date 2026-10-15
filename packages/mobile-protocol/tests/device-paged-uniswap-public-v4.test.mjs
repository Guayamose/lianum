/** Synthetic preparation DATA only. No receiver, TLS trust, proof, Original
 * provider or signing authorization is created by these parser cases. */
import test from 'node:test';import assert from 'node:assert/strict';
import * as U from '../src/device-paged-uniswap-public-v4.mjs';
import * as C from '../src/device-paged-graph-v3.mjs';
import * as B from '../src/device-paged-budget-asset-v4.mjs';
import {normalizeDevicePagedUniswapIntentV3} from '../src/device-paged-uniswap-v3.mjs';
const h=n=>n.toString(16).padStart(64,'0'),a=n=>'0x'+n.toString(16).padStart(40,'0');
function fixture(){
 const source={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://api.lianum.example.test',pairingId:'synthetic-pairing',devicePublicKey:'04'+'11'.repeat(64),deadlineMs:Date.now()+60000,chainId:'11155111',genesis:h(1),pool:a(1),state:a(2),native:a(3),scope:h(2),policy:h(3),assetIdentity:h(4),domain:h(5),hubDomain:h(6),registryCommitment:h(7),manifestSHA256:h(8),consumerSHA256:h(9),poolCodeHash:h(10),stateCodeHash:h(11),nativeCodeHash:h(12),math:a(4),mathCodeHash:h(13)};
 const target={profile:'LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1',origin:source.origin,pairingId:h(14),devicePublicKey:source.devicePublicKey,lifetime:h(15),poolTerms:{pool:'55'.repeat(20),poolCodeHash:h(16),scope:h(17),policy:h(18),assetIdentity:h(19),asset:'94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8',assetCodeHash:h(20),genesis:source.genesis,domainCommitment:h(21),hub:'66'.repeat(20),hubCodeHash:h(22),hubDomain:h(23),ledgerNamespace:h(24)},assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}};
 const uniswap={profile:U.DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4,configuration:{family:'EVM',label:'Uniswap · USDC · Sepolia',networkId:'ethereum-sepolia',chainDomain:h(25),evidencePolicy:h(26),assetSymbol:'USDC',decimals:6,destinations:[]},targetConnection:{format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',descriptor:target,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nU1lOVEhFVElD\n-----END CERTIFICATE-----\n',certificateSHA256:h(27)}},template:{maximumInput:'182926400599',outputAmount:'1000000',recipient:'77'.repeat(20),inputAsset:{asset:'fff9976782d46cc05630d1f6ebab18b2324d6b14',assetIdentity:h(28),symbol:'WETH',decimals:18}},minimumOutputAtomic:'1000000'};
 return{source,uniswap,preparation:{family:'EVM',chainDomain:h(29),evidencePolicy:h(30),uniswap}};
}
test('PUBLIC Uniswap preparation has real testnet units, explicit same-origin TLS and minimum output; it never uses the LOCAL 200/100 template',()=>{
 const f=fixture(),v=U.normalizeDevicePagedPublicUniswapPreparationV4(f.uniswap,f.source);assert.equal(v.template.outputAmount,'1000000');assert.equal(v.template.maximumInput,'182926400599');assert.equal(v.targetConnection.descriptor.origin,f.source.origin);assert.ok(Object.isFrozen(v.template.inputAsset));assert.equal(C.normalizeDevicePagedNativePreparationV3(f.preparation,f.source).uniswap.profile,U.DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4);assert.equal(B.assertDevicePagedPublicNetworkIdDataV4('ethereum-sepolia','UNISWAP'),'ethereum-sepolia');assert.throws(()=>B.assertDevicePagedPublicNetworkIdDataV4('solana-devnet','UNISWAP'));assert.throws(()=>C.normalizeDevicePagedUniswapPreparationV3(f.uniswap,f.source));
});
test('PUBLIC parser rejects altered Source identity, wrong token/network, invalid limits and legacy fixture output',()=>{
 const f=fixture();for(const change of [v=>v.configuration.networkId='ethereum-mainnet',v=>v.configuration.decimals=18,v=>v.targetConnection.descriptor.origin='https://foreign.example.test',v=>v.targetConnection.descriptor.devicePublicKey='04'+'22'.repeat(64),v=>v.targetConnection.descriptor.poolTerms.genesis=h(99),v=>v.targetConnection.descriptor.poolTerms.asset='11'.repeat(20),v=>v.template.inputAsset.decimals=6,v=>v.template.maximumInput='0',v=>v.template.outputAmount='100',v=>v.minimumOutputAtomic='100',v=>v.template.recipient='00'.repeat(20),v=>v.template.maximumInput=(1n<<64n).toString(),v=>v.targetConnection.transport.type='UNPINNED',v=>v.extra='unreviewed']){const x=structuredClone(f.uniswap);change(x);assert.throws(()=>U.normalizeDevicePagedPublicUniswapPreparationV4(x,f.source));}
 assert.throws(()=>U.normalizeDevicePagedPublicUniswapPreparationV4(f.uniswap,{...f.source,chainId:'31337'}));
});

test('reviewed PUBLIC Uniswap recipient persists in normalized intent; legacy intent bytes stay exact',()=>{
 const legacy={kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE',depositJobId:h(31),rootId:h(32),outputCommitment:h(33),maximumInput:'100',outputAmount:'1000000',validFrom:'1900000000',validUntil:'1900000600'};
 assert.equal(JSON.stringify(normalizeDevicePagedUniswapIntentV3(legacy)),JSON.stringify(legacy));assert.equal(Object.hasOwn(normalizeDevicePagedUniswapIntentV3(legacy),'recipient'),false);
 const reviewed={...legacy,recipient:'77'.repeat(20)},normalized=normalizeDevicePagedUniswapIntentV3(reviewed);assert.equal(normalized.recipient,reviewed.recipient);assert.ok(Object.isFrozen(normalized));assert.equal(C.normalizeDevicePagedUniswapIntentV3(reviewed).recipient,reviewed.recipient);
 for(const recipient of [undefined,null,'','0'.repeat(40),'0x'+'77'.repeat(20),'G'.repeat(40),'7'.repeat(39),'7'.repeat(41)])assert.throws(()=>normalizeDevicePagedUniswapIntentV3({...legacy,recipient}));
 assert.throws(()=>normalizeDevicePagedUniswapIntentV3({...reviewed,unreviewedRecipient:'88'.repeat(20)}));
});
