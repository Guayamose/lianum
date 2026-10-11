import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { legacyDataRoot, sourcePath } from '@lianum/environment';
import {
  createWrappedRecoveryAuthorityV1,
  wrappedRecoveryAuthorityStatusV1,
  closeWrappedRecoveryAuthorityV1,
} from '../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';

test('editable recovery uses retained attempt data and rejects an attempt under source', async () => {
  const runId = randomUUID();
  const relative = join('.local', 'wrapped-wallet-fixed-acceptance-v1', 'attempt-' + runId);
  const attempt = join(legacyDataRoot('wallet'), relative);
  const directory = join(attempt, 'private-audit');
  const input = { directory, runId, sourceSHA256: 'a'.repeat(64), deadlineMs: Date.now() + 60000 };
  let authority;
  try {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    authority = await createWrappedRecoveryAuthorityV1(input);
    assert.equal(wrappedRecoveryAuthorityStatusV1(authority).phase, 'CAPTURING');
    assert.equal((await stat(join(directory, 'recovery', 'authority.vault'))).isDirectory(), true);
    await assert.rejects(createWrappedRecoveryAuthorityV1({ ...input,
      directory: sourcePath('packages/backend/src/' + relative + '/private-audit'),
    }), /WRAPPED_RECOVERY_FIXED_ATTEMPT/);
  } finally {
    if (authority) await closeWrappedRecoveryAuthorityV1(authority);
    await rm(attempt, { recursive: true, force: true });
  }
});
