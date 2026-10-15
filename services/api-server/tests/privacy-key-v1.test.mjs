import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readPlatformPrivacyKeyV1 } from '../src/authorization/privacy-key-v1.mjs';
import { TEST_PLATFORM_PRIVACY_KEY } from './helpers/privacy-key-v1.mjs';

test('server secret is required independently of SQL credentials and has a single explicit source', () => {
  assert.equal(readPlatformPrivacyKeyV1({ LIANUM_PLATFORM_PRIVACY_KEY: TEST_PLATFORM_PRIVACY_KEY }), TEST_PLATFORM_PRIVACY_KEY);
  assert.throws(() => readPlatformPrivacyKeyV1({ DATABASE_URL: 'postgresql://test:test@localhost/test' }));
  assert.throws(() => readPlatformPrivacyKeyV1({ LIANUM_PLATFORM_PRIVACY_KEY: TEST_PLATFORM_PRIVACY_KEY, LIANUM_PLATFORM_PRIVACY_KEY_FILE: '/ignored' }));
  assert.throws(() => readPlatformPrivacyKeyV1({ LIANUM_PLATFORM_PRIVACY_KEY: 'bad' }));
});

test('local secret reload uses exact private file bytes, rejecting public permissions and symlinks', t => {
  const directory = mkdtempSync(join(tmpdir(), 'lianum-platform-privacy-key-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const file = join(directory, 'privacy-key');
  writeFileSync(file, TEST_PLATFORM_PRIVACY_KEY + '\n', { mode: 0o600 });
  assert.equal(readPlatformPrivacyKeyV1({ LIANUM_PLATFORM_PRIVACY_KEY_FILE: file }), TEST_PLATFORM_PRIVACY_KEY);
  chmodSync(file, 0o644);
  assert.throws(() => readPlatformPrivacyKeyV1({ LIANUM_PLATFORM_PRIVACY_KEY_FILE: file }));
  chmodSync(file, 0o600);
  const link = join(directory, 'link'); symlinkSync(file, link);
  assert.throws(() => readPlatformPrivacyKeyV1({ LIANUM_PLATFORM_PRIVACY_KEY_FILE: link }));
  writeFileSync(file, TEST_PLATFORM_PRIVACY_KEY);
  assert.throws(() => readPlatformPrivacyKeyV1({ LIANUM_PLATFORM_PRIVACY_KEY_FILE: file }));
});
