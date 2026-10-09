/** Explicit operator command, one original group. No credentials/payload logs. */
import { createPlatformPool } from './database-pool.mjs';
import { readPlatformPrivacyKeyV1 } from './privacy-key-v1.mjs';
import { redactLegacyPlatformAuthorizationV1 } from './legacy-authorization-redaction-v1.mjs';
let pool;
try {
  if (process.argv.length !== 2 || !process.env.DATABASE_URL) throw Error('PLATFORM_LEGACY_REDACTION_CONFIGURATION');
  const privacyKey = readPlatformPrivacyKeyV1();
  pool = createPlatformPool(process.env.DATABASE_URL);
  const result = await redactLegacyPlatformAuthorizationV1(pool, { privacyKey,
    challengeId: process.env.LIANUM_PLATFORM_LEGACY_CHALLENGE_ID });
  process.stdout.write(JSON.stringify({ service: 'lianum-platform-legacy-redaction', status: 'COMPLETE', ...result })+'\n');
} catch (error) {
  const candidate = error?.code ?? error?.message;
  const code = /^(?:PLATFORM|MOBILE)_[A-Z_]{1,60}$/.test(candidate ?? '') ? candidate : 'PLATFORM_LEGACY_REDACTION_UNAVAILABLE';
  process.stderr.write(JSON.stringify({ service: 'lianum-platform-legacy-redaction', status: 'FAILED_OR_UNCERTAIN', error: code })+'\n');
  process.exitCode = 1;
} finally { await pool?.end(); }
