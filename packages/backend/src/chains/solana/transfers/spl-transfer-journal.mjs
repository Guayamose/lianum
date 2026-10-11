/** The original SPL durable first-send latch and detached public snapshots.
 * Only the owned validator binds these ports. Keys, preparation ownership,
 * claim authority and the original transfer Map remain in that validator. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { cloneInput, frozenInput } from "@lianum/components/plain-input";

/** @typedef {{nativeId:string,nativeWire:string,signature:string,phase:string,
 * broadcastAttempts:number,broadcastFailure?:string}} SplSendRecord */
/** @template {SplSendRecord} R @template P
 * @param {{
 * persistTransfer(record:R):Promise<unknown>,
 * persistState():Promise<unknown>,
 * sendOnce(wire:string):Promise<string>,
 * assertLive():void,
 * assertPreparation(prepared:P|null):unknown,
 * readTransfers():Iterable<R>
 * }} ports */
export function createSplTransferJournal(ports) {
  assert.equal(arguments.length, 1);
  const fields = [
    "persistTransfer",
    "persistState",
    "sendOnce",
    "assertLive",
    "assertPreparation",
    "readTransfers",
  ];
  exactRecord(ports, fields);
  for (const key of fields) {
    assert.equal(
      typeof ports[/** @type {keyof typeof ports} */ (key)],
      "function",
    );
  }
  const {
    persistTransfer,
    persistState,
    sendOnce,
    assertLive,
    assertPreparation,
    readTransfers,
  } = ports;

  function snapshot() {
    return frozenInput(cloneInput([...readTransfers()]));
  }

  /** @param {R} record
   * @param {{beforeSend(prepared:P|null):Promise<unknown>,
   * assertBeforeSend(prepared:P|null):void}|null} [authority]
   * @param {P|null} [prepared] */
  async function latchAndSend(record, authority = null, prepared = null) {
    assert.equal(record.phase, "SIGNED_NOT_BROADCAST");
    assert.equal(record.broadcastAttempts, 0);
    // An expired original preparation admits no broadcast. Final authority
    // guards still run after durable admission and immediately before send.
    if (prepared !== null) assertPreparation(prepared);
    record.phase = "BROADCAST_UNKNOWN";
    record.broadcastAttempts = 1;
    await persistTransfer(record);
    await persistState();
    if (authority) {
      await authority.beforeSend(prepared);
      authority.assertBeforeSend(prepared);
      assertPreparation(prepared);
    }
    assertLive();
    try {
      assert.equal(await sendOnce(record.nativeWire), record.signature);
      record.phase = "BROADCAST";
      await persistTransfer(record);
      await persistState();
    } catch (cause) {
      record.broadcastFailure = "SPL_ORIGINAL_SEND_REPLY_UNAVAILABLE";
      await persistState();
      const error = /** @type {Error & {nativeId?:string}} */ (
        new Error("SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE", { cause })
      );
      error.nativeId = record.nativeId;
      throw error;
    }
  }

  return Object.freeze({ snapshot, latchAndSend });
}
