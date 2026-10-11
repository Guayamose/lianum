/** One physical read queue and private quiescence family per composition. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { frozenInput as freeze } from "@lianum/components/plain-input";
/** @typedef {{ nativeRuntime: object, profile: Record<string, unknown>, readNativeStateV4(): Record<string, unknown> }} Entry */
/** @typedef {{ entries: Entry[], live(): void }} Owner */
/** @typedef {{ identity: number, generation: bigint, pending: number, active: number, holder: object | null, tail: Promise<void> }} Queue */
/** @typedef {{ owner: Owner, queues: Array<{queue: Queue, generation: bigint, release(): void}>, released: boolean }} Lease */
/** @param {{ profileCommitment(profile: Record<string, unknown>): string }} ports */
export function createGraphNativeQueuesV4(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, ["profileCommitment"]);
  const { profileCommitment } = ports;
  assert.equal(typeof profileCommitment, "function");
  /** @type {WeakMap<object, Queue>} */
  const graphNativeQueuesV4 = new WeakMap();
  /** @type {WeakMap<object, Lease>} */
  const graphQuiescenceV4 = new WeakMap();
  let graphQueueSequenceV4 = 0;
  /** @param {Entry} entry @returns {Queue} */
  function graphQueueV4(entry) {
    let queue = graphNativeQueuesV4.get(entry.nativeRuntime);
    if (!queue) {
      queue = {
        identity: graphQueueSequenceV4++,
        generation: 0n,
        pending: 0,
        active: 0,
        holder: null,
        tail: Promise.resolve(),
      };
      graphNativeQueuesV4.set(entry.nativeRuntime, queue);
    }
    return queue;
  }
  /** @template T @param {Entry} entry @param {() => T | Promise<T>} read */
  function graphReadV4(entry, read) {
    const queue = graphQueueV4(entry);
    assert.ok(queue.pending < 16, "WRAPPED_GRAPH_NATIVE_QUEUE_FULL");
    queue.pending++;
    const result = queue.tail
      .then(async () => {
        assert.equal(
          queue.holder,
          null,
          "WRAPPED_GRAPH_NATIVE_QUIESCENCE_HELD",
        );
        queue.active++;
        queue.generation++;
        try {
          return await read();
        } finally {
          queue.active--;
        }
      })
      .finally(() => {
        queue.pending--;
      });
    queue.tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  /** @param {Owner} owner @param {object} token */
  function assertGraphQuiescenceV4(owner, token) {
    const state = graphQuiescenceV4.get(token);
    assert.ok(
      state && state.owner === owner,
      "WRAPPED_GRAPH_PRIVATE_QUIESCENCE_REQUIRED",
    );
    owner.live();
    for (const { queue, generation } of state.queues) {
      assert.equal(queue.active, 0, "WRAPPED_GRAPH_NATIVE_NOT_IDLE");
      assert.equal(
        queue.generation,
        generation,
        "WRAPPED_GRAPH_NATIVE_QUEUE_GENERATION_CHANGED",
      );
      assert.equal(
        queue.holder,
        state.released ? null : token,
        "WRAPPED_GRAPH_NATIVE_QUIESCENCE_CHANGED",
      );
    }
  }
  /** @param {Owner} owner @param {object} token */
  function releaseGraphQuiescenceV4(owner, token) {
    const state = graphQuiescenceV4.get(token);
    assert.ok(
      state && state.owner === owner,
      "WRAPPED_GRAPH_PRIVATE_QUIESCENCE_REQUIRED",
    );
    if (state.released) return;
    state.released = true;
    for (const { queue, release } of state.queues) {
      assert.equal(
        queue.holder,
        token,
        "WRAPPED_GRAPH_NATIVE_QUIESCENCE_CHANGED",
      );
      queue.holder = null;
      release();
    }
  }
  /** @param {Owner} owner */
  async function quiesceGraphNativeV4(owner) {
    owner.live();
    const token = Object.freeze(Object.create(null));
    /** @type {Lease} */
    const state = { owner, queues: [], released: false };
    graphQuiescenceV4.set(token, state);
    const queues = [...new Set(owner.entries.map(graphQueueV4))].sort(
      (a, b) => a.identity - b.identity,
    );
    try {
      for (const queue of queues) {
        assert.ok(queue.pending < 16, "WRAPPED_GRAPH_NATIVE_QUEUE_FULL");
        queue.pending++;
        /** @type {PromiseWithResolvers<void>} */
        const hold = Promise.withResolvers();
        const { promise: held, resolve: release } = hold;
        const acquired = queue.tail.then(() => {
          assert.equal(queue.active, 0, "WRAPPED_GRAPH_NATIVE_NOT_IDLE");
          assert.equal(
            queue.holder,
            null,
            "WRAPPED_GRAPH_NATIVE_QUIESCENCE_CONFLICT",
          );
          queue.holder = token;
          queue.generation++;
          state.queues.push({ queue, generation: queue.generation, release });
        });
        queue.tail = acquired
          .then(() => held)
          .finally(() => {
            queue.pending--;
          })
          .then(
            () => {},
            () => {},
          );
        await acquired;
      }
      assertGraphQuiescenceV4(owner, token);
      return token;
    } catch (cause) {
      releaseGraphQuiescenceV4(owner, token);
      throw cause;
    }
  }
  /** @param {Owner} owner */
  function graphNativeStateV4(owner) {
    owner.live();
    return freeze(
      owner.entries.map((entry) => ({
        profileCommitment: profileCommitment(entry.profile),
        state: entry.readNativeStateV4(),
      })),
    );
  }
  return Object.freeze({
    graphReadV4,
    graphNativeStateV4,
    quiesceGraphNativeV4,
    assertGraphQuiescenceV4,
    releaseGraphQuiescenceV4,
  });
}
