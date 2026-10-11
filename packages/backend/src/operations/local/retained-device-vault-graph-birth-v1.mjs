import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { externalFlatExactV1 } from "@lianum/mobile-protocol/device/source-note-v1";
/** @typedef {{account: object, targetAccount: object, runtime: object, system: object, quorum: object,
 * router: object, deliveryObserver: object, rule: object, rulePath: object, maximumSolverInput: string, tls: object, host: string}} Ordinary
 * @typedef {Ordinary & {recoveryAuthority: object, registry: object, protocols: object}} Input
 * @typedef {{authority: object,registry: object,protocols: object}} Retained
 * @typedef {{head: object,ledger: {commitments: readonly unknown[],nullifiers: readonly unknown[]}}} View
 * @typedef {{read(): Promise<View>,assertCurrent(view: View): Promise<unknown>}} Reader
 * @typedef {{assertOwnedFlatSystem(runtime: object,system: object): unknown,
 * assertOwnedEvmGraphDeliveryObserverV1(observer: object,expected: {runtime: object,system: object,poolIndex: number}): unknown,
 * isOwnedAaveStaticGraphDeliveryObserverV1(observer: object): boolean,isOwnedUniswapGraphDeliveryObserverV1(observer: object): boolean,
 * createFlatSystemStateReader(input: {runtime: object,system: object,poolIndex: number}): Promise<Reader>,
 * createService(input: Ordinary,retained: Retained,blue: false,multi: null,aave: boolean,uniswap?: boolean): Promise<object>}} Ports */
/** @template {object} T @param {T} input @param {string[]} keys @returns {T} */
function exact(input, keys) {
  // Preserve the original detached field snapshot across awaited observations.
  return /** @type {T} */ (externalFlatExactV1(input, keys));
}
/** @param {unknown} value @param {string} code */ const need = (value, code) =>
  assert.ok(value, code);
/** Original Aave/Uniswap admission gates. Both target ledgers must be empty and
 * observed at one unchanged head before the fixed private service is born.
 * @param {Ports} ports */
export function buildRetainedDeviceVaultGraphBirthV1(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, [
    "assertOwnedFlatSystem",
    "assertOwnedEvmGraphDeliveryObserverV1",
    "isOwnedAaveStaticGraphDeliveryObserverV1",
    "isOwnedUniswapGraphDeliveryObserverV1",
    "createFlatSystemStateReader",
    "createService",
  ]);
  for (const method of Object.values(ports))
    assert.equal(typeof method, "function");
  const {
    assertOwnedFlatSystem,
    assertOwnedEvmGraphDeliveryObserverV1,
    isOwnedAaveStaticGraphDeliveryObserverV1,
    isOwnedUniswapGraphDeliveryObserverV1,
    createFlatSystemStateReader,
    createService,
  } = ports;
  /** @param {Input} input */
  async function createOriginalRetainedDeviceAaveStaticGraphServiceV1(input) {
    assert.equal(arguments.length, 1);
    const q = exact(input, [
      "account",
      "targetAccount",
      "runtime",
      "system",
      "quorum",
      "router",
      "deliveryObserver",
      "rule",
      "rulePath",
      "maximumSolverInput",
      "tls",
      "host",
      "recoveryAuthority",
      "registry",
      "protocols",
    ]);
    const { recoveryAuthority, registry, protocols, ...ordinary } = q;
    assertOwnedFlatSystem(q.runtime, q.system);
    assertOwnedEvmGraphDeliveryObserverV1(q.deliveryObserver, {
      runtime: q.runtime,
      system: q.system,
      poolIndex: 1,
    });
    need(
      isOwnedAaveStaticGraphDeliveryObserverV1(q.deliveryObserver),
      "DEVICE_EXTERNAL_GRAPH_FIXED_PROTOCOL",
    );
    /** @type {{reader: Reader, view: View}[]} */
    const views = [];
    for (const poolIndex of [0, 1]) {
      const reader = await createFlatSystemStateReader({
          runtime: q.runtime,
          system: q.system,
          poolIndex,
        }),
        view = await reader.read();
      await reader.assertCurrent(view);
      need(
        view.ledger.commitments.length === 0 &&
          view.ledger.nullifiers.length === 0,
        "DEVICE_AAVE_GRAPH_BEFORE_FUNDING",
      );
      if (views.length)
        assert.deepEqual(
          view.head,
          views[0].view.head,
          "DEVICE_AAVE_GRAPH_SAME_BEFORE_FUND_HEAD",
        );
      views.push({ reader, view });
    }
    for (const { reader, view } of views) await reader.assertCurrent(view);
    return createService(
      ordinary,
      { authority: recoveryAuthority, registry, protocols },
      false,
      null,
      true,
    );
  }
  /** @param {Input} input */
  async function createOriginalRetainedDeviceUniswapGraphServiceV1(input) {
    assert.equal(arguments.length, 1);
    const q = exact(input, [
      "account",
      "targetAccount",
      "runtime",
      "system",
      "quorum",
      "router",
      "deliveryObserver",
      "rule",
      "rulePath",
      "maximumSolverInput",
      "tls",
      "host",
      "recoveryAuthority",
      "registry",
      "protocols",
    ]);
    const { recoveryAuthority, registry, protocols, ...ordinary } = q;
    assertOwnedFlatSystem(q.runtime, q.system);
    assertOwnedEvmGraphDeliveryObserverV1(q.deliveryObserver, {
      runtime: q.runtime,
      system: q.system,
      poolIndex: 1,
    });
    need(
      isOwnedUniswapGraphDeliveryObserverV1(q.deliveryObserver),
      "DEVICE_EXTERNAL_GRAPH_FIXED_PROTOCOL",
    );
    /** @type {{reader: Reader, view: View}[]} */
    const views = [];
    for (const poolIndex of [0, 1]) {
      const reader = await createFlatSystemStateReader({
          runtime: q.runtime,
          system: q.system,
          poolIndex,
        }),
        view = await reader.read();
      await reader.assertCurrent(view);
      need(
        view.ledger.commitments.length === 0 &&
          view.ledger.nullifiers.length === 0,
        "DEVICE_UNISWAP_GRAPH_BEFORE_FUNDING",
      );
      if (views.length)
        assert.deepEqual(
          view.head,
          views[0].view.head,
          "DEVICE_UNISWAP_GRAPH_SAME_BEFORE_FUND_HEAD",
        );
      views.push({ reader, view });
    }
    for (const { reader, view } of views) await reader.assertCurrent(view);
    return createService(
      ordinary,
      { authority: recoveryAuthority, registry, protocols },
      false,
      null,
      false,
      true,
    );
  }
  return Object.freeze({
    createOriginalRetainedDeviceAaveStaticGraphServiceV1,
    createOriginalRetainedDeviceUniswapGraphServiceV1,
  });
}
