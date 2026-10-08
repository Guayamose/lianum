/** Durable mobile authorization intake. Consuming permission is not settlement.
 * The unique owner/request/action key survives processes and prevents resends.
 * No signing keys, witnesses or private balances belong in this store. */
import { createHash } from 'node:crypto';
const canonical = value => value===null || typeof value!=='object' ? JSON.stringify(value)
  : Array.isArray(value) ? '['+value.map(canonical).join(',')+']'
    : '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}';
const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export const authorizationKey = challenge => digest([challenge.ownerPublicKey, challenge.intent.requestId, challenge.intent.action]);
export const operationTerms = challenge => {
  const { action, ...terms } = challenge.intent;
  return digest(terms);
};
export async function createPostgresAuthorizationStore(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS mobile_challenges (
    challenge_id text PRIMARY KEY, challenge jsonb NOT NULL, expires_at bigint NOT NULL,
    consumed boolean NOT NULL DEFAULT false);
    CREATE TABLE IF NOT EXISTS mobile_operations (
    owner_key text NOT NULL, request_id text NOT NULL, terms_hash text NOT NULL,
    PRIMARY KEY(owner_key, request_id));
    CREATE TABLE IF NOT EXISTS mobile_authorizations (
    authorization_key text PRIMARY KEY, challenge_id text UNIQUE NOT NULL,
    terms_hash text NOT NULL, response jsonb NOT NULL);`);
  return Object.freeze({
    async ready() { await pool.query('SELECT 1'); return true; },
    async put(challenge) {
      await pool.query('DELETE FROM mobile_challenges WHERE expires_at < $1 AND consumed = false', [Date.now()]);
      await pool.query('INSERT INTO mobile_challenges(challenge_id,challenge,expires_at) VALUES($1,$2,$3)',
        [challenge.challengeId, challenge, challenge.expiresAt]);
    },
    async consume(challenge, now) {
      const client = await pool.connect();
      let releaseFailure;
      try {
        await client.query('BEGIN');
        const key = authorizationKey(challenge), terms = operationTerms(challenge);
        const saved = await client.query('SELECT terms_hash,response FROM mobile_authorizations WHERE authorization_key=$1', [key]);
        if (saved.rows.length) {
          if (saved.rows[0].terms_hash !== terms) throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'), {code:'MOBILE_OPERATION_CONFLICT'});
          await client.query('COMMIT'); return { duplicate: true, response: saved.rows[0].response };
        }
        const original = await client.query('SELECT challenge,expires_at,consumed FROM mobile_challenges WHERE challenge_id=$1 FOR UPDATE', [challenge.challengeId]);
        const concurrent = await client.query('SELECT terms_hash,response FROM mobile_authorizations WHERE authorization_key=$1', [key]);
        if (concurrent.rows.length) {
          if (concurrent.rows[0].terms_hash!==terms)throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'),{code:'MOBILE_OPERATION_CONFLICT'});
          await client.query('COMMIT');return {duplicate:true,response:concurrent.rows[0].response};
        }
        if (original.rows.length !== 1 || original.rows[0].consumed || Number(original.rows[0].expires_at) <= now
          || digest(original.rows[0].challenge) !== digest(challenge)) throw Object.assign(new Error('MOBILE_CHALLENGE_NOT_AVAILABLE'), {code:'MOBILE_CHALLENGE_NOT_AVAILABLE'});
        await client.query('INSERT INTO mobile_operations(owner_key,request_id,terms_hash) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
          [challenge.ownerPublicKey, challenge.intent.requestId, terms]);
        const bound = await client.query('SELECT terms_hash FROM mobile_operations WHERE owner_key=$1 AND request_id=$2', [challenge.ownerPublicKey, challenge.intent.requestId]);
        if (bound.rows[0].terms_hash !== terms) throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'), {code:'MOBILE_OPERATION_CONFLICT'});
        const response = {status:'UNKNOWN', requestId:challenge.intent.requestId, operationState:'UNKNOWN', retryAllowed:false};
        const inserted = await client.query('INSERT INTO mobile_authorizations(authorization_key,challenge_id,terms_hash,response) VALUES($1,$2,$3,$4) ON CONFLICT(authorization_key) DO NOTHING RETURNING authorization_key',
          [key, challenge.challengeId, terms, response]);
        if (!inserted.rows.length) {
          const previous = await client.query('SELECT terms_hash,response FROM mobile_authorizations WHERE authorization_key=$1', [key]);
          if (previous.rows[0].terms_hash !== terms) throw Object.assign(new Error('MOBILE_OPERATION_CONFLICT'), {code:'MOBILE_OPERATION_CONFLICT'});
          await client.query('COMMIT'); return {duplicate:true,response:previous.rows[0].response};
        }
        await client.query('UPDATE mobile_challenges SET consumed=true WHERE challenge_id=$1', [challenge.challengeId]);
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
      const result = await pool.query('UPDATE mobile_authorizations SET response=$2 WHERE authorization_key=$1 RETURNING authorization_key', [key, response]);
      if (result.rows.length !== 1) throw new Error('MOBILE_AUTHORIZATION_NOT_RETAINED');
    },
    async close() { await pool.end(); },
  });
}
