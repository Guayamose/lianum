import assert from 'node:assert/strict';

// A resource, filesystem or backend exception must never pass a negative
// cryptographic test. This helper only classifies this pinned Noir diagnostic.
export async function requireConstraintFailure(execute) {
  let failure;
  try { await execute(); } catch (error) { failure = error; }
  assert.equal(failure?.message, 'Cannot satisfy constraint', 'Unexpected operational errors cannot count as a constraint rejection');
  return { name: failure.name, message: failure.message };
}
