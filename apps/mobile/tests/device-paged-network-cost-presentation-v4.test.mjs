/** Presentation DATA only; no issuer, RPC, proof or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {devicePagedNativeCostPresentationDataV4} from '../src/screens/device-paged-economic-operation-display-v4.mjs';
const chainDomain='a'.repeat(64),asset='b'.repeat(64);
const native=(family='EVM',unit='wei')=>({family,chainDomain,fee:{status:'OBSERVED',asset,unit,amount:'600'}});
const config=(family,networkId,domain=chainDomain)=>({networks:[{family,networkId,chainDomain:domain,label:'Wrong local label must not identify a public network'}]});

test('native cost network labels use the exact configured networkId and matching domain, never family or address prefix',()=>{
 for(const [family,id,label,unit]of [['EVM','ethereum-sepolia','Ethereum · Sepolia','wei'],['BTC','bitcoin-testnet','Bitcoin · testnet','satoshi'],['SOL','solana-devnet','Solana · devnet','lamport']]){
  const row=native(family,unit);assert.equal(devicePagedNativeCostPresentationDataV4(row,config(family,id)).network,label);
  for(const wrong of [null,config(family,id,'c'.repeat(64)),config(family,'invented-testnet'),config('UNISWAP',id),{networks:[{family,chainDomain,label:'Bitcoin regtest'}]}])assert.equal(devicePagedNativeCostPresentationDataV4(row,wrong).network,label.split(' · ')[0]);
  const ambiguous=config(family,id);ambiguous.networks.push({...ambiguous.networks[0],networkId:'another-network'});assert.equal(devicePagedNativeCostPresentationDataV4(row,ambiguous).network,label.split(' · ')[0]);
 }
 assert.equal(devicePagedNativeCostPresentationDataV4({...native('BTC','satoshi'),destination:'tb1q-prefix-data'},null).network,'Bitcoin');
 assert.equal(devicePagedNativeCostPresentationDataV4(native('UNISWAP'),config('UNISWAP','ethereum-sepolia')).network,'Uniswap');
});

test('atomic cost stays 600 wei; missing or conflicting units cannot be rendered as 600 ETH',()=>{
 assert.equal(devicePagedNativeCostPresentationDataV4(native(),null).fee,'600 wei · activo '+asset.slice(0,12)+'…');
 for(const fee of [{...native().fee,unit:'ETH'},{...native().fee,status:'UNKNOWN',amount:null},{...native().fee,amount:'6e2'},{...native().fee,amount:'0.0006'},{...native().fee,asset:'ETH'}])assert.equal(devicePagedNativeCostPresentationDataV4({...native(),fee},null).fee,'sin dato confirmado');
});
