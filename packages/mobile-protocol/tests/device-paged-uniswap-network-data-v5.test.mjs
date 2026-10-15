/** Pure network presentation DATA; no Source/quote/permission or TLS is issued. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertDevicePagedPublicNetworkIdDataV4 as network} from '../src/device-paged-budget-asset-v4.mjs';
test('PUBLIC UNI has the explicit Sepolia network while original native families and rejected mappings stay exact',()=>{
 for(const [family,id] of [['EVM','ethereum-sepolia'],['BTC','bitcoin-testnet'],['SOL','solana-devnet'],['UNISWAP','ethereum-sepolia']])assert.equal(network(id,family),id);
 for(const [family,id] of [['UNISWAP','ethereum-mainnet'],['UNISWAP','bitcoin-testnet'],['BTC','ethereum-sepolia'],['SOL','ethereum-sepolia'],['UNISWAP_PUBLIC_V4','ethereum-sepolia'],['AAVE','ethereum-sepolia']])assert.throws(()=>network(id,family),/MOBILE_PAGED_BUDGET_ASSET/);
});
