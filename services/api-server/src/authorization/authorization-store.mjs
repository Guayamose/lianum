/** Durable mobile authorization intake. Consuming permission is not settlement.
 * The unique owner/request/action key survives processes and prevents resends.
 * No signing keys, witnesses or private balances belong in this store. */
import { createHash } from 'node:crypto';
import { assertPlatformSchema } from '../storage/schema-migrations.mjs';
import { createPrivateAuthorizationRecordCodecV1, PLATFORM_PRIVACY_KEY_MARKER } from './private-authorization-record-v1.mjs';
const canonical = value => value===null || typeof value!=='object' ? JSON.stringify(value)
  : Array.isArray(value) ? '['+value.map(canonical).join(',')+']'
    : '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const authorizationKey = challenge => digest([challenge.ownerPublicKey, challenge.intent.requestId, challenge.intent.action]);
export const operationTerms = challenge => {
  const { action, ...terms } = challenge.intent;
  return digest(terms);
};
export async function createPostgresAuthorizationStore(pool, { privacyKey } = {}) {
  const privateRecord = createPrivateAuthorizationRecordCodecV1(privacyKey);
  const keyMarker = PLATFORM_PRIVACY_KEY_MARKER;
  const assertPrivacyKey = async connection => {
    const marker = await connection.query('SELECT terms_hash FROM public.mobile_operations WHERE owner_key=$1 AND request_id=$2', [keyMarker.owner, keyMarker.request]);
    if (marker.rows.length && (marker.rows.length !== 1 || marker.rows[0].terms_hash !== privateRecord.keyPin))
      throw Object.assign(new Error('MOBILE_PRIVACY_KEY_MISMATCH'), { code: 'MOBILE_PRIVACY_KEY_MISMATCH' });
  };
  const retainPrivacyKey = async connection => {
    // This reserved row cannot be a normalized mobile owner/request. A stable
    // pin prevents a missing/replaced server secret from splitting operation
    // identities or creating fresh authority after a restart.
    await connection.query('INSERT INTO public.mobile_operations(owner_key,request_id,terms_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [keyMarker.owner, keyMarker.request, privateRecord.keyPin]);
    await assertPrivacyKey(connection);
  };
  return Object.freeze({
    // The factory performs no DDL. Normal HTTP use checks this read-only gate;
    // fixtures explicitly migrate their isolated database before using it.
    async ready() { await assertPlatformSchema(pool); await assertPrivacyKey(pool); return true; },
    async put(challenge) {
      await retainPrivacyKey(pool);
      await pool.query('DELETE FROM public.mobile_challenges WHERE expires_at < $1 AND consumed = false', [Date.now()]);
      await pool.query('INSERT INTO public.mobile_challenges(challenge_id,challenge,expires_at) VALUES($1,$2,$3)',
        [challenge.challengeId, privateRecord.challenge(challenge), challenge.expiresAt]);
    },
    async consume(challenge, now) {
      const client = await pool.connect();
      let releaseFailure;
      try {
        await client.query('BEGIN');
        await assertPrivacyKey(client);
        const key = authorizationKey(challenge), terms = privateRecord.terms(challenge);
        const saved = await client.query('SELECT terms_hash,response FROM public.mobile_authorizations WHERE authorization_key=$1', [key]);
        if (saved.rows.length) {
          if (!privateRecord.matchesTerms(saved.rows[0].terms_hash, challenge)) throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'), {code:'MOBILE_OPERATION_CONFLICT'});
          await client.query('COMMIT'); return { duplicate: true, response: privateRecord.readResponse(saved.rows[0].response, challenge) };
        }
        const original = await client.query('SELECT challenge,expires_at,consumed FROM public.mobile_challenges WHERE challenge_id=$1 FOR UPDATE', [challenge.challengeId]);
        const concurrent = await client.query('SELECT terms_hash,response FROM public.mobile_authorizations WHERE authorization_key=$1', [key]);
        if (concurrent.rows.length) {
          if (!privateRecord.matchesTerms(concurrent.rows[0].terms_hash, challenge))throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'),{code:'MOBILE_OPERATION_CONFLICT'});
          await client.query('COMMIT');return {duplicate:true,response:privateRecord.readResponse(concurrent.rows[0].response, challenge)};
        }
        if (original.rows.length !== 1 || original.rows[0].consumed || Number(original.rows[0].expires_at) <= now
          || !privateRecord.matchesChallenge(original.rows[0].challenge, challenge)) throw Object.assign(new Error('MOBILE_CHALLENGE_NOT_AVAILABLE'), {code:'MOBILE_CHALLENGE_NOT_AVAILABLE'});
        await retainPrivacyKey(client);
        const identity = privateRecord.operation(challenge);
        // Preserve immutable terms from already consumed original actions.
        // Query only their original opaque authorization keys, not the owner.
        // Never rewrite legacy authorization keys: UNKNOWN remains consumed.
        const priorActions = ['prepare', 'execute', 'reconcile', 'recover'].map(action => authorizationKey({ ...challenge, intent: { ...challenge.intent, action } }));
        const legacy = await client.query('SELECT terms_hash FROM public.mobile_authorizations WHERE authorization_key=ANY($1::text[])', [priorActions]);
        if (legacy.rows.some(row => !privateRecord.matchesTerms(row.terms_hash, challenge)))
          throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'), {code:'MOBILE_OPERATION_CONFLICT'});
        await client.query('INSERT INTO public.mobile_operations(owner_key,request_id,terms_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [identity.owner, identity.request, terms]);
        const bound = await client.query('SELECT terms_hash FROM public.mobile_operations WHERE owner_key=$1 AND request_id=$2', [identity.owner, identity.request]);
        if (bound.rows.length !== 1 || !privateRecord.matchesTerms(bound.rows[0].terms_hash, challenge)) throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'), {code:'MOBILE_OPERATION_CONFLICT'});
        const response = {status:'UNKNOWN', requestId:challenge.intent.requestId, operationState:'UNKNOWN', retryAllowed:false};
        const inserted = await client.query('INSERT INTO public.mobile_authorizations(authorization_key,challenge_id,terms_hash,response) VALUES($1,$2,$3,$4) ON CONFLICT(authorization_key) DO NOTHING RETURNING authorization_key',
          [key, challenge.challengeId, terms, privateRecord.response(response)]);
        if (!inserted.rows.length) {
          const previous = await client.query('SELECT terms_hash,response FROM public.mobile_authorizations WHERE authorization_key=$1', [key]);
          if (!privateRecord.matchesTerms(previous.rows[0].terms_hash, challenge)) throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'), {code:'MOBILE_OPERATION_CONFLICT'});
          await client.query('COMMIT'); return {duplicate:true,response:privateRecord.readResponse(previous.rows[0].response, challenge)};
        }
        await client.query('UPDATE public.mobile_challenges SET consumed=true WHERE challenge_id=$1', [challenge.challengeId]);
        await client.query('COMMIT'); return {duplicate:false,key,response};
      } catch (error) {
        if (error.message === 'Query read timeout') {
          // A COMMIT may have completed even when its reply was lost. Discard
          // this exact connection; queued ROLLBACK cannot establish otherwise.
          // The durable record remains UNKNOWN and never permits redispatch.
          releaseFailure = error;
        } else {
          try { await client.query('ROLLBACK'); }
          catch (rollbackError) { releaseFailure = rollbackError; }
        }
        throw error;
      } finally { client.release(releaseFailure); }
    },
    async finish(key, response) {
      await assertPrivacyKey(pool);
      const result = await pool.query('UPDATE public.mobile_authorizations SET response=$2 WHERE authorization_key=$1 RETURNING authorization_key', [key, privateRecord.response(response)]);
      if (result.rows.length !== 1) throw new Error('MOBILE_AUTHORIZATION_NOT_RETAINED');
    },
    async receipt(challenge) {
      await assertPrivacyKey(pool);
      const retained = await pool.query(`SELECT c.challenge,c.consumed,a.terms_hash,a.response
        FROM public.mobile_authorizations a JOIN public.mobile_challenges c ON c.challenge_id=a.challenge_id
        WHERE a.authorization_key=$1 AND a.challenge_id=$2`,
        [authorizationKey(challenge), challenge.challengeId]);
      const original = retained.rows[0];
      if (retained.rows.length !== 1 || original.consumed !== true
        || !privateRecord.matchesTerms(original.terms_hash, challenge)
        || !privateRecord.matchesChallenge(original.challenge, challenge)) {
        throw Object.assign(new Error('MOBILE_AUTHORIZATION_NOT_RETAINED'), { code: 'MOBILE_AUTHORIZATION_NOT_RETAINED' });
      }
      // Read only: expiry blocks new effects, not evidence of an already
      // consumed original. No challenge, authorization or response is changed.
      return privateRecord.readResponse(original.response, challenge);
    },
    async close() { try { await pool.end(); } finally { privateRecord.close(); } },
  });
}
