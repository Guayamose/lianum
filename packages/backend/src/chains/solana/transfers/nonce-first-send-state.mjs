/** Read-only retained-wire check. The runtime privately binds its original
 * codecs; this checker holds no keys and cannot authorize or send a transaction. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { cloneInput } from "@lianum/components/plain-input";

/** @typedef {{route:string,phase:string,broadcastAttempts:number,signingUnresolved:boolean,
 * nativeId:string,transactionSHA256:string,nativeWire:string,intent:unknown,unsignedWire:string}} FirstSendState */
/** @param {{decode(wire:string,intent:unknown):{signatureHex:string,transactionSHA256:string},
 * encode(intent:unknown):string}} codecs */
export function createNonceFirstSendStateCheck(codecs) {
  assert.equal(arguments.length, 1);
  exactRecord(codecs, ["decode", "encode"]);
  const { decode, encode } = codecs;
  assert.equal(typeof decode, "function");
  assert.equal(typeof encode, "function");
  /** @param {unknown} raw */
  return function assertNonceFirstSendState(raw) {
    const cloned = cloneInput(raw);
    exactRecord(cloned, [
      "route",
      "phase",
      "broadcastAttempts",
      "signingUnresolved",
      "nativeId",
      "transactionSHA256",
      "nativeWire",
      "intent",
      "unsignedWire",
    ]);
    const value = /** @type {FirstSendState} */ (cloned);
    requireCondition(
      ["deposit", "refund", "redeem"].includes(value.route),
      "SOLANA_NONCE_CUSTODY_ROUTE_REQUIRED",
    );
    requireCondition(
      value.phase === "SIGNED_NOT_BROADCAST" && value.broadcastAttempts === 0,
      "SOLANA_NONCE_FIRST_SEND_ONLY",
    );
    requireCondition(
      value.signingUnresolved === false,
      "SOLANA_PRIOR_SIGNING_UNRESOLVED",
    );
    const decoded = decode(value.nativeWire, value.intent);
    requireCondition(
      decoded.signatureHex === value.nativeId &&
        decoded.transactionSHA256 === value.transactionSHA256,
      "SOLANA_RETAINED_WIRE_IDENTITY",
    );
    requireCondition(
      encode(value.intent) === value.unsignedWire,
      "SOLANA_RETAINED_WIRE_CHANGED",
    );
  };
}

/** @param {unknown} condition @param {string} code */
function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}
