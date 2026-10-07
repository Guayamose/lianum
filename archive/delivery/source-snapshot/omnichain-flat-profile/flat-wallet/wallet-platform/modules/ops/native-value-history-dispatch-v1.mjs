/** Fixed history-token routing. Original operators remain the only issuers;
 * no metadata, callback, supplied clock or retained data can mint a token. */
import * as Original from './native-value-operators-v4.mjs';
import * as Wrapped from './wrapped-claim-graph-operators-v1.mjs';
export function nativeValueRetainedSourceClock(token, expected) {
  return Wrapped.isWrappedClaimSourceHistoryV1(token)
    ? Wrapped.wrappedClaimRetainedSourceClockV1(token, expected)
    : Original.nativeValueRetainedSourceClock(token, expected);
}
export function nativeValueRetainedSourceHistory(token, expected) {
  return Wrapped.isWrappedClaimSourceHistoryV1(token)
    ? Wrapped.wrappedClaimRetainedSourceHistoryV1(token, expected)
    : Original.nativeValueRetainedSourceHistory(token, expected);
}
