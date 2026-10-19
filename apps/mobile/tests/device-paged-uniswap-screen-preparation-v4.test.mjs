/** Exercise the actual screen's render-time preparation reader and page mapper.
 * Synthetic data only: no signatures, RPC, TLS authority or financial operation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from '../node_modules/typescript/lib/typescript.js';
import * as U from '../../../packages/mobile-protocol/src/device-paged-uniswap-public-v4.mjs';
import {normalizeDevicePagedUniswapPreparationV3} from '../../../packages/mobile-protocol/src/device-paged-uniswap-v3.mjs';
const h=n=>n.toString(16).padStart(64,'0'),a=n=>'0x'+n.toString(16).padStart(40,'0');
function fixture(){
 const source={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin:'https://api.lianum.example.test',pairingId:'synthetic-pairing',devicePublicKey:'04'+'11'.repeat(64),deadlineMs:Date.now()+60000,chainId:'11155111',genesis:h(1),pool:a(1),state:a(2),native:a(3),scope:h(2),policy:h(3),assetIdentity:h(4),domain:h(5),hubDomain:h(6),registryCommitment:h(7),manifestSHA256:h(8),consumerSHA256:h(9),poolCodeHash:h(10),stateCodeHash:h(11),nativeCodeHash:h(12),math:a(4),mathCodeHash:h(13)};
 const target={profile:'LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1',origin:source.origin,pairingId:h(14),devicePublicKey:source.devicePublicKey,lifetime:h(15),poolTerms:{pool:'55'.repeat(20),poolCodeHash:h(16),scope:h(17),policy:h(18),assetIdentity:h(19),asset:'94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8',assetCodeHash:h(20),genesis:source.genesis,domainCommitment:h(21),hub:'66'.repeat(20),hubCodeHash:h(22),hubDomain:h(23),ledgerNamespace:h(24)},assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}};
 const uniswap={profile:U.DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4,configuration:{family:'EVM',label:'Uniswap · USDC · Sepolia',networkId:'ethereum-sepolia',chainDomain:h(25),evidencePolicy:h(26),assetSymbol:'USDC',decimals:6,destinations:[]},targetConnection:{format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',descriptor:target,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nU1lOVEhFVElD\n-----END CERTIFICATE-----\n',certificateSHA256:h(27)}},template:{maximumInput:'182926400599',outputAmount:'1000000',recipient:'77'.repeat(20),inputAsset:{asset:'fff9976782d46cc05630d1f6ebab18b2324d6b14',assetIdentity:h(28),symbol:'WETH',decimals:18}},minimumOutputAtomic:'1000000'};
 return{source,uniswap,preparation:{family:'EVM',chainDomain:h(29),evidencePolicy:h(30),uniswap}};
}
const source=await readFile(new URL('../src/screens/DevicePagedGraphScreen.tsx',import.meta.url),'utf8');
const tree=ts.createSourceFile('screen.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),functions=new Map();
function visit(n){if(ts.isFunctionDeclaration(n)&&['uniswapPreparation','pageStep'].includes(n.name?.text))functions.set(n.name.text,n);ts.forEachChild(n,visit);}visit(tree);
assert.equal(functions.size,2);
function screen(f){
 const host={nativePreparation:f.preparation,current:{current:{descriptor:f.source}},savedProfileRef:{current:null},pairing:'',...U,normalizeDevicePagedUniswapPreparationV3,pagedNativeNetworksV3:()=>[]};
 const code=[...functions.values()].map(fn=>fn.getText(tree)).join('\n')+'\n({uniswapPreparation,pageStep})';
 return vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,host);
}
test('actual screen displays and maps a public Sepolia Uniswap preparation without using the local-only codec',()=>{
 const f=fixture(),ui=screen(f),v=ui.uniswapPreparation();
 assert.equal(v.profile,U.DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4);assert.equal(v.template.outputAmount,'1000000');assert.equal(v.configuration.assetSymbol,'USDC');
 const node={id:'swap',amount:'100',intent:{kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE'}};
 const step=ui.pageStep(node,f.preparation);assert.equal(step.chainDomain,f.uniswap.configuration.chainDomain);assert.equal(step.evidencePolicy,f.uniswap.configuration.evidencePolicy);
 assert.equal(ui.uniswapPreparation(null),null);assert.equal(ui.uniswapPreparation({}),null);
});
test('actual screen keeps the local Uniswap preparation and page mapping working',()=>{
 const f=fixture();f.source.origin='https://localhost:7443';f.source.chainId='31337';delete f.uniswap.profile;delete f.uniswap.minimumOutputAtomic;delete f.uniswap.configuration.networkId;
 f.uniswap.targetConnection.descriptor.origin='https://localhost:7444';f.uniswap.template.maximumInput='200';f.uniswap.template.outputAmount='100';
 const ui=screen(f),v=ui.uniswapPreparation();assert.equal(v.template.maximumInput,'200');assert.equal(v.template.outputAmount,'100');assert.equal(Object.hasOwn(v,'profile'),false);
 assert.equal(ui.pageStep({intent:{kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE'}},f.preparation).chainDomain,f.uniswap.configuration.chainDomain);
});
test('actual screen still rejects altered public identity, network and origin before preparing a step',()=>{
 for(const mutate of [f=>f.uniswap.configuration.networkId='ethereum-mainnet',f=>f.uniswap.targetConnection.descriptor.devicePublicKey='04'+'22'.repeat(64),f=>f.uniswap.targetConnection.descriptor.origin='https://foreign.example.test',f=>f.uniswap.profile='UNKNOWN']){
  const f=fixture();mutate(f);assert.throws(()=>screen(f).uniswapPreparation());assert.throws(()=>screen(f).pageStep({intent:{kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE'}},f.preparation));
 }
});
