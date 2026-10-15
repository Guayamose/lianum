/** Pure public calldata/event codec. Encoding a transaction grants no right
 * to sign it or to create a PAEG/private-output acceptance. */
import assert from 'node:assert/strict';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
const exact=(v,keys)=>{assert.ok(v&&Object.getPrototypeOf(v)===Object.prototype);assert.deepEqual(Reflect.ownKeys(v).sort(),keys.slice().sort());for(const key of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(v,key),'value'),'UNISWAP_ABI_DATA_ONLY');};
const uint=(v,bits,nonzero=false)=>{assert.match(v,/^(?:0|[1-9][0-9]*)$/);const n=BigInt(v);assert.ok(n<1n<<BigInt(bits)&&(!nonzero||n>0n),'UNISWAP_ABI_UINT');return n.toString(16).padStart(64,'0');};
const addr=v=>{assert.match(v,/^0x[0-9a-f]{40}$/);assert.notEqual(v,'0x'+'0'.repeat(40));return v.slice(2).padStart(64,'0');};
export const SEPOLIA_SWAP_ROUTER02_EXACT_OUTPUT_SIGNATURE_V4='exactOutputSingle((address,address,uint24,address,uint256,uint256,uint160))';
export function encodeSepoliaSwapRouter02ExactOutputV4(input){assert.equal(arguments.length,1);exact(input,['tokenIn','tokenOut','fee','recipient','amountOut','amountInMaximum','sqrtPriceLimitX96']);assert.notEqual(input.tokenIn,input.tokenOut);
 return '0x'+publicKeccak256(Buffer.from(SEPOLIA_SWAP_ROUTER02_EXACT_OUTPUT_SIGNATURE_V4)).subarray(0,4).toString('hex')+addr(input.tokenIn)+addr(input.tokenOut)+uint(input.fee,24,true)+addr(input.recipient)+uint(input.amountOut,256,true)+uint(input.amountInMaximum,256,true)+uint(input.sqrtPriceLimitX96,160);
}
export function decodeSepoliaUniswapPoolSwapEventV4(log){assert.equal(arguments.length,1);assert.ok(log&&Array.isArray(log.topics)&&log.topics.length===3);assert.equal(log.topics[0],'0x'+publicKeccak256(Buffer.from('Swap(address,address,int256,int256,uint160,uint128,int24)')).toString('hex'),'UNISWAP_SWAP_EVENT');for(const topic of log.topics.slice(1))assert.match(topic,/^0x0{24}[0-9a-f]{40}$/);assert.match(log.data,/^0x[0-9a-f]{320}$/);
 const words=Array.from({length:5},(_,i)=>BigInt('0x'+log.data.slice(2+i*64,66+i*64))),signed=n=>n>=1n<<255n?n-(1n<<256n):n;
 assert.ok(words[2]<1n<<160n&&words[3]<1n<<128n);const tick=signed(words[4]);assert.ok(tick>=-(1n<<23n)&&tick<1n<<23n);
 return Object.freeze({sender:'0x'+log.topics[1].slice(-40),recipient:'0x'+log.topics[2].slice(-40),amount0:signed(words[0]).toString(),amount1:signed(words[1]).toString(),sqrtPriceX96:words[2].toString(),liquidity:words[3].toString(),tick:tick.toString()});
}
