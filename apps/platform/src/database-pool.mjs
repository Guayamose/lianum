/** Pool creation opens no connection and never logs connection credentials.
 * pg removes an idle broken client before emitting its transport error. The
 * listeners prevent those EventEmitter errors from killing the HTTP process;
 * active-query failures still reject and readiness closes until SQL recovers. */
import pg from 'pg';
export function createPlatformPool(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000,
    // statement_timeout is enforced by PostgreSQL. query_timeout also bounds
    // this client's wait when an established transport stops returning bytes.
    statement_timeout: 5000, query_timeout: 5000, idleTimeoutMillis: 30_000 });
  pool.on('error', () => {});
  // pool.connect() removes pg's idle listener while a transaction owns its
  // client. A transport failure also emits on that Client after rejecting its
  // queries, so each client created by this pool needs its own scoped listener.
  pool.on('connect', client => client.on('error', () => {}));
  return pool;
}
