/** Retained public artifacts only; never compile, prove or start a chain. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sourcePath } from '@lianum/environment';
import { inspectRetainedNodeArtifactsForPreparationV1 as inspect } from '../../src/tooling/retained-node-artifacts-v1.mjs';
import { NODE_PINS } from '../../src/catalog.mjs';

test('preparation authenticates the genuine N32 evidence without accepting current host code', async () => {
  const result = await inspect();
  assert.equal(result.compiled.manifestSHA256, NODE_PINS.compiledManifestSHA256);
  assert.equal(result.prepared.pinFileSHA256, NODE_PINS.pinFileSHA256);
  assert.equal(result.receipt.compilerSources.length, 9);
  assert.equal(result.receipt.currentHostSourcesAccepted, false);
  assert.equal(result.receipt.artifactBundleIssued, false);
  assert.equal(result.receipt.financialAcceptance, false);
  await assert.rejects(inspect({ root: '/tmp' }), /RETAINED_NODE_PREPARATION_NO_OPTIONS/);
});

test('retained compiler bytes and physical paths are checked independently of their manifest', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lianum-n32-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const target = 'packages/proofs/evidence/original-sources/cfa5d5c298d968c0027e4bba1398a6746ab151aad24debaa1429a9232e35927c.source';
  const original = await readFile(sourcePath(target));
  const copy = join(directory, 'policy.mjs');
  await writeFile(copy, original);
  // Redirect only this filesystem input in the test module graph. The reader
  // body, pinned manifests and frozen validation helpers remain the real ones.
  const environment = join(directory, 'environment.mjs');
  await writeFile(environment, `import {sourcePath as actual} from ${JSON.stringify(import.meta.resolve('@lianum/environment'))};\nexport {resourceMode,resourcePath} from ${JSON.stringify(import.meta.resolve('@lianum/environment'))};\nexport const sourcePath = name => name === ${JSON.stringify(target)} ? ${JSON.stringify(copy)} : actual(name);\n`);
  const reader = new URL('../../src/tooling/retained-node-artifacts-v1.mjs', import.meta.url);
  const source = (await readFile(reader, 'utf8')).replace(/\bfrom\s+(['"])([^'"]+)\1/g, (_all, quote, specifier) => {
    const resolved = specifier === '@lianum/environment' ? pathToFileURL(environment).href
      : specifier.startsWith('.') ? new URL(specifier, reader).href : import.meta.resolve(specifier);
    return `from ${quote}${resolved}${quote}`;
  });
  const isolated = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
  await isolated.inspectRetainedNodeArtifactsForPreparationV1();
  const changed = Buffer.from(original); changed[changed.length - 2] ^= 1;
  await writeFile(copy, changed);
  await assert.rejects(isolated.inspectRetainedNodeArtifactsForPreparationV1(), /RETAINED_NODE_SOURCE_PIN/);
  await rm(copy); await symlink(sourcePath(target), copy);
  await assert.rejects(isolated.inspectRetainedNodeArtifactsForPreparationV1(), /FLAT_FILE_SYMLINK/);
});
