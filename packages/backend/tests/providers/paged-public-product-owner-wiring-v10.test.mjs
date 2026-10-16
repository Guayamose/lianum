import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const product=new URL('../../src/operations/local/funded-paged-public-native-operator-v4.mjs',import.meta.url);
test('the public product resolves every called member of its Original owner namespaces',async()=>{
 const source=await readFile(product,'utf8');
 const owners=[
  ['nativeOwner','../../providers/paged-public-testnet-runtimes-v1.mjs'],
  ['O.native','../../providers/paged-public-testnet-runtimes-v1.mjs'],
  ['providerOwner','../../providers/funded-paged-native-provider-v3.mjs'],
  ['O.provider','../../providers/funded-paged-native-provider-v3.mjs'],
  ['originalGraphOperatorOwner','./funded-graph-paged-device-graph-operator-v3.mjs'],
  ['mixedOwner','../../providers/paged-public-uniswap-product-extension-v5.mjs'],
  ['mixedSupervisorOwner','../recovery/paged-public-uniswap-mixed-supervisor-v4.mjs']
 ];
 let checked=0;
 for(const [name,path] of owners){
  const owner=await import(new URL(path,product));
  const escaped=name.replaceAll('.','\\.');
  const members=new Set([...source.matchAll(new RegExp('\\b'+escaped+'\\.([A-Za-z_$][\\w$]*)','g'))].map(match=>match[1]));
  for(const member of members){assert.equal(typeof owner[member],'function',name+'.'+member+' must resolve to the actual owner export');checked++;}
 }
 assert.ok(checked>50,'the wiring check must cover the product owner calls');
});

test('V10 mixed activation recovery is implemented by its actual supervisor',async()=>{
 const owner=await import('../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs');
 await assert.rejects(owner.recoverOriginalPagedPublicUniswapMixedActivationV10({directory:'/missing-original-supervisor-v10',password:'HOST_NONSECRET_CREDENTIAL_123456789',mixedJournalPassword:'HOST_NONSECRET_MIXED_CREDENTIAL_123456789'}),{code:'ENOENT'});
 await assert.rejects(owner.recoverOriginalPagedPublicUniswapMixedActivationV10({}),/./);
});
