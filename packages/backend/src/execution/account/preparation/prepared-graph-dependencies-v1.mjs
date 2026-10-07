/** Deterministic graph framing before reservation or native exposure.
 * The existing proof relations remain authoritative. This rejects graphs that
 * could only fail later when their per-leg readiness proofs are constructed.
 */
import assert from 'node:assert/strict';
import {validateStruct} from '../../encoding/commitments.mjs';
import {cloneInput, frozenInput} from './readiness-inputs.mjs';

const ZERO = '0'.repeat(64);
const PREDECESSOR_BINDINGS = Object.freeze([
  ['sourceNodeCommitment', 'nodeCommitment'],
  ['sourceLocalCommitment', 'localCommitment'],
  ['sourceDispatchId', 'dispatchId'],
  ...['chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment',
    'receiptKeyCommitment', 'receiptRho'].map(key => [key, key]),
]);

export function validatePreparedGraphDependencies(input) {
  const packets = cloneInput(input);
  assert.ok(Array.isArray(packets.local) && packets.local.length === 4,
    'GRAPH_PREFLIGHT_LOCAL_SLOTS');
  assert.ok(Array.isArray(packets.dependency) && packets.dependency.length === 4,
    'GRAPH_PREFLIGHT_DEPENDENCY_SLOTS');
  const locals = packets.local.map((packet, slot) => {
    const value = validateStruct('local', packet.local.value);
    assert.equal(value.slot, String(slot), 'GRAPH_PREFLIGHT_LOCAL_SLOT');
    return value;
  });
  const activeSlots = locals.flatMap((value, slot) => value.active ? [slot] : []);
  assert.ok(activeSlots.length > 0, 'GRAPH_PREFLIGHT_EMPTY');
  const edges = [];

  for (let slot = 0; slot < 4; slot++) {
    const dependency = validateStruct('dependency', packets.dependency[slot].dependency.value);
    assert.equal(dependency.targetSlot, String(slot), 'GRAPH_PREFLIGHT_TARGET_SLOT');
    const count = Number(dependency.dependencyCount);
    if (!locals[slot].active) {
      assert.equal(count, 0, 'GRAPH_PREFLIGHT_INACTIVE_DEPENDENCIES');
    } else {
      assert.equal(dependency.targetContext, locals[slot].targetContext,
        'GRAPH_PREFLIGHT_TARGET_CONTEXT');
      assert.equal(dependency.targetJoinBlind, locals[slot].targetJoinBlind,
        'GRAPH_PREFLIGHT_TARGET_JOIN');
    }
    let previous = -1;
    for (let index = 0; index < 3; index++) {
      const predecessor = dependency.predecessors[index];
      if (index >= count) {
        for (const [key, value] of Object.entries(predecessor)) {
          assert.equal(value, key === 'sourceSlot' ? '0' : ZERO,
            'GRAPH_PREFLIGHT_EDGE_PADDING');
        }
        continue;
      }
      const source = Number(predecessor.sourceSlot);
      assert.ok(source < slot && source > previous && activeSlots.includes(source),
        'GRAPH_PREFLIGHT_DAG');
      previous = source;
      for (const [predecessorField, localField] of PREDECESSOR_BINDINGS) {
        assert.equal(predecessor[predecessorField], locals[source][localField],
          'GRAPH_PREFLIGHT_ORIGINAL_EDGE_CHANGED');
      }
      edges.push({sourceSlot: source, targetSlot: slot});
    }
  }
  return frozenInput({activeSlots, edges});
}
