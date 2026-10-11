/** Public official protocol ABI tools. Paths locate retained dependencies;
 * the original manifest authenticates their bytes before loading ethers.
 * This loader issues no fixture, runtime, receipt or custody capability. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, sep} from 'node:path';
import {resourcePath} from '@lianum/environment';

export const OFFICIAL_PROTOCOL_RESOURCE_DIRECTORY_V1 = resourcePath('wallet', 'wallet-platform/artifacts/private-external-v1');
const manifestSHA256 = '9913e72be559a10c7340ba291f88b067eab2dd3a0c290052c4c024db14bff2e8';
const sha = value => createHash('sha256').update(value).digest('hex');

export function loadOriginalProtocolAbiToolsV1() {
  assert.equal(arguments.length, 0, 'PROTOCOL_ABI_FIXED_RESOURCES');
  const root = OFFICIAL_PROTOCOL_RESOURCE_DIRECTORY_V1;
  const bytes = readFileSync(join(root, 'protocol-fixture-artifact-pins.json'));
  assert.equal(sha(bytes), manifestSHA256, 'FIXED_PROTOCOL_ARTIFACT_MANIFEST');
  const rows = JSON.parse(bytes).files.filter(row => row.path.startsWith('abi-tools/'));
  assert.ok(rows.length > 0, 'PROTOCOL_ABI_MANIFEST_REQUIRED');
  const tools = realpathSync(join(root, 'abi-tools'));
  for (const row of rows) {
    const file = realpathSync(join(root, row.path));
    assert.ok(file.startsWith(tools + sep), 'PROTOCOL_ABI_RESOURCE_ESCAPE');
    const data = readFileSync(file);
    assert.equal(data.length, row.bytes, 'PROTOCOL_ABI_RESOURCE_BYTES');
    assert.equal(sha(data), row.sha256, 'PROTOCOL_FIXTURE_ARTIFACT_PIN');
  }
  // This is an explicitly supplied resource package, not a workspace-level
  // npm dependency. Pin its entrypoint as well as its full original manifest.
  const entry = join(tools, 'node_modules/ethers/lib.commonjs/index.js');
  assert.equal(realpathSync(entry), entry, 'PROTOCOL_ABI_RESOURCE_ESCAPE');
  return createRequire(entry)(entry);
}
