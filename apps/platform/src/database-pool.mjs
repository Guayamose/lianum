/** Pool creation opens no connection and never logs connection credentials.
 * pg removes an idle broken client before emitting its transport error. The
 * listener prevents that EventEmitter error from killing the HTTP process;
 * active-query failures still reject and readiness closes until SQL recovers. */
import pg from 'pg';
export function createPlatformPool(connectionString) {
  const pool = new pg.Pool({ connectionString, max: 5, connectionTimeoutMillis: 5000,
    statement_timeout: 5000, idleTimeoutMillis: 30_000 });
  pool.on('error', () => {});
  return pool;
}
