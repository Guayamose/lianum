/** Narrow public-byte inspection and pure conservation checks. These helpers
 * never create an observation brand, signature, proof, transport or authority. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FLAT_TRANSACTION_METHODS, encodeFlatTransaction } from '../wallet-platform/modules/paeg/transaction-codec.mjs';
import { decodeStatement, joinReadiness } from '../wallet-platform/modules/paeg/statements.mjs';
import { decodeNativeValueAdmissionStatement, joinNativeValueAdmission } from '../wallet-platform/modules/paeg/native-value-statements-v2.mjs';
export const nativeWalletHash = bytes => createHash('sha256').update(bytes).digest('hex');
const LIMIT = 1024 * 1024;
/** Strict fixed admit ABI only, canonical roundtrip required. Not an RPC API. */
export function decodeNativeWalletAdmissionCalldata(calldata) {
  assert.ok(typeof calldata === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(calldata)
    && calldata.length <= 2 * LIMIT, 'NATIVE_WALLET_ADMISSION_CALLDATA');
  assert.equal(calldata.slice(2,10), FLAT_TRANSACTION_METHODS.admit.selector, 'NATIVE_WALLET_ADMISSION_SELECTOR');
  const body = calldata.slice(10);
  const word = at => { assert.ok(Number.isSafeInteger(at) && at >= 0 && at % 32 === 0 && (at+32)*2 <= body.length,
    'NATIVE_WALLET_ADMISSION_ABI_BOUNDS'); return body.slice(at*2,(at+32)*2); };
  const integer = at => BigInt('0x'+word(at));
  const offset = at => { const n=integer(at); assert.ok(n<=BigInt(LIMIT),'NATIVE_WALLET_ADMISSION_ABI_BOUNDS'); return Number(n); };
  function packet(at,count) {
    assert.equal(offset(at),64,'NATIVE_WALLET_ADMISSION_PROOF_OFFSET');
    const length=offset(at+64); assert.ok(length>0&&length%32===0,'NATIVE_WALLET_ADMISSION_PROOF_LENGTH');
    assert.equal(offset(at+32),96+length,'NATIVE_WALLET_ADMISSION_INPUT_OFFSET');
    const inputsAt=at+96+length; assert.equal(offset(inputsAt),count,'NATIVE_WALLET_ADMISSION_INPUT_COUNT');
    const publicInputs=Array.from({length:count},(_,i)=>integer(inputsAt+32+i*32).toString());
    return {packet:{proof:body.slice((at+96)*2,(at+96+length)*2),publicInputs},end:inputsAt+32+count*32};
  }
  assert.equal(word(0).slice(0,24),'0'.repeat(24),'NATIVE_WALLET_ADMISSION_ADDRESS_PADDING');
  let cursor=576; const packets=[];
  for(const [i,count] of [42,50,84].entries()) {
    assert.equal(offset(32+i*32),cursor,'NATIVE_WALLET_ADMISSION_TUPLE_ORDER');
    const p=packet(cursor,count); packets.push(p.packet); cursor=p.end;
  }
  assert.equal(body.length,cursor*2,'NATIVE_WALLET_ADMISSION_TRAILING_DATA');
  const request={pool:'0x'+word(0).slice(24),dependency:packets[0],readiness:packets[1],admission:packets[2],
    healthFrom:integer(128).toString(),healthUntil:integer(160).toString(),
    healthSignatures:Array.from({length:3},(_,i)=>({signerIndex:integer(192+i*128).toString(),v:integer(224+i*128).toString(),
      r:'0x'+word(256+i*128),s:'0x'+word(288+i*128)}))};
  assert.equal(encodeFlatTransaction('admit',request),calldata,'NATIVE_WALLET_ADMISSION_NONCANONICAL');
  const dependency=decodeStatement('dependency',request.dependency.publicInputs),ready=decodeStatement('ready',request.readiness.publicInputs),
    admission=decodeNativeValueAdmissionStatement(request.admission.publicInputs);
  joinReadiness(dependency,ready); joinNativeValueAdmission(dependency,ready,admission);
  return {request,dependency,ready,admission};
}
/** Trusted caller supplies freshly authenticated observations; this pure helper
 * alone supplies no such assurance. Amounts are exact integer atomic units. */
export function assertNativeWalletConservation(v) {
  const n=k=>{assert.match(v[k],/^(0|[1-9][0-9]*)$/);return BigInt(v[k]);};
  assert.equal(n('sourceDeposit'),n('sourceChange')+n('solverPayout'),'NATIVE_WALLET_SOURCE_CONSERVATION');
  assert.equal(n('sourcePoolBacked'),0n); assert.equal(n('sourcePoolActual'),0n); assert.equal(v.liveReservations,0);
  assert.equal(n('nativeRecipientAfter')-n('nativeRecipientBefore'),n('nativeValue'),'NATIVE_WALLET_NATIVE_DELTA');
  assert.equal(n('nativeSenderBefore')-n('nativeSenderAfter'),n('nativeValue')+n('nativeGasUsed')*n('nativeGasPrice'),
    'NATIVE_WALLET_NATIVE_SOLVER_GAS_CONSERVATION');
  return true;
}
