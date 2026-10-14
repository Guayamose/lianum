import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,chmod,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as btc from '@scure/btc-signer';
import {hex,base58} from '@scure/base';
import {publicPagedTestnetNetworksV1} from '../../src/chains/public-testnet/profile-v1.mjs';
import {publicPagedAccountFromKeyV1,signPublicPagedPreparedV1,validatePublicPagedSignedV1} from '../../src/chains/public-testnet/wire-v1.mjs';
import {initializePublicPagedServerKeysV1,openPublicPagedServerKeysV1,readPublicPagedServerAccountsV1,closePublicPagedServerKeysV1,signOriginalPublicPagedPreparedV1} from '../../src/chains/public-testnet/key-store-v1.mjs';
import {createOriginalPagedPublicTestnetRuntimesV1} from '../../src/providers/paged-public-testnet-runtimes-v1.mjs';

// Declared synthetic transaction vectors. No network, mined block, Paged grant,
// funded wallet, proof, historical acceptance or production key is fabricated.
const key=Buffer.alloc(32,1),target=Buffer.alloc(32,2),K='ab'.repeat(32);
const accounts=['ethereum-sepolia','bitcoin-testnet','solana-devnet'].map(id=>publicPagedAccountFromKeyV1(id,key));
const targets=['ethereum-sepolia','bitcoin-testnet','solana-devnet'].map(id=>publicPagedAccountFromKeyV1(id,target));
function prepared(index){
 const account=accounts[index],recipient=targets[index].address;
 if(index===0)return{networkId:account.networkId,account,recipient,amountAtomic:'1000',feeAtomic:'600000',wireKeyCommitment:K,transaction:{kind:'PAGED_SEPOLIA_1559_V1',chainId:'11155111',nonce:'0',to:recipient,value:'1000',gasLimit:'30000',maxFeePerGas:'20',maxPriorityFeePerGas:'2',wireKeyCommitment:K}};
 if(index===1){const output=btc.p2wpkh(hex.decode(account.publicKey),btc.TEST_NETWORK),funding=new btc.Transaction({allowUnknownInputs:true});funding.addOutput({amount:100000n,script:output.script});funding.addInput({txid:'11'.repeat(32),index:0,finalScriptSig:Uint8Array.of(0)});const previousTxHex=hex.encode(funding.toBytes(true,true)),intent={sourceTxid:funding.id,sourceVout:'0',sourceScript:hex.encode(output.script),sourceSatoshi:'100000',recipientScript:hex.encode(btc.p2wpkh(hex.decode(targets[1].publicKey),btc.TEST_NETWORK).script),amountSatoshi:'10000',changeScript:hex.encode(output.script),feeSatoshi:'500',wireKeyCommitment:K};return{networkId:account.networkId,account,recipient,amountAtomic:'10000',feeAtomic:'500',wireKeyCommitment:K,transaction:{kind:'PAGED_TESTNET3_P2WPKH_V1',intent,previousTxHex}};}
 return{networkId:account.networkId,account,recipient,amountAtomic:'1000000',feeAtomic:'5000',wireKeyCommitment:K,transaction:{kind:'PAGED_DEVNET_TRANSFER_MEMO_V1',intent:{sourcePublicKey:account.publicKey,recipientPublicKey:targets[2].publicKey,recentBlockhash:'33'.repeat(32),lamports:'1000000',wireKeyCommitment:K},lastValidBlockHeight:'100'}};
}
test('testnet domains use pinned genuine genesis and separate assets, mainnet/local rejected',()=>{
 const networks=publicPagedTestnetNetworksV1();assert.equal(networks[0].chainId,'11155111');assert.equal(networks[1].rule.minimumConfirmations,'6');assert.equal(networks[2].rule.genesis,Buffer.from(base58.decode('EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG')).toString('hex'));assert.equal(new Set(networks.map(n=>n.rule.asset)).size,3);assert.throws(()=>publicPagedTestnetNetworksV1({networks:[{id:'ethereum-mainnet',endpoint:'https://ethereum-rpc.publicnode.com'}]}));
});
for(let index=0;index<3;index++)test('real cryptographic K-bound '+accounts[index].networkId+' wire rejects changed intent/signature',()=>{
 const p=prepared(index),signed=signPublicPagedPreparedV1(accounts[index],p,key);assert.deepEqual(validatePublicPagedSignedV1(accounts[index],p,signed.nativeWire),signed);const tampered=structuredClone(p);if(index===0)tampered.transaction.value='1001';else if(index===1)tampered.transaction.intent.amountSatoshi='10001';else tampered.transaction.intent.lamports='1000001';assert.throws(()=>validatePublicPagedSignedV1(accounts[index],tampered,signed.nativeWire));
 const bytes=Buffer.from(signed.nativeWire.replace(/^0x/,''),index===2?'base64':'hex');bytes[bytes.length-1]^=1;assert.throws(()=>validatePublicPagedSignedV1(accounts[index],p,index===2?bytes.toString('base64'):index===0?'0x'+bytes.toString('hex'):bytes.toString('hex')));
 if(index===1){const dishonest=structuredClone(p);dishonest.transaction.intent.sourceSatoshi='99999';assert.throws(()=>signPublicPagedPreparedV1(accounts[index],dishonest,key),/NATIVE_PROVIDER_PREVOUT_BINDING/);}
});
test('sealed keyset keeps same accounts, refuses replacement, bad permissions and generic DTO signing',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-public-key-test-'));let handle;
 try{await chmod(directory,0o700);const born=await initializePublicPagedServerKeysV1(directory);assert.equal(born.accounts.length,3);assert.equal(born.userWalletImported,false);assert.equal(JSON.stringify(born).includes('privateKey'),false);await assert.rejects(initializePublicPagedServerKeysV1(directory),/ALREADY_INITIALIZED/);handle=await openPublicPagedServerKeysV1(directory);assert.deepEqual(readPublicPagedServerAccountsV1(handle),born);await assert.rejects(signOriginalPublicPagedPreparedV1(handle,{}, {},prepared(0)),/ORIGINAL_PROVIDER_SEAM_REQUIRED|PUBLIC_KEY_ACCOUNT_BINDING/);closePublicPagedServerKeysV1(handle);assert.throws(()=>readPublicPagedServerAccountsV1(handle),/CLOSED/);await chmod(join(directory,'wrapping-key.bin'),0o644);await assert.rejects(openPublicPagedServerKeysV1(directory),/PUBLIC_KEY_FILE/);}
 finally{closePublicPagedServerKeysV1(handle);await rm(directory,{recursive:true,force:true});}
});
test('actual public identities are required before opening runtime, network mismatch closes journal',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-public-runtime-test-')),originalFetch=globalThis.fetch;
 try{await chmod(directory,0o700);await initializePublicPagedServerKeysV1(join(directory,'keys'));globalThis.fetch=async(_url,options)=>{const request=JSON.parse(options.body);return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result:request.method==='eth_chainId'?'0x1':{hash:'0x'+'00'.repeat(32)}}));};await assert.rejects(createOriginalPagedPublicTestnetRuntimesV1({directory}),/NETWORK_IDENTITY/);await assert.rejects(readFile(join(directory,'dispatch-journal','native-wallet.lock')),e=>e.code==='ENOENT');}
 finally{globalThis.fetch=originalFetch;await rm(directory,{recursive:true,force:true});}
});
