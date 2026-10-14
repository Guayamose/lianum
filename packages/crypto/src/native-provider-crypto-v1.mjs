/** Pure provider transaction primitives. No network, storage, seed derivation,
 * user custody, Paged grant, engine import or acceptance is provided here. */
import {createPrivateKey,sign as edSign} from 'node:crypto';
import {hex,base58} from '@scure/base';
import {secp256k1} from '@noble/curves/secp256k1.js';
import {Transaction as EthTransaction,addr} from 'micro-eth-signer';
import * as btc from '@scure/btc-signer';

const need=(v,code='NATIVE_PROVIDER_CRYPTO_BINDING')=>{if(!v)throw Error(code);};
const uint=v=>{need(typeof v==='string'&&/^(0|[1-9][0-9]{0,38})$/.test(v));return BigInt(v);};
const key32=k=>need(k instanceof Uint8Array&&k.length===32);
const memo=k=>{need(typeof k==='string'&&/^[0-9a-f]{64}$/.test(k)&&k!=='0'.repeat(64));return new TextEncoder().encode('LNRB1:'+k);};
export function decodeProviderBase58HexV1(value){need(typeof value==='string'&&value.length>0&&value.length<=90);const bytes=base58.decode(value);need(bytes.length>0&&bytes.length<=64&&base58.encode(bytes)===value);return hex.encode(bytes);}
export function encodeProviderBase58HexV1(value){need(typeof value==='string'&&/^(?:[0-9a-f]{2})+$/.test(value)&&value.length<=128);return base58.encode(hex.decode(value));}
export function publicProviderAccountFromKeyV1(networkId,key){
 key32(key);let chain,address,publicKey;
 if(networkId==='ethereum-sepolia'){chain='ethereum';publicKey=hex.encode(secp256k1.getPublicKey(key,true));address=addr.fromPrivateKey(key).toLowerCase();}
 else if(networkId==='bitcoin-testnet'){chain='bitcoin';publicKey=hex.encode(secp256k1.getPublicKey(key,true));address=btc.p2wpkh(hex.decode(publicKey),btc.TEST_NETWORK).address;}
 else{need(networkId==='solana-devnet');chain='solana';const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),key]),format:'der',type:'pkcs8'});publicKey=Buffer.from(privateKey.export({format:'jwk'}).x,'base64url').toString('hex');address=encodeProviderBase58HexV1(publicKey);}
 return Object.freeze({networkId,chain,address,publicKey,keyGeneration:'SERVER_RANDOM_SINGLE_KEY'});
}
function eth(t){need(t.kind==='PAGED_SEPOLIA_1559_V1'&&t.chainId==='11155111');return EthTransaction.prepare({type:'eip1559',chainId:uint(t.chainId),nonce:uint(t.nonce),to:t.to,value:uint(t.value),gasLimit:uint(t.gasLimit),maxFeePerGas:uint(t.maxFeePerGas),maxPriorityFeePerGas:uint(t.maxPriorityFeePerGas),data:'0x'+hex.encode(memo(t.wireKeyCommitment)),accessList:[]});}
export function providerEvmUnsignedV1(t){const tx=eth(t);return{unsignedHex:tx.toHex(),maximumFeeAtomic:tx.fee.toString()};}
export function signProviderEvmWireV1(key,t){key32(key);return eth(t).signBy(key,false).toHex();}
export function validateProviderEvmSignatureV1(t,wire){const expected=eth(t),actual=EthTransaction.fromHex(wire);need(actual.toHex()===wire&&actual.toHex({includeSignature:false})===expected.toHex()&&actual.verifySignature());return{id:actual.hash.startsWith('0x')?actual.hash:'0x'+actual.hash,sender:actual.sender.toLowerCase(),signatureValid:true};}
function bitcoin(account,p){
 need(p.kind==='PAGED_TESTNET3_P2WPKH_V1');const i=p.intent,own=hex.encode(btc.p2wpkh(hex.decode(account.publicKey),btc.TEST_NETWORK).script);need(i.sourceScript===own&&i.changeScript===own);
 need(typeof p.previousTxHex==='string'&&/^(?:[0-9a-f]{2})+$/.test(p.previousTxHex)&&p.previousTxHex.length<=800000,'NATIVE_PROVIDER_PREVOUT_BOUND');
 const previous=btc.Transaction.fromRaw(hex.decode(p.previousTxHex),{allowUnknownOutputs:true});need(previous.id===i.sourceTxid&&uint(i.sourceVout)<BigInt(previous.outputsLength),'NATIVE_PROVIDER_PREVOUT_BINDING');const output=previous.getOutput(Number(i.sourceVout));need(output.amount===uint(i.sourceSatoshi)&&hex.encode(output.script)===own,'NATIVE_PROVIDER_PREVOUT_BINDING');
 const tx=new btc.Transaction({version:2,lockTime:0,strictPrevoutValidation:true,allowUnknownOutputs:true});tx.addInput({txid:i.sourceTxid,index:Number(i.sourceVout),sequence:4294967294,witnessUtxo:{amount:output.amount,script:output.script},nonWitnessUtxo:hex.decode(p.previousTxHex)});
 tx.addOutput({amount:uint(i.amountSatoshi),script:hex.decode(i.recipientScript)});tx.addOutput({amount:uint(i.sourceSatoshi)-uint(i.amountSatoshi)-uint(i.feeSatoshi),script:hex.decode(i.changeScript)});tx.addOutput({amount:0n,script:Buffer.concat([Buffer.from([0x6a,0x46]),memo(i.wireKeyCommitment)])});return tx;
}
export function providerBitcoinUnsignedHexV1(account,p){return hex.encode(bitcoin(account,p).unsignedTx);}
export function signProviderBitcoinWireV1(key,account,p){key32(key);const tx=bitcoin(account,p);need(tx.sign(key)===1);tx.finalize();return hex.encode(tx.extract());}
export function validateProviderBitcoinSignatureV1(account,p,wire){
 const unsigned=bitcoin(account,p),actual=btc.Transaction.fromRaw(hex.decode(wire),{allowUnknownOutputs:true});need(hex.encode(actual.unsignedTx)===hex.encode(unsigned.unsignedTx));const input=actual.getInput(0),w=input.finalScriptWitness,pub=hex.decode(account.publicKey);need(!input.finalScriptSig?.length&&w?.length===2&&hex.encode(w[1])===account.publicKey&&w[0].at(-1)===1);
 const digest=unsigned.preimageWitnessV0(0,btc.p2pkh(pub,btc.TEST_NETWORK).script,1,uint(p.intent.sourceSatoshi));need(secp256k1.verify(w[0].subarray(0,-1),digest,pub,{prehash:false,lowS:true,format:'der'}));return{id:actual.id,signatureValid:true};
}
export function signProviderSolanaMessageV1(key,messageHex){
 key32(key);need(typeof messageHex==='string'&&/^[0-9a-f]{512}$/.test(messageHex)&&messageHex.startsWith('01000204'));const message=Buffer.from(messageHex,'hex'),privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),key]),format:'der',type:'pkcs8'}),signature=edSign(null,message,privateKey);try{return Buffer.concat([Buffer.from([1]),signature,message]).toString('base64');}finally{signature.fill(0);message.fill(0);}
}
