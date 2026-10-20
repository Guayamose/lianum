import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm,symlink,rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {X509Certificate,createHash} from 'node:crypto';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {hex} from '@scure/base';
import {createPublicWalletHttpServiceV1} from '../../src/public-wallet/http-service-v1.mjs';
import {readCloudConnectionDirectoryV1,normalizeCloudConnectionDirectoryV1} from '../../src/public-wallet/connection-directory-v1.mjs';
import {nativeWalletAuthMessageV1,nativeWalletBodyHashV1} from '../../../crypto/src/native-wallet-auth-v1.mjs';

const origin='https://wallet.example',path='/v1/wallet/connections';
const identity=byte=>{const key=new Uint8Array(32).fill(byte);return{key,devicePublicKey:hex.encode(secp256k1.getPublicKey(key,false))};};
function descriptor(devicePublicKey){
 const value={profile:'LIANUM_DEVICE_PAGED_OWNER_V3',graphProfile:'LIANUM_PAEG_FUNDED_PAGED_V3',sparseEncoding:'BN254_POSEIDON2_SPARSE_V3',origin,devicePublicKey,pairingId:'cloud-source-'+devicePublicKey.slice(2,10),deadlineMs:Date.now()+3600000,chainId:'11155111'};
 for(const name of ['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'])value[name]='1'.repeat(64);
 for(const [i,name]of ['pool','state','native','math'].entries())value[name]='0x'+String(i+1).repeat(40);return value;
}
async function setup(t){
 const directory=await mkdtemp(join(tmpdir(),'lianum-connections-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 execFileSync('openssl',['req','-x509','-newkey','ec','-pkeyopt','ec_paramgen_curve:P-256','-nodes','-keyout',join(directory,'key.pem'),'-out',join(directory,'cert.pem'),'-days','1','-subj','/CN=wallet.example','-addext','subjectAltName=DNS:wallet.example'],{stdio:'ignore'});
 const certificatePEM=await readFile(join(directory,'cert.pem'),'utf8'),cert=new X509Certificate(certificatePEM);
 const transport={type:'ANDROID_PINNED_TLS_V1',certificatePEM,certificateSHA256:createHash('sha256').update(cert.raw).digest('hex')};
 const a=identity(1),b=identity(2),packet=who=>({format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor:descriptor(who.devicePublicKey),transport});
 const data={profile:'LIANUM_CLOUD_CONNECTION_DIRECTORY_V1',connections:[packet(a),packet(b)]},file=join(directory,'connections.json');await writeFile(file,JSON.stringify(data),{mode:0o640});return{directory,file,data,a,b,packet};
}
test('discovery authenticates the wallet, isolates profiles, prevents replay and never creates native custody',async t=>{
 const {directory,file,a,b,data}=await setup(t);let created=0;
 const service=await createPublicWalletHttpServiceV1({origin,directory:join(directory,'state'),connectionDirectoryPath:file,nativeConfiguration:{},nativeFactory:async()=>{created++;throw Error('SHOULD_NOT_CREATE');}});
 const address=await service.listen(),url='http://127.0.0.1:'+address.port;t.after(()=>service.close());
 const send=(route,value)=>fetch(url+route,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});
 for(const who of [a,b,identity(3)]){
  const body='{}',expected={origin,path,bodySHA256:nativeWalletBodyHashV1(body),devicePublicKey:who.devicePublicKey};
  const challenge=await(await send('/v1/auth/challenge',expected)).json();
  const signature=hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,expected),who.key,{prehash:true,lowS:true}));
  const envelope={challenge,body,signature};
  const bad=await send(path,{...envelope,signature:'00'.repeat(64)});assert.equal(bad.status,403);
  const response=await send(path,envelope);assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.devicePublicKey,who.devicePublicKey);assert.equal(result.connections.length,who===a||who===b?1:0);
  assert.ok(result.connections.every(row=>row.descriptor.devicePublicKey===who.devicePublicKey));
  assert.equal((await send(path,envelope)).status,403);
 }
 const server=service.server;data.connections[0].descriptor.pairingId='same-owner-new-pairing';const staging=join(directory,'connections-next.json');await writeFile(staging,JSON.stringify(data),{mode:0o640});await rename(staging,file);
 async function readUpdated(){const body='{}',expected={origin,path,bodySHA256:nativeWalletBodyHashV1(body),devicePublicKey:a.devicePublicKey},challenge=await(await send('/v1/auth/challenge',expected)).json(),signature=hex.encode(secp256k1.sign(nativeWalletAuthMessageV1(challenge,expected),a.key,{prehash:true,lowS:true}));return send(path,{challenge,signature,body});}
 const updated=await readUpdated();assert.equal(updated.status,200);assert.equal((await updated.json()).connections[0].descriptor.pairingId,'same-owner-new-pairing');assert.strictEqual(service.server,server,'discovery refresh never restarts the service');
 data.connections[0].transport.certificateSHA256='0'.repeat(64);await writeFile(staging,JSON.stringify(data),{mode:0o640});await rename(staging,file);assert.equal((await readUpdated()).status,400,'every replacement is validated; invalid metadata is not served');
 assert.equal((await send(path,{})).status,403);assert.equal((await fetch(url+path)).status,404);assert.equal(created,0);
});
test('directory rejects foreign origins, secret fields, wrong pins and ambiguous wallets; symlinks are not followed',async t=>{
 const {directory,file,data}=await setup(t);
 assert.equal((await readCloudConnectionDirectoryV1(file,origin)).length,2);
 for(const mutate of [v=>{v.connections[0].privateKey='PRIVATE';},v=>{v.connections[0].descriptor.origin='https://other.example';},v=>{v.connections[0].transport.certificateSHA256='0'.repeat(64);},v=>{v.connections.push(v.connections[0]);}]){
  const copy=structuredClone(data);mutate(copy);assert.throws(()=>normalizeCloudConnectionDirectoryV1(copy,origin),/NATIVE_CONNECTION_DIRECTORY_INVALID/);
 }
 await symlink(file,join(directory,'link.json'));await assert.rejects(readCloudConnectionDirectoryV1(join(directory,'link.json'),origin));
});

test('four profiles preserve the common Source7 routing and reject contradictory DeFi sources',async t=>{
 const {data,a,packet}=await setup(t),primary=packet(a),source=descriptor(a.devicePublicKey);source.pairingId='source7-routing';source.pool='0x'+'a'.repeat(40);const h=v=>createHash('sha256').update(v).digest('hex');
 const output=protocol=>({profile:'LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1',origin,devicePublicKey:a.devicePublicKey,pairingId:h('pair'+protocol),lifetime:h('life'+protocol),assetMetadata:{kind:'ERC20',symbol:protocol==='AAVE_STATIC'?'stataUSDC':protocol==='MORPHO_V2'?'mvUSDC':'USDC',decimals:protocol==='MORPHO_V2'?18:6},poolTerms:{...Object.fromEntries(['pool','asset','hub'].map(key=>[key,h(key+protocol).slice(0,40)])),...Object.fromEntries(['poolCodeHash','scope','policy','assetIdentity','assetCodeHash','genesis','domainCommitment','hubCodeHash','hubDomain','ledgerNamespace'].map(key=>[key,key==='genesis'?source.genesis:h(key+protocol)]))}});
 const targets={AAVE_STATIC:output('AAVE_STATIC'),MORPHO_V2:output('MORPHO_V2')},paegSource={descriptor:source,preparation:{family:'EVM',chainDomain:h('nativechain'),evidencePolicy:h('nativeevidence'),defi:{profile:'DEVICE_PAGED_PUBLIC_DEFI_PREPARATION_V8',classification:'PUBLIC_TESTNET_FIXED_PROVIDER_OFFER_NOT_MARKET_PRICE',fundingOrigin:'OPERATOR_TESTNET',networks:Object.entries(targets).map(([protocol,d])=>({protocol,family:'EVM',label:protocol,networkId:'ethereum-sepolia',chainDomain:h('chain'+protocol),evidencePolicy:h('evidence'+protocol),assetSymbol:d.assetMetadata.symbol,decimals:d.assetMetadata.decimals,destinations:[]})),targetDescriptors:targets}}};
 const profiles=Object.entries(targets).map(([protocol,d])=>({format:'DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7',descriptor:d,transport:primary.transport,protocol,underlying:{symbol:'USDC',decimals:6,address:'0x'+'c'.repeat(40)},terms:{shareWithdrawalRecipient:'0x'+'d'.repeat(40),underlyingReceiver:null,maximumInputAtomic:'10000000',minimumAssetsAtomic:'1'},paegSource:structuredClone(paegSource)}));
 data.connections=[primary,{format:'DEVICE_EXTERNAL_FLAT_CONNECTION_V1',descriptor:output('UNISWAP'),transport:primary.transport},...profiles];const normalized=normalizeCloudConnectionDirectoryV1(data,origin);assert.equal(normalized.length,4);assert.deepEqual(normalized[2].paegSource,paegSource);assert.deepEqual(normalized[2].paegSource,normalized[3].paegSource);
 const bad=structuredClone(data);bad.connections[3].paegSource.descriptor.pairingId='other-source7';assert.throws(()=>normalizeCloudConnectionDirectoryV1(bad,origin),/NATIVE_CONNECTION_DIRECTORY_INVALID/);
});
