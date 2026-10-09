/** Explicit storage-only conversion of one original owner/request group.
 * No signature, nonce, admission, authorization ID or economic effect is issued.
 * A lost COMMIT acknowledgement stays uncertain; retry inspects the same rows. */
import { normalizeMobileChallenge } from '../../../packages/mobile-protocol/src/authorization.mjs';
import { authorizationKey } from './authorization-store.mjs';
import { assertPlatformSchema, PLATFORM_MIGRATION_LOCK_KEY } from './schema-migrations.mjs';
import { createPrivateAuthorizationRecordCodecV1, PLATFORM_PRIVACY_KEY_MARKER } from './private-authorization-record-v1.mjs';
const MAX_CHALLENGES = 256;
const PRIVATE_CHALLENGE = 'LIANUM_PLATFORM_PRIVATE_CHALLENGE_V1';
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (ok, code = 'PLATFORM_LEGACY_REDACTION_RECORD_INVALID') => { if (!ok) fail(code); };

export async function redactLegacyPlatformAuthorizationV1(pool, { privacyKey, challengeId } = {}) {
  need(typeof challengeId === 'string' && /^[0-9a-f]{64}$/.test(challengeId), 'PLATFORM_LEGACY_REDACTION_ID_REQUIRED');
  const codec = createPrivateAuthorizationRecordCodecV1(privacyKey);
  let client, releaseFailure;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    await client.query("SET LOCAL lock_timeout='4000ms'");
    await client.query("SET LOCAL statement_timeout='4500ms'");
    await client.query('SELECT pg_catalog.pg_advisory_xact_lock($1,$2)', PLATFORM_MIGRATION_LOCK_KEY);
    await assertPlatformSchema(client);
    // Serializes only the explicit conversion against INSERT/UPDATE/DELETE.
    // Ordinary signed receipt reads remain read-only and can still run.
    await client.query('LOCK TABLE public.mobile_challenges,public.mobile_operations,public.mobile_authorizations IN SHARE ROW EXCLUSIVE MODE');
    const marker = (await client.query('SELECT terms_hash FROM public.mobile_operations WHERE owner_key=$1 AND request_id=$2',
      [PLATFORM_PRIVACY_KEY_MARKER.owner, PLATFORM_PRIVACY_KEY_MARKER.request])).rows;
    need(marker.length <= 1 && (!marker.length || marker[0].terms_hash === codec.keyPin), 'MOBILE_PRIVACY_KEY_MISMATCH');
    const selected = (await client.query('SELECT challenge FROM public.mobile_challenges WHERE challenge_id=$1', [challengeId])).rows;
    need(selected.length === 1, 'PLATFORM_LEGACY_REDACTION_ORIGINAL_REQUIRED');
    if (selected[0].challenge?.format === PRIVATE_CHALLENGE) {
      const record = selected[0].challenge;
      need(Object.getPrototypeOf(record) === Object.prototype
        && Object.keys(record).sort().join(',') === 'commitment,format'
        && typeof record.commitment === 'string' && /^[0-9a-f]{64}$/.test(record.commitment));
      // A missing pin never adopts an arbitrary new key for redacted records.
      need(marker.length === 1, 'MOBILE_PRIVACY_KEY_MISMATCH');
      await client.query('COMMIT');
      return Object.freeze({ profile: 'LIANUM_PLATFORM_LEGACY_REDACTION_V1', redacted: false, challenges: 0, authorizations: 0, operation: false });
    }
    need(selected[0].challenge?.profile === 'LIANUM_MOBILE_AUTHORIZATION_V1');
    const originals = (await client.query(`SELECT c.challenge_id,c.challenge,c.expires_at,c.consumed
      FROM public.mobile_challenges c JOIN public.mobile_challenges chosen ON chosen.challenge_id=$1
      WHERE c.challenge->>'ownerPublicKey'=chosen.challenge->>'ownerPublicKey'
      AND c.challenge->'intent'->>'requestId'=chosen.challenge->'intent'->>'requestId'
      ORDER BY c.challenge_id LIMIT $2`, [challengeId, MAX_CHALLENGES + 1])).rows;
    need(originals.length > 0 && originals.length <= MAX_CHALLENGES, 'PLATFORM_LEGACY_REDACTION_BOUND');
    const challenges = new Map();
    for (const row of originals) {
      const value = normalizeMobileChallenge(row.challenge, { allowInsecureLocalhost: true });
      need(codec.matchesChallenge(row.challenge, value) && row.challenge_id === value.challengeId
        && Number(row.expires_at) === value.expiresAt && typeof row.consumed === 'boolean');
      challenges.set(row.challenge_id, { row, value });
    }
    need(challenges.has(challengeId));
    const first = challenges.get(challengeId).value, identity = codec.operation(first);
    const keys = ['prepare', 'execute', 'reconcile', 'recover'].map(action => authorizationKey({ ...first, intent: { ...first.intent, action } }));
    const authorizations = (await client.query(`SELECT a.authorization_key,a.challenge_id,a.terms_hash,a.response,c.consumed
      FROM public.mobile_authorizations a JOIN public.mobile_challenges c ON c.challenge_id=a.challenge_id
      WHERE a.authorization_key=ANY($1::text[]) OR a.challenge_id=ANY($2::text[])`, [keys, [...challenges.keys()]])).rows;
    need(authorizations.length <= keys.length);
    for (const row of authorizations) {
      need(keys.includes(row.authorization_key) && row.consumed === true);
      const original = challenges.get(row.challenge_id);
      if (original) need(original.row.consumed && authorizationKey(original.value) === row.authorization_key
        && codec.matchesTerms(row.terms_hash, original.value));
    }
    for (const [id, original] of challenges)
      need(original.row.consumed === authorizations.some(row => row.challenge_id === id));
    // The raw legacy identity is selected inside SQL from its already stored
    // original challenge. Query parameters contain only opaque IDs/HMACs.
    const legacyOperation = (await client.query(`SELECT o.terms_hash FROM public.mobile_operations o
      JOIN public.mobile_challenges c ON c.challenge_id=$1
      WHERE o.owner_key=c.challenge->>'ownerPublicKey' AND o.request_id=c.challenge->'intent'->>'requestId'`, [challengeId])).rows;
    const privateOperation = (await client.query('SELECT terms_hash FROM public.mobile_operations WHERE owner_key=$1 AND request_id=$2',
      [identity.owner, identity.request])).rows;
    need(legacyOperation.length <= 1 && privateOperation.length <= 1);
    const bindings = [...legacyOperation, ...privateOperation, ...authorizations];
    need(!authorizations.length || legacyOperation.length + privateOperation.length > 0);
    const anchor = [...challenges.values()].find(({ value }) => bindings.every(row => codec.matchesTerms(row.terms_hash, value)))?.value;
    need(anchor, 'PLATFORM_LEGACY_REDACTION_TERMS_UNAVAILABLE');
    const updates = authorizations.map(row => ({ key: row.authorization_key,
      response: codec.response(codec.readResponse(row.response, anchor)) }));
    const terms = codec.terms(anchor);
    // All cross-table associations and statuses were checked before mutation.
    // This pin is the same durable infrastructure key used by normal intake.
    if (!marker.length) await client.query('INSERT INTO public.mobile_operations(owner_key,request_id,terms_hash) VALUES($1,$2,$3)',
      [PLATFORM_PRIVACY_KEY_MARKER.owner, PLATFORM_PRIVACY_KEY_MARKER.request, codec.keyPin]);
    if (legacyOperation.length) {
      if (!privateOperation.length) await client.query('INSERT INTO public.mobile_operations(owner_key,request_id,terms_hash) VALUES($1,$2,$3)',
        [identity.owner, identity.request, terms]);
      // Merge only the redundant operation index; authorization/challenge IDs,
      // consumption, expiry and every UNKNOWN/ADMITTED status remain intact.
      const removed = await client.query(`DELETE FROM public.mobile_operations o USING public.mobile_challenges c
        WHERE c.challenge_id=$1 AND o.owner_key=c.challenge->>'ownerPublicKey'
        AND o.request_id=c.challenge->'intent'->>'requestId' RETURNING o.terms_hash`, [challengeId]);
      need(removed.rows.length === 1);
    }
    if (privateOperation.length) await client.query('UPDATE public.mobile_operations SET terms_hash=$3 WHERE owner_key=$1 AND request_id=$2',
      [identity.owner, identity.request, terms]);
    for (const update of updates) {
      const changed = await client.query('UPDATE public.mobile_authorizations SET terms_hash=$2,response=$3 WHERE authorization_key=$1 RETURNING authorization_key',
        [update.key, terms, update.response]);
      need(changed.rows.length === 1);
    }
    for (const [id, { value }] of challenges) {
      const changed = await client.query('UPDATE public.mobile_challenges SET challenge=$2 WHERE challenge_id=$1 RETURNING challenge_id', [id, codec.challenge(value)]);
      need(changed.rows.length === 1);
    }
    await client.query('COMMIT');
    return Object.freeze({ profile: 'LIANUM_PLATFORM_LEGACY_REDACTION_V1', redacted: true,
      challenges: challenges.size, authorizations: updates.length, operation: legacyOperation.length === 1 });
  } catch (error) {
    releaseFailure = error;
    if (client && error?.message !== 'Query read timeout') { try { await client.query('ROLLBACK'); } catch {} }
    throw error;
  } finally { client?.release(releaseFailure); codec.close(); }
}
