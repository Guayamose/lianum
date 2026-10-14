/** Provider-only Paged K-bound transfers. Wallet user signers remain unchanged. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {publicProviderAccountFromKeyV1,providerEvmUnsignedV1,signProviderEvmWireV1,validateProviderEvmSignatureV1,providerBitcoinUnsignedHexV1,signProviderBitcoinWireV1,validateProviderBitcoinSignatureV1,signProviderSolanaMessageV1,decodeProviderBase58HexV1,encodeProviderBase58HexV1} from '@lianum/crypto/native-provider-crypto-v1';
import {bitcoinScriptV1} from '@lianum/crypto/native-wallet-v1';
import {encodeWireCommitment,encodeBitcoinBinding,validateBitcoinBinding,encodeSolanaBindingMessage,validateSolanaBindingTransaction} from '@lianum/engine/native/native-receipt-binding';
import {exact,need,uint,freeze} from '../../native-wallet/common-v1.mjs';
import {assertPublicPagedProviderAccountV1} from './account-v1.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const key32=k=>{need(k instanceof Uint8Array&&k.length===32,'PUBLIC_SIGNING_KEY');return k;};
export function publicPagedAccountFromKeyV1(networkId,key){key32(key);return freeze(publicProviderAccountFromKeyV1(networkId,key));}
function ethereumTransaction(account,p){
 exact(p,['kind','chainId','nonce','to','value','gasLimit','maxFeePerGas','maxPriorityFeePerGas','wireKeyCommitment']);need(p.kind==='PAGED_SEPOLIA_1559_V1'&&p.chainId==='11155111','PUBLIC_TRANSACTION_NETWORK');need(/^0x[0-9a-f]{40}$/.test(p.to)&&p.to!==account.address&&p.to!=='0x'+'0'.repeat(40),'PUBLIC_TRANSACTION_RECIPIENT');encodeWireCommitment(p.wireKeyCommitment);return providerEvmUnsignedV1(p);
}
function bitcoinTransaction(account,p){
 exact(p,['kind','intent','previousTxHex']);need(p.kind==='PAGED_TESTNET3_P2WPKH_V1','PUBLIC_TRANSACTION_NETWORK');const expected=encodeBitcoinBinding(p.intent),own=bitcoinScriptV1(account.address,'testnet');need(p.intent.sourceScript===own&&p.intent.changeScript===own,'PUBLIC_TRANSACTION_SOURCE');const actual=providerBitcoinUnsignedHexV1(account,p);need(actual===expected,'PUBLIC_TRANSACTION_BINDING');return actual;
}
export function validatePublicPagedPreparedV1(account,prepared){
 assertPublicPagedProviderAccountV1(account);const t=prepared.transaction;assert.deepEqual(prepared.account,account);need(prepared.networkId===account.networkId&&uint(prepared.amountAtomic,128)>0n&&uint(prepared.feeAtomic,128)>0n,'PUBLIC_PREPARED_BINDING');
 if(account.chain==='ethereum'){const tx=ethereumTransaction(account,t);need(t.to===prepared.recipient.toLowerCase()&&t.value===prepared.amountAtomic&&t.wireKeyCommitment===prepared.wireKeyCommitment&&uint(t.gasLimit)>=23800n&&uint(t.gasLimit)<=100000n&&uint(t.maxPriorityFeePerGas)<=uint(t.maxFeePerGas)&&tx.maximumFeeAtomic===prepared.feeAtomic,'PUBLIC_PREPARED_BINDING');}
 else if(account.chain==='bitcoin'){bitcoinTransaction(account,t);need(t.intent.recipientScript===bitcoinScriptV1(prepared.recipient,'testnet')&&t.intent.amountSatoshi===prepared.amountAtomic&&t.intent.wireKeyCommitment===prepared.wireKeyCommitment&&t.intent.feeSatoshi===prepared.feeAtomic,'PUBLIC_PREPARED_BINDING');}
 else{exact(t,['kind','intent','lastValidBlockHeight']);need(t.kind==='PAGED_DEVNET_TRANSFER_MEMO_V1'&&t.intent.sourcePublicKey===account.publicKey,'PUBLIC_TRANSACTION_SOURCE');encodeSolanaBindingMessage(t.intent);uint(t.lastValidBlockHeight,64);need(t.intent.recipientPublicKey===decodeProviderBase58HexV1(prepared.recipient)&&t.intent.lamports===prepared.amountAtomic&&t.intent.wireKeyCommitment===prepared.wireKeyCommitment,'PUBLIC_PREPARED_BINDING');}
 return prepared;
}
export function signPublicPagedPreparedV1(account,prepared,key){
 validatePublicPagedPreparedV1(account,prepared);key32(key);assert.deepEqual(publicPagedAccountFromKeyV1(account.networkId,key),account);const t=prepared.transaction;
 const nativeWire=account.chain==='ethereum'?signProviderEvmWireV1(key,t):account.chain==='bitcoin'?signProviderBitcoinWireV1(key,account,t):signProviderSolanaMessageV1(key,encodeSolanaBindingMessage(t.intent));return validatePublicPagedSignedV1(account,prepared,nativeWire);
}
export function validatePublicPagedSignedV1(account,prepared,nativeWire){
 validatePublicPagedPreparedV1(account,prepared);need(typeof nativeWire==='string'&&nativeWire.length<=2000,'PUBLIC_SIGNED_WIRE_BOUND');let nativeId,bytes;
 if(account.chain==='ethereum'){const signed=validateProviderEvmSignatureV1(prepared.transaction,nativeWire);need(signed.sender===account.address,'PUBLIC_SIGNATURE_BINDING');nativeId=signed.id;bytes=Buffer.from(nativeWire.replace(/^0x/,''),'hex');}
 else if(account.chain==='bitcoin'){const binding=validateBitcoinBinding(nativeWire,prepared.transaction.intent),signed=validateProviderBitcoinSignatureV1(account,prepared.transaction,nativeWire);need(signed.id===binding.txid,'PUBLIC_SIGNATURE_BINDING');nativeId=binding.txid;bytes=Buffer.from(nativeWire,'hex');}
 else{const decoded=validateSolanaBindingTransaction(nativeWire,prepared.transaction.intent);nativeId=encodeProviderBase58HexV1(decoded.signatureHex);bytes=Buffer.from(nativeWire,'base64');}
 return freeze({nativeWire,nativeId,transactionSHA256:sha(bytes)});
}
