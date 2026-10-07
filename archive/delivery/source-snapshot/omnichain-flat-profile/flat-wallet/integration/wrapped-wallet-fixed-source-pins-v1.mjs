/** Additive fixed import closure; original historical collectors unchanged. */
import assert from 'node:assert/strict';
import { dirname,join,relative,resolve,sep } from 'node:path';
import { ROOT,FLAT,GOLDEN } from '../proof-workers/catalog.mjs';
import { regular,hash } from '../proof-workers/tooling.mjs';
import { nativeWalletRealSourcePins } from './native-wallet-real-source-pins-v1.mjs';
export function wrappedWalletFixedSourcePinsV1(){
 assert.equal(arguments.length,0,'WRAPPED_FIXED_SOURCE_NO_OPTIONS');const base=nativeWalletRealSourcePins();
 const bootstrap=join(ROOT,'integration/wrapped-installation-source-inspector-v2.mjs');
 const files=new Map(base.local.map(row=>[resolve(FLAT,row.path),row]));files.delete(bootstrap);
 const bootstrapBytes=regular(bootstrap),externalInstallationBootstrap={path:relative(FLAT,bootstrap).split(sep).join('/'),bytes:bootstrapBytes.length,sha256:hash(bootstrapBytes),classification:'EXTERNALLY_INSTALLED_ROOT_LIFETIME_OBSERVATION_NOT_AUTHORITY'};
 function visit(path){if(path===bootstrap)return;assert.ok([ROOT,FLAT,GOLDEN].some(root=>path.startsWith(root+sep)),'WRAPPED_FIXED_SOURCE_ROOT');if(files.has(path))return;
  const bytes=regular(path);files.set(path,{path:relative(FLAT,path).split(sep).join('/'),bytes:bytes.length,sha256:hash(bytes)});
  if(!path.endsWith('.mjs'))return;const source=bytes.toString(),names=new Set();
  for(const match of source.matchAll(/\b(?:import|export)\s+(?:[^;'"\n]*?\s+from\s*)?(['"])([^'"]+)\1/g))names.add(match[2]);
  for(const match of source.matchAll(/^\s*(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/gm))names.add(match[2]);
  for(const match of source.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g))names.add(match[2]);
  for(const match of source.matchAll(/new\s+URL\s*\(\s*(['"])([^'"]+\.(?:mjs|json))\1\s*,\s*import\.meta\.url/g))names.add(match[2]);
  for(const name of names){if(name.startsWith('node:')||['@aztec/bb.js','@noir-lang/noir_js','@noir-lang/noir_wasm'].includes(name))continue;
   assert.ok(name.startsWith('.'),'WRAPPED_FIXED_SOURCE_IMPORT');visit(resolve(dirname(path),name));}
 }
 for(const name of ['run-wrapped-deployment-only-v1','wrapped-deployment-only-v1','run-wrapped-wallet-fixed-acceptance-v1','run-wrapped-wallet-fixed-preflight-v1','wrapped-wallet-fixed-acceptance-v1',
  'wrapped-wallet-fixed-preflight-v1','wrapped-wallet-fixed-driver-v1','wrapped-wallet-fixed-fixture-v1','wrapped-wallet-fixed-steps-v1',
  'wrapped-wallet-fixed-terminal-v1','wrapped-wallet-fixed-policy-v1','wrapped-wallet-fixed-source-pins-v1','wrapped-wallet-acceptance-v1'])visit(join(ROOT,'integration',name+'.mjs'));
 for(const name of ['wrapped-claim-role-process-v1.mjs','wrapped-claim-worker-v1.mjs','wrapped-claim-abi-source-v1.json',
  'wrapped-claim-abi-reviewed-v2.json','wrapped-claim-abi-reviewed-v3.json','wrapped-claim-constraint-batches-v1.json'])visit(join(ROOT,'proof-workers',name));
 for(const [path,row]of files){const b=regular(path);assert.equal(b.length,row.bytes??b.length);assert.equal(hash(b),row.sha256,'WRAPPED_FIXED_SOURCE_CHANGED');}
 return {...base,format:'LIANUM_FIXED_WRAPPED_WALLET_SOURCE_CLOSURE_V2',externalInstallationBootstrap,local:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
