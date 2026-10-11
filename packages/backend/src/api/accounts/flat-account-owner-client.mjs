/** Read-only owner-private Node/local bridge. Shared wire validation with the
 * browser; generation routes remain original, separate and non-aggregated. */
import { readFlatAccountOwnerWire } from '../transport/fixed-owner-read-transport.mjs';
import { validateFlatOwnerReadPayload } from '@lianum/mobile-protocol/wallet/owner-portfolio-contract';
const INVALID = 'FLAT_ACCOUNT_OWNER_CLIENT_RESPONSE_INVALID';
const limitations = Object.freeze({ source: 'HOST_REPORTED', chainVerifiedByClient: false,
  proofsVerifiedByClient: false, nativeSelfCustodyEstablished: false, crossAssetTotalsProvided: false });
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const outcome = (data, errorCode, httpStatus, payloadKind = null) => frozen({ readStatus: data === null ? 'UNAVAILABLE' : 'RECEIVED',
  scope: 'FLAT_ACCOUNT_OWNER_PRIVATE', payloadKind, data, errorCode, httpStatus, limitations });

/** Exactly { origin, token } from this flat transport's existing ownerAccess.
 * This is a single host-reported private read, never a client proof/chain audit. */
export async function readFlatAccountOwnerPortfolio(input) {
  if (arguments.length !== 1) throw Object.assign(new Error('FLAT_ACCOUNT_OWNER_CLIENT_ACCESS_INVALID'), { code: 'FLAT_ACCOUNT_OWNER_CLIENT_ACCESS_INVALID' });
  const result = await readFlatAccountOwnerWire(input);
  if (result.errorCode) return outcome(null, result.errorCode, result.httpStatus);
  try {
    const { data, payloadKind } = validateFlatOwnerReadPayload(result.body);
    return outcome(data, null, result.httpStatus, payloadKind);
  } catch { return outcome(null, INVALID, result.httpStatus); }
}
