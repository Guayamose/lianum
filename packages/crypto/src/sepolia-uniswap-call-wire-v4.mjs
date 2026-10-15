/** Pure signed-wire DATA inspection. This reader grants no key, Source,
 * Original PAEG permission, proof acceptance or transaction broadcast. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {Transaction} from 'micro-eth-signer';

export function inspectSepoliaUniswapCallWireDataV4(wire,expected){
 assert.equal(arguments.length,2);assert.ok(expected&&Object.getPrototypeOf(expected)===Object.prototype);assert.deepEqual(Reflect.ownKeys(expected).sort(),['data','from','to','value']);for(const key of Reflect.ownKeys(expected))assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(expected,key),'value'));
 for(const key of ['from','to'])assert.match(expected[key],/^0x[0-9a-f]{40}$/);assert.match(expected.value,/^(0|[1-9][0-9]{0,77})$/);assert.ok(BigInt(expected.value)<1n<<256n);assert.match(expected.data,/^0x(?:[0-9a-f]{2})+$/);assert.ok(expected.data.length<=2+1024*1024*2);assert.ok(typeof wire==='string'&&/^0x02(?:[0-9a-f]{2})+$/.test(wire)&&wire.length<=2+1024*1024*2);
 const transaction=Transaction.fromHex(wire);assert.equal(transaction.type,'eip1559');assert.equal(transaction.toHex(),wire);assert.ok(transaction.verifySignature(),'SEPOLIA_UNISWAP_WIRE_SIGNATURE');assert.equal(transaction.raw.chainId,11155111n);assert.deepEqual(transaction.raw.accessList,[]);assert.equal(transaction.sender.toLowerCase(),expected.from);assert.equal(transaction.raw.to.toLowerCase(),expected.to);assert.equal(transaction.raw.value,BigInt(expected.value));assert.equal(transaction.raw.data,expected.data);
 return Object.freeze({nativeId:transaction.hash,transactionSHA256:createHash('sha256').update(Buffer.from(wire.slice(2),'hex')).digest('hex'),calldata:transaction.raw.data});
}
