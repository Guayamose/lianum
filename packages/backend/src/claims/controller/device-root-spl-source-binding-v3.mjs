import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
/** @typedef {'BORN'|'BINDING'|'READY'|'UNKNOWN'} Phase
 * @typedef {{phase: Phase, amount: string|null}} Binding
 * @typedef {{profile: string, phase: Phase, amount: string|null}} SavedBinding
 * @typedef {{claim: {claimDomain: string}}} Descriptor
 * @typedef {{descriptor: Descriptor, ownerIdentitySHA256: string, phase: string, admissions: unknown[], splSource?: SavedBinding}} ClaimRow
 * @typedef {{deposits: unknown[], tickets: unknown[], evm: unknown[], apiDeviceRootClaims: ClaimRow[]}} JournalData
 * @typedef {{transfers: readonly unknown[], bindOriginalSourceV1(token: object): Promise<unknown>, quoteOriginalDepositAmountV1(): Promise<string>}} Native
 * @typedef {{runtime: object, system: object, poolIndex: number, nativeRuntime: object, family: string, recipientIndex: number}} ExpectedProvider
 * @typedef {{readOwnedSolanaSplOriginalGraphV3(native: Native): object,
 * assertOwnedSolanaSplGraphPairV1(native: Native, graph: object): unknown,
 * assertOwnedFlatNativeProvider(provider: object, expected: ExpectedProvider): unknown,
 * captureOwnedFlatSolanaSourceForSplV1(provider: object): Promise<object>}} Ports
 * @typedef {{serial: <T>(work: () => Promise<T>, options?: {readOrReconcile: true}) => Promise<T>, alive(): void,
 * journal: {read(): Promise<JournalData>, update(transform: (data: JournalData) => JournalData): Promise<unknown>},
 * descriptor: Descriptor, ownerIdentitySHA256: string, originalNative(): Native,
 * runtime: object, claims: {flatSystem: object}, install(binding: Binding): void,
 * beforeTarget(): void, empty(): Promise<void>}} Original
 * @typedef {{profile: string, phase: Phase, amount: string|null, privateCreditEstablished: false, availablePrivateClaims: null}} Status
 */
/** Fixed original provider binding. Canonical controller composition supplies
 * these four lower ports only after checking its original intake membership.
 * @param {Ports} ports */
export function buildDeviceRootSplSourceBindingV3(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, [
    "readOwnedSolanaSplOriginalGraphV3",
    "assertOwnedSolanaSplGraphPairV1",
    "assertOwnedFlatNativeProvider",
    "captureOwnedFlatSolanaSourceForSplV1",
  ]);
  for (const method of Object.values(ports))
    assert.equal(typeof method, "function");
  const {
    readOwnedSolanaSplOriginalGraphV3,
    assertOwnedSolanaSplGraphPairV1,
    assertOwnedFlatNativeProvider,
    captureOwnedFlatSolanaSourceForSplV1,
  } = ports;
  /** @param {Original} original @param {object} provider */
  async function createDeviceRootSplSourceBindingV3(original, provider) {
    assert.equal(arguments.length, 2, "CLAIM_DEVICE_ROOT_SPL_SOURCE_ARITY");
    const { serial, alive, journal, descriptor } = original,
      native = original.originalNative(),
      graph = readOwnedSolanaSplOriginalGraphV3(native);
    const expected = {
      runtime: original.runtime,
      system: original.claims.flatSystem,
      poolIndex: 0,
      nativeRuntime: graph,
      family: "2",
      recipientIndex: 1,
    };
    let closed = false,
      closing = false,
      admitted = false;
    /** @type {Promise<{closed: boolean}>|undefined} */ let closeWork;
    /** @type {Promise<unknown>|null} */ let work = null;
    /** @type {Set<Promise<Status>>} */ const observations = new Set();
    /** @type {Binding} */ const binding = { phase: "BORN", amount: null };
    const current = () => {
      assert.ok(!closed, "CLAIM_DEVICE_ROOT_SPL_SOURCE_CLOSED");
      alive();
      assertOwnedSolanaSplGraphPairV1(native, graph);
      assertOwnedFlatNativeProvider(provider, expected);
    };
    const open = () => {
      assert.ok(!closing, "CLAIM_DEVICE_ROOT_SPL_SOURCE_CLOSED");
      current();
    };
    const row = async () => {
      const data = await journal.read(),
        r = data.apiDeviceRootClaims?.[0];
      assert.deepEqual(
        r?.descriptor,
        descriptor,
        "CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE",
      );
      assert.equal(r.ownerIdentitySHA256, original.ownerIdentitySHA256);
      return { data, r };
    };
    /** @param {Phase} phase */
    const store = async (phase) => {
      binding.phase = phase;
      await journal.update((data) => {
        const r = data.apiDeviceRootClaims?.[0];
        assert.deepEqual(
          r?.descriptor,
          descriptor,
          "CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE",
        );
        assert.equal(r.ownerIdentitySHA256, original.ownerIdentitySHA256);
        r.splSource = {
          profile: "ORIGINAL_DEVICE_ROOT_SPL_SOURCE_BINDING_V3",
          phase,
          amount: binding.amount,
        };
        return data;
      });
    };
    await serial(async () => {
      current();
      original.beforeTarget();
      const { data, r } = await row();
      assert.equal(
        data.deposits.length,
        0,
        "CLAIM_DEVICE_ROOT_BEFORE_FUND_REQUIRED",
      );
      assert.equal(
        data.tickets.length,
        0,
        "CLAIM_DEVICE_ROOT_BEFORE_FUND_REQUIRED",
      );
      assert.equal(
        data.evm.length,
        0,
        "CLAIM_DEVICE_ROOT_BEFORE_FUND_REQUIRED",
      );
      assert.equal(r.phase, "BORN", "CLAIM_DEVICE_ROOT_SPL_BEFORE_D27");
      assert.equal(r.admissions.length, 0, "CLAIM_DEVICE_ROOT_SPL_BEFORE_FUND");
      assert.equal(r.splSource, undefined, "CLAIM_DEVICE_ROOT_SPL_SOURCE_ONCE");
      assert.equal(
        native.transfers.length,
        0,
        "CLAIM_DEVICE_ROOT_SPL_BEFORE_NATIVE",
      );
      await original.empty();
      current();
      original.install(binding);
      await store("BORN");
      current();
    });
    const producer = Object.freeze({
      profile: "ORIGINAL_DEVICE_ROOT_SPL_SOURCE_BINDING_V3",
      custody: "BACKEND_LOCAL_QUORUM",
      automaticSourceDelivery: false,
      bindObservedOriginalOnce() {
        assert.equal(arguments.length, 0, "CLAIM_DEVICE_ROOT_SPL_SOURCE_ARITY");
        open();
        assert.equal(
          admitted,
          false,
          "CLAIM_DEVICE_ROOT_SPL_SOURCE_ALREADY_ADMITTED",
        );
        admitted = true;
        work = serial(async () => {
          current();
          original.beforeTarget();
          const { r } = await row();
          assert.deepEqual(
            r.splSource,
            {
              profile: "ORIGINAL_DEVICE_ROOT_SPL_SOURCE_BINDING_V3",
              phase: "BORN",
              amount: null,
            },
            "CLAIM_DEVICE_ROOT_SPL_SOURCE_CHANGED",
          );
          assert.equal(
            native.transfers.length,
            0,
            "CLAIM_DEVICE_ROOT_SPL_BEFORE_NATIVE",
          );
          await original.empty();
          current();
          // Durable UNKNOWN fence precedes capture and the original wrapping KEY.
          await store("BINDING");
          try {
            const token = await captureOwnedFlatSolanaSourceForSplV1(provider);
            current();
            await native.bindOriginalSourceV1(token);
            current();
            const amount = await native.quoteOriginalDepositAmountV1();
            current();
            assert.ok(
              typeof amount === "string" && /^[1-9][0-9]*$/.test(amount),
              "CLAIM_DEVICE_ROOT_SPL_ORIGINAL_QUOTE",
            );
            binding.amount = amount;
            await store("READY");
            current();
            return Object.freeze({
              profile: producer.profile,
              claimDomain: descriptor.claim.claimDomain,
              amount,
              sourceCustody: "BACKEND_LOCAL_QUORUM",
              privateCreditEstablished: false,
            });
          } catch (error) {
            binding.amount = null;
            try {
              await store("UNKNOWN");
            } catch {}
            throw error;
          }
        });
        work.catch(() => {});
        return work;
      },
      status() {
        assert.equal(arguments.length, 0, "CLAIM_DEVICE_ROOT_SPL_SOURCE_ARITY");
        open();
        const observation = serial(
          async () => {
            current();
            const { r } = await row();
            current();
            assert.deepEqual(
              r.splSource,
              {
                profile: producer.profile,
                phase: binding.phase,
                amount: binding.amount,
              },
              "CLAIM_DEVICE_ROOT_SPL_SOURCE_CHANGED",
            );
            return Object.freeze({
              profile: producer.profile,
              phase: binding.phase,
              amount: binding.phase === "READY" ? binding.amount : null,
              privateCreditEstablished: false,
              availablePrivateClaims: null,
            });
          },
          { readOrReconcile: true },
        );
        observations.add(observation);
        observation
          .finally(() => observations.delete(observation))
          .catch(() => {});
        return observation;
      },
      close() {
        assert.equal(arguments.length, 0, "CLAIM_DEVICE_ROOT_SPL_SOURCE_ARITY");
        closing = true;
        return (closeWork ??= (async () => {
          let first;
          try {
            if (work) await work;
          } catch (error) {
            first = error;
          }
          for (const observation of observations)
            try {
              await observation;
            } catch (error) {
              first ??= error;
            }
          closed = true;
          if (first) throw first;
          return { closed: true };
        })());
      },
      toJSON() {
        throw Error("CLAIM_DEVICE_ROOT_SPL_SOURCE_NOT_SERIALIZABLE");
      },
    });
    return producer;
  }
  return createDeviceRootSplSourceBindingV3;
}
