import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resourcePath} from '@lianum/environment';
import {initializePrivateVerifierCRS,PRIVATE_VERIFIER_CRS} from '@lianum/components/resources/private-verifier-crs';

const generator = () => ({x:Uint8Array.from([...Array(31).fill(0),1]),y:Uint8Array.from([...Array(31).fill(0),2])});
const g2 = () => readFileSync(resourcePath('engine','experiments/private-core-proof/native-notes/.local/crs/2097152/bn254_g2.dat'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const errorCode = code => error => error?.name === 'AssertionError' && error.message.split('\n',1)[0] === code;

test('verifier CRS is exactly the pinned uncompressed generator and original G2',async()=>{
  const original=generator(), originalG2=g2();let calls=0, passed;
  const result=await initializePrivateVerifierCRS({async srsInitSrs(value){calls++;passed=value;
    assert.equal(value.numPoints,1);assert.equal(value.pointsBuf.length,64);assert.equal(value.g2Point.length,128);
    assert.equal(hash(value.pointsBuf),PRIVATE_VERIFIER_CRS.g1SHA256);assert.equal(hash(value.g2Point),PRIVATE_VERIFIER_CRS.g2SHA256);
  }},original,originalG2);
  assert.equal(calls,1);assert.equal(result,PRIVATE_VERIFIER_CRS);assert.ok(Object.isFrozen(result));
  assert.throws(()=>{result.numPoints=0;},TypeError);assert.throws(()=>{result.g1SHA256='0'.repeat(64);},TypeError);
  assert.ok(passed.pointsBuf.every(v=>v===0));assert.ok(passed.g2Point.every(v=>v===0));
  assert.equal(original.x[31],1);assert.equal(original.y[31],2);assert.equal(hash(originalG2),result.g2SHA256);
});

test('malformed, compressed, zero and wrong-pin G1 cannot initialize a verifier',async()=>{
  let calls=0;const api={async srsInitSrs(){calls++;}};
  for(const [candidate,code]of [
    [undefined,'PC18_VERIFIER_G1_BYTES'],[{x:[],y:[]},'PC18_VERIFIER_G1_BYTES'],
    [{x:new Uint8Array(0),y:new Uint8Array(0)},'PC18_VERIFIER_G1_SIZE'],
    [{x:generator().x,y:new Uint8Array(0)},'PC18_VERIFIER_G1_SIZE'],
    [{x:new Uint8Array(32),y:new Uint8Array(32)},'PC18_VERIFIER_G1_PIN'],
    [{x:generator().x,y:Uint8Array.from([...Array(31).fill(0),3])},'PC18_VERIFIER_G1_PIN'],
  ])await assert.rejects(initializePrivateVerifierCRS(api,candidate,g2()),errorCode(code));
  assert.equal(calls,0);
});

test('malformed, truncated, enlarged and wrong-pin G2 cannot initialize a verifier',async()=>{
  let calls=0;const api={async srsInitSrs(){calls++;}},changed=g2();changed[127]^=1;
  for(const [candidate,code]of [[[],'PC18_VERIFIER_G2_BYTES'],[new Uint8Array(0),'PC18_VERIFIER_G2_SIZE'],
    [g2().subarray(0,127),'PC18_VERIFIER_G2_SIZE'],[Buffer.concat([g2(),Buffer.alloc(1)]),'PC18_VERIFIER_G2_SIZE'],
    [changed,'PC18_VERIFIER_G2_PIN'],[new Uint8Array(128),'PC18_VERIFIER_G2_PIN']])
    await assert.rejects(initializePrivateVerifierCRS(api,generator(),candidate),errorCode(code));
  assert.equal(calls,0);
});

test('backend failure propagates without fallback and clears copied public CRS buffers',async()=>{
  const failure=new Error('TEST_BACKEND_FAILURE');let calls=0,passed;
  await assert.rejects(initializePrivateVerifierCRS({async srsInitSrs(value){calls++;passed=value;throw failure;}},generator(),g2()),error=>error===failure);
  assert.equal(calls,1);assert.ok(passed.pointsBuf.every(v=>v===0));assert.ok(passed.g2Point.every(v=>v===0));
});
