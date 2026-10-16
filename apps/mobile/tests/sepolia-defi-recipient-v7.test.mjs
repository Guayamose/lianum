import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveNativeAccountsV1} from '@lianum/crypto/native-wallet-v1';
import {readSepoliaDefiWalletRecipientV7,normalizeSepoliaDefiRecipientV7} from '../src/native-wallet/sepolia-defi-recipient-v7.ts';
test('Sepolia destination reads only the public Ethereum account and never falls back to Bitcoin or Solana',async()=>{
  const entropy=new Uint8Array(32).fill(1),mainnet=deriveNativeAccountsV1(entropy,'mainnet'),testnet=deriveNativeAccountsV1(entropy,'testnet');entropy.fill(0);
  let reads=0;const signal=new AbortController().signal,port={readState:async()=>{reads++;return{status:'READY',accounts:mainnet};}};
  const address=await readSepoliaDefiWalletRecipientV7(port,signal);assert.equal(address,mainnet[0].address.toLowerCase());assert.equal(address,testnet[0].address.toLowerCase(),'Ethereum path is the same on both networks; their balances remain separate');assert.equal(reads,1);
  assert.equal(await readSepoliaDefiWalletRecipientV7({readState:async()=>({status:'READY',accounts:mainnet.filter(a=>a.chain!=='ethereum')})},signal),null);
  assert.equal(await readSepoliaDefiWalletRecipientV7({readState:async()=>({status:'ABSENT',accounts:[]})},signal),null);
  await assert.rejects(readSepoliaDefiWalletRecipientV7({readState:async()=>({status:'READY',accounts:[{...mainnet[1],chain:'ethereum'}]})},signal));
  await assert.rejects(readSepoliaDefiWalletRecipientV7({readState:async()=>({status:'READY',accounts:[mainnet[0],testnet[0]]})},signal));
  assert.throws(()=>normalizeSepoliaDefiRecipientV7('0x'+'0'.repeat(40)));assert.throws(()=>normalizeSepoliaDefiRecipientV7(mainnet[1].address));
  const aborted=new AbortController();aborted.abort();await assert.rejects(readSepoliaDefiWalletRecipientV7(port,aborted.signal));assert.equal(reads,1,'an aborted read does not inspect metadata');
});
