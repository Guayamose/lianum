import assert from "node:assert/strict";
import { types } from "node:util";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { externalFlatExactV1 as exact } from "@lianum/mobile-protocol/device/source-note-v1";
/** @typedef {{slot: string, identity: object, stateSHA256: string}} Descriptor
 * @typedef {{schema: string, confirmed: unknown, candidate: unknown}} RetainedPart
 * @typedef {{readWrappedPrivateLifetimePartV1(runtime: object, slot: string, identity: object): Promise<{privateState: RetainedPart, handle: object}>,
 * assertWrappedPrivateLifetimePartSealedV1(handle: object): unknown, sha(value: unknown): string}} Ports */
/** Private part tokens and original checkpoint admission. A standalone family
 * cannot consume canonical graph tokens. @param {Ports} ports */
export function buildDeviceGraphRecoveryPartsV1(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, [
    "readWrappedPrivateLifetimePartV1",
    "assertWrappedPrivateLifetimePartSealedV1",
    "sha",
  ]);
  for (const method of Object.values(ports))
    assert.equal(typeof method, "function");
  const {
    readWrappedPrivateLifetimePartV1,
    assertWrappedPrivateLifetimePartSealedV1,
    sha,
  } = ports;
  /** @type {WeakMap<object,{kind:string,value:unknown}>} */ const recoveryParts =
    new WeakMap();
  /** @type {(value: unknown, code: string) => asserts value} */ const need = (
    value,
    code,
  ) => assert.ok(value, code);
  /** @param {string} kind @param {unknown} value */
  function part(kind, value) {
    const token = Object.freeze(Object.create(null));
    recoveryParts.set(token, { kind, value });
    return token;
  }
  /** @param {object} token @param {string} kind */
  function consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(token, kind) {
    assert.equal(arguments.length, 2);
    need(!types.isProxy(token), "DEVICE_EXTERNAL_GRAPH_RECOVERY_PART");
    const r = recoveryParts.get(token);
    need(r && r.kind === kind, "DEVICE_EXTERNAL_GRAPH_RECOVERY_PART");
    recoveryParts.delete(token);
    return r.value;
  }
  /** @param {object} runtime @param {Descriptor} descriptor @param {string} schema */
  async function checkedPart(runtime, descriptor, schema) {
    exact(descriptor, ["slot", "identity", "stateSHA256"]);
    const row = await readWrappedPrivateLifetimePartV1(
      runtime,
      descriptor.slot,
      descriptor.identity,
    );
    assertWrappedPrivateLifetimePartSealedV1(row.handle);
    need(
      sha(row.privateState) === descriptor.stateSHA256,
      "DEVICE_EXTERNAL_GRAPH_ORIGINAL_PRIVATE_CHECKPOINT",
    );
    exact(row.privateState, ["schema", "confirmed", "candidate"]);
    need(
      row.privateState.schema === schema && row.privateState.candidate === null,
      "DEVICE_EXTERNAL_GRAPH_PENDING_REOPEN_DENIED",
    );
    return row.privateState.confirmed;
  }
  return Object.freeze({
    part,
    consumeOriginalDeviceExternalFlatGraphRecoveryPartV1,
    checkedPart,
  });
}
