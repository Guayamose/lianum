/** Test-only loopback transport fault: forward the original COMMIT to real
 * PostgreSQL, then withhold its reply. No SQL response or effect is fabricated. */
import { createServer, createConnection } from 'node:net';
import { once } from 'node:events';

export async function startCommitReplyProxy(connectionString) {
  const target = new URL(connectionString), sockets = new Set();
  let dropNextCommit = true, commitForwarded = false;
  const server = createServer(client => {
    const backend = createConnection({ host: target.hostname, port: Number(target.port) });
    sockets.add(client); sockets.add(backend);
    client.on('error', () => {}); backend.on('error', () => client.destroy());
    client.once('close', () => { sockets.delete(client); backend.destroy(); });
    backend.once('close', () => { sockets.delete(backend); client.destroy(); });
    let bytes = Buffer.alloc(0), started = false, withholding = false;
    client.on('data', chunk => {
      bytes = Buffer.concat([bytes, chunk]);
      if (!started && bytes.length >= 4 && bytes.length >= bytes.readInt32BE(0)) {
        bytes = bytes.subarray(bytes.readInt32BE(0)); started = true;
      }
      if (started) while (bytes.length >= 5 && bytes.length >= 1 + bytes.readInt32BE(1)) {
        const length = 1 + bytes.readInt32BE(1);
        const command = bytes[0] === 81 ? bytes.subarray(5, length - 1).toString() : null;
        bytes = bytes.subarray(length);
        if (dropNextCommit && command === 'COMMIT') {
          dropNextCommit = false; withholding = true; commitForwarded = true;
        }
      }
      backend.write(chunk);
    });
    backend.on('data', chunk => { if (!withholding) client.write(chunk); });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = new URL(connectionString);
  address.hostname = '127.0.0.1'; address.port = String(server.address().port);
  return { connectionString: address.toString(), get commitForwarded() { return commitForwarded; },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise(resolve => server.close(resolve));
    } };
}
