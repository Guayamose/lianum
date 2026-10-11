/** Narrow public-byte inspection and pure conservation checks. These helpers
 * never create an observation brand, signature, proof, transport or authority. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { FLAT_TRANSACTION_METHODS, encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { decodeStatement, joinReadiness } from '@lianum/components/encoding/statements';
import { decodeNativeValueAdmissionStatement, joinNativeValueAdmission } from '@lianum/components/encoding/native-value-statements-v2';
export const nativeWalletHash = bytes => createHash('sha256').update(bytes).digest('hex');
const LIMIT = 1024 * 1024;
/** Strict fixed admit ABI only, canonical roundtrip required. Not an RPC API. */
export {decodeNativeWalletAdmissionCalldata} from '../../../../packages/backend/src/execution/encoding/native-wallet-admission-calldata.mjs';
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
