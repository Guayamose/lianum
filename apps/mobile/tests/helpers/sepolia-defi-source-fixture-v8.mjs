import {sepoliaDefiFixtureV7,defiHashV7 as h} from './sepolia-defi-fixture-v7.mjs';
export function sepoliaDefiSourceFixtureV8(publicKey){
 const a=sepoliaDefiFixtureV7().connection,m=sepoliaDefiFixtureV7('MORPHO_V2').connection;
 if(publicKey){a.descriptor.devicePublicKey=publicKey;m.descriptor.devicePublicKey=publicKey;}
 m.descriptor.poolTerms.genesis=a.descriptor.poolTerms.genesis;
 const source={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:a.descriptor.origin,pairingId:'source7-coordinator-host',devicePublicKey:a.descriptor.devicePublicKey,deadlineMs:Date.now()+3600000,chainId:'11155111',...Object.fromEntries(['scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,h('source7/'+k)])),genesis:a.descriptor.poolTerms.genesis,...Object.fromEntries(['pool','state','native','math'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)]))};
 const networks=['AAVE_STATIC','MORPHO_V2'].map((protocol,i)=>({protocol,family:'EVM',label:protocol,networkId:'ethereum-sepolia',chainDomain:h(protocol+'/domain'),evidencePolicy:h(protocol+'/policy'),assetSymbol:i?'mvUSDC':'stataUSDC',decimals:i?18:6,destinations:[]}));
 return{...a,paegSource:{descriptor:source,preparation:{family:'EVM',chainDomain:h('native/domain'),evidencePolicy:h('native/policy'),defi:{profile:'DEVICE_PAGED_PUBLIC_DEFI_PREPARATION_V8',classification:'PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE',fundingOrigin:'OPERATOR_TESTNET',networks,targetDescriptors:{AAVE_STATIC:a.descriptor,MORPHO_V2:m.descriptor}}}}};
}
