import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = new URL('../src/wallet/client/', import.meta.url);
const expectedEntries = {
  'actions/catalog.mjs': ['WALLET_PROFILE', 'ACTIONS', 'DEFI_PROFILE', 'DEFI_ACTIONS', 'ACCOUNT_ACTIONS', 'ALL_ACTIONS'],
  'validation/native-identity.mjs': ['NATIVE_IDENTITY_PROFILE', 'WRAPPED_CLAIM_IDENTITY_PROFILE', 'originalNativeIdentity'],
  'actions/account-context.mjs': ['accountAssetChoices', 'accountActionContext'],
  'presentation/account-review.mjs': ['accountReviewDetails'],
  'presentation/native-review.mjs': ['nativeIdentityDetails', 'nativeAmountDetails', 'displayUnits'],
  'validation/values.mjs': ['atomic'],
  'validation/wallet-state.mjs': ['validateWalletState'],
  'presentation/wallet-state.mjs': ['projectWalletState'],
  'actions/rules.mjs': ['buildActionBody', 'actionAvailability'],
  'presentation/action-review.mjs': ['actionReview'],
  'session.mjs': ['createWalletClient'],
};

test('the compatibility API reexports the focused implementation bindings without widening the old API', async () => {
  const facade = await import(new URL('view-model.mjs', root));
  assert.deepEqual(Object.keys(facade).sort(), Object.values(expectedEntries).flat().sort());
  for (const [path, names] of Object.entries(expectedEntries)) {
    const implementation = await import(new URL(path, root));
    for (const name of names) assert.equal(facade[name], implementation[name], path + ':' + name);
  }
});

test('wallet client layers remain acyclic and pure layers cannot depend on session or transport', async () => {
  const paths = (await readdir(root, { recursive: true })).filter(path => path.endsWith('.mjs'));
  const graph = new Map();
  const rootPath = fileURLToPath(root);
  for (const path of paths) {
    const source = await readFile(new URL(path, root), 'utf8');
    assert.doesNotMatch(source, /\bimport\s*\(/, path + ': dynamic imports hide architecture dependencies');
    const dependencies = [...source.matchAll(/\b(?:import|export)\s+[^;]*?\bfrom\s+['"]([^'"]+)['"]/g)]
      .map(match => match[1]);
    const children = [];
    for (const specifier of dependencies) {
      assert.ok(specifier.startsWith('.'), path + ': browser module must use a local explicit import');
      const destination = fileURLToPath(new URL(specifier, new URL(path, root)));
      if (!destination.startsWith(rootPath)) continue;
      const child = destination.slice(rootPath.length);
      children.push(child);
      assert.ok(paths.includes(child), path + ': missing module ' + child);
      if (path !== 'view-model.mjs') assert.notEqual(child, 'view-model.mjs', path + ': import focused implementation directly');
      if (/^(actions|validation|presentation)\//.test(path)) {
        assert.notEqual(child, 'session.mjs', path + ': pure code must not own session state');
        assert.ok(!child.startsWith('transport/'), path + ': pure code must not perform HTTP');
      }
      if (path.startsWith('validation/')) assert.ok(child.startsWith('validation/') || child === 'actions/catalog.mjs',
        path + ': contracts must not depend on presentation or action orchestration');
      if (path.startsWith('actions/')) assert.ok(child.startsWith('actions/') || child.startsWith('validation/'),
        path + ': action rules must not depend on presentation');
      if (path.startsWith('transport/')) assert.fail(path + ': HTTP transport must not depend on wallet policy');
    }
    graph.set(path, children);
  }
  const finished = new Set();
  function visit(path, stack = []) {
    assert.ok(!stack.includes(path), 'wallet dependency cycle: ' + [...stack, path].join(' -> '));
    if (finished.has(path)) return;
    for (const child of graph.get(path)) visit(child, [...stack, path]);
    finished.add(path);
  }
  for (const path of paths) visit(path);
});
