import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WalletSDK } from '@lianum/engine/api/sdk';
import { NativeTripleSession } from '@lianum/engine/native/native-triple';
import { NativeLocalSession } from '@lianum/engine/native/native-local';
import { PrivatePaymentSession } from '../payments/private-payment-session.mjs';
import { PrivateWalletSession } from '@lianum/engine/wallet/runtime/private-wallet-session';
import { PrivateCohortSession } from '../coordination/cohorts/private-cohort-session.mjs';
import { PrivateAccountSession } from './accounts/private-account-session.mjs';
import { PrivateAccountCohortSession } from './accounts/private-account-cohort-session.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const staticFiles = { '/': ['index.html', 'text/html; charset=utf-8'], '/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'], '/native.mjs': ['native.mjs', 'text/javascript; charset=utf-8'], '/native-outcome.mjs': ['native-outcome.mjs', 'text/javascript; charset=utf-8'], '/triple.mjs': ['triple.mjs', 'text/javascript; charset=utf-8'], '/private.mjs': ['private.mjs', 'text/javascript; charset=utf-8'], '/private-account.mjs': ['private-account.mjs', 'text/javascript; charset=utf-8'], '/private-cohort.mjs': ['private-cohort.mjs', 'text/javascript; charset=utf-8'], '/private-wallet.mjs': ['private-wallet.mjs', 'text/javascript; charset=utf-8'], '/private-wallet-outcome.mjs': ['private-wallet-outcome.mjs', 'text/javascript; charset=utf-8'], '/private-outcome.mjs': ['private-outcome.mjs', 'text/javascript; charset=utf-8'], '/style.css': ['style.css', 'text/css; charset=utf-8'] };

export async function startLocalServer({ port = 8787, directory, initialTime = Date.now(), privateDirectory, privateSessionOptions, sharedWalletDirectory, sharedWalletSessionOptions, cohortDirectory, cohortSessionOptions, accountDirectory, accountSessionOptions, sharedAccountDirectory, sharedAccountSessionOptions }  = {}) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('INVALID_PORT');
  let now = initialTime;
  const local = join(project, '.local'); await mkdir(local, { recursive: true });
  const session = directory ?? await mkdtemp(join(local, 'client-'));
  await mkdir(session, { recursive: true });
  const password = randomBytes(32).toString('hex'), token = randomBytes(32).toString('hex');
  const sdk = new WalletSDK(join(session, 'synthetic-vault.json'), password, { clock: () => now }); await sdk.create();
  const native = new NativeLocalSession(session);
  const triple = new NativeTripleSession(session);
  const privatePayment = new PrivatePaymentSession(privateDirectory ?? join(directory ?? local, 'private-wallet'), privateSessionOptions);
  await privatePayment.initialize();
  const privateWallet = new PrivateWalletSession(sharedWalletDirectory ?? join(directory ?? local, 'shared-private-wallet'), sharedWalletSessionOptions);
  try { await privateWallet.initialize(); } catch (error) { await privatePayment.close(); throw error; }
  const privateCohort = new PrivateCohortSession(cohortDirectory ?? join(directory ?? local, 'private-cohort'), cohortSessionOptions);
  try { await privateCohort.initialize(); } catch (error) { await Promise.all([privatePayment.close(),privateWallet.close()]); throw error; }
  const privateAccount = new PrivateAccountSession(accountDirectory ?? join(directory ?? local, 'private-account'), accountSessionOptions);
  try { await privateAccount.initialize(); } catch(error) { await Promise.all([privatePayment.close(),privateWallet.close(),privateCohort.close()]); throw error; }
  const privateAccounts = new PrivateAccountCohortSession(sharedAccountDirectory ?? join(directory ?? local, 'shared-private-accounts'), sharedAccountSessionOptions);
  try { await privateAccounts.initialize(); } catch(error) { await Promise.all([privatePayment.close(),privateWallet.close(),privateCohort.close(),privateAccount.close()]); throw error; }
  let origin = '', busy = false, runtimeAdmission = Promise.resolve(), admissionCount = 0;
  const admitRuntime = work => {
    if (admissionCount >= 32) throw new Error('PRIVATE_ADMISSION_BUSY');
    admissionCount++; const admitted = runtimeAdmission.then(work);
    runtimeAdmission = admitted.catch(() => {}).finally(() => { admissionCount--; });
    return admitted;
  };
  const server = createServer(async (req, res) => {
    const send = (status, value, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        'Cross-Origin-Resource-Policy': 'same-origin', 'Cross-Origin-Opener-Policy': 'same-origin', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
      res.end(type.startsWith('application/json') ? JSON.stringify(value) : value);
    };
    try {
      if (req.headers.host !== new URL(origin).host) return send(403, { error: 'INVALID_HOST' });
      if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'INVALID_ORIGIN' });
      const url = new URL(req.url, origin);
      if (req.method === 'GET' && Object.hasOwn(staticFiles, url.pathname)) {
        const [name, type] = staticFiles[url.pathname];
        let content = await readFile(join(project, 'client', name), 'utf8');
        if (name === 'index.html') content = content.replace('__LOCAL_TOKEN__', token);
        return send(200, content, type);
      }
      const submitted = req.headers['x-local-token'];
      if (typeof submitted !== 'string' || submitted.length !== token.length || !timingSafeEqual(Buffer.from(submitted), Buffer.from(token))) return send(403, { error: 'INVALID_SESSION' });
      if (req.method === 'GET' && url.pathname === '/api/state') return send(200, { ...await sdk.snapshot(), currentTime: now, clockMode: 'manual-simulation' });
      if (req.method === 'GET' && url.pathname === '/api/triple') return send(200, triple.snapshot());
      if (req.method === 'GET' && url.pathname === '/api/native') return send(200, native.snapshot());
      if (req.method === 'GET' && url.pathname === '/api/private-accounts') return send(200, await privateAccounts.refresh());
      if (req.method === 'GET' && /^\/api\/private-accounts\/owners\/[01]\/private$/.test(url.pathname)) return send(200, await privateAccounts.privateStatus(Number(url.pathname.split('/')[4])));
      if (req.method === 'GET' && url.pathname === '/api/private-account') return send(200, await privateAccount.refresh());
      if (req.method === 'GET' && url.pathname === '/api/private-account/private') return send(200, await privateAccount.privateStatus());
      if (req.method === 'GET' && url.pathname === '/api/private-cohort') return send(200, await privateCohort.refresh());
      if (req.method === 'GET' && /^\/api\/private-cohort\/owners\/[01]\/private$/.test(url.pathname)) return send(200, await privateCohort.privateStatus(Number(url.pathname.split('/')[4])));
      if (req.method === 'GET' && url.pathname === '/api/private-wallet') return send(200, await privateWallet.refresh());
      if (req.method === 'GET' && url.pathname === '/api/private-wallet/private') return send(200, await privateWallet.privateStatus());
      if (req.method === 'GET' && url.pathname === '/api/private') return send(200, await privatePayment.refresh());
      if (req.method === 'GET' && /^\/api\/private\/operations\/[0-9a-f]{32}$/.test(url.pathname)) return send(200, { operation: await privatePayment.operation(url.pathname.split('/').at(-1)) });
      if (req.method === 'GET' && url.pathname === '/api/view') return send(200, await sdk.executorView(url.searchParams.get('hash'), url.searchParams.get('legId')));
      const sharedAccountAction = url.pathname === '/api/private-accounts/action' || /^\/api\/private-accounts\/owners\/[01]\/action$/.test(url.pathname);
      const cohortAction = url.pathname === '/api/private-cohort/action' || /^\/api\/private-cohort\/owners\/[01]\/action$/.test(url.pathname);
      if (req.method !== 'POST' || !sharedAccountAction && !cohortAction && !['/api/action', '/api/native/action', '/api/triple/action', '/api/private/action', '/api/private-wallet/action', '/api/private-account/action'].includes(url.pathname)) return send(404, { error: 'NOT_FOUND' });
      if (req.headers.origin !== origin) return send(403, { error: 'ORIGIN_REQUIRED' });
      if (req.headers['content-type'] !== 'application/json') return send(415, { error: 'JSON_REQUIRED' });
      const globalAction = !sharedAccountAction && !cohortAction && !['/api/private/action','/api/private-wallet/action','/api/private-account/action'].includes(url.pathname);
      if (globalAction && busy) return send(409, { error: 'ACTION_IN_PROGRESS' });
      if (globalAction) busy = true;
      try {
        let bytes = 0; const chunks = [];
        for await (const chunk of req) { bytes += chunk.length; if (bytes > 4096) { send(413, { error: 'BODY_TOO_LARGE' }); req.resume(); return; } chunks.push(chunk); }
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!body || Array.isArray(body) || typeof body !== 'object') throw new Error('INVALID_BODY');
        if (sharedAccountAction) return await admitRuntime(async () => {
          const n=native.snapshot(),t=triple.snapshot();
          if(privateAccount.snapshot().occupied||privateCohort.snapshot().occupied||privateWallet.snapshot().occupied||privatePayment.snapshot().busy||n.busy||t.busy||n.runtime&&!n.runtimeStopped||t.runtime&&!t.runtimeStopped) return send(409,{error:'PRIVATE_OTHER_RUNTIME_ACTIVE'});
          return send(202,await privateAccounts.submit(body,url.pathname === '/api/private-accounts/action' ? null : Number(url.pathname.split('/')[4])));
        });
        if (url.pathname === '/api/private-account/action') return await admitRuntime(async () => {
          const n=native.snapshot(),t=triple.snapshot();
          if(privateAccounts.snapshot().occupied||privateCohort.snapshot().occupied||privateWallet.snapshot().occupied||privatePayment.snapshot().busy||n.busy||t.busy||n.runtime&&!n.runtimeStopped||t.runtime&&!t.runtimeStopped) return send(409,{error:'PRIVATE_OTHER_RUNTIME_ACTIVE'});
          return send(202,await privateAccount.submit(body));
        });
        if (cohortAction) return await admitRuntime(async () => {
          const n=native.snapshot(),t=triple.snapshot();
          if(privateAccounts.snapshot().occupied||privateAccount.snapshot().occupied||privateWallet.snapshot().occupied||privatePayment.snapshot().busy||n.busy||t.busy||n.runtime&&!n.runtimeStopped||t.runtime&&!t.runtimeStopped) return send(409,{error:'PRIVATE_OTHER_RUNTIME_ACTIVE'});
          return send(202,await privateCohort.submit(body,url.pathname === '/api/private-cohort/action' ? null : Number(url.pathname.split('/')[4])));
        });
        if (url.pathname === '/api/private-wallet/action') return await admitRuntime(async () => {
          const n=native.snapshot(),t=triple.snapshot();
          if(privateAccounts.snapshot().occupied||privateAccount.snapshot().occupied||privateCohort.snapshot().occupied||n.busy||t.busy||n.runtime&&!n.runtimeStopped||t.runtime&&!t.runtimeStopped||privatePayment.snapshot().busy) return send(409,{error:'PRIVATE_OTHER_RUNTIME_ACTIVE'});
          return send(202,await privateWallet.submit(body));
        });
        if (url.pathname === '/api/private/action') {
          if (['start','recover','refund','recoverRefund'].includes(body.action)) return await admitRuntime(async () => {
            const n = native.snapshot(), t = triple.snapshot();
            if (privateAccounts.snapshot().occupied || privateAccount.snapshot().occupied || privateCohort.snapshot().occupied || privateWallet.snapshot().occupied || n.busy || t.busy || n.runtime && !n.runtimeStopped || t.runtime && !t.runtimeStopped) return send(409, { error: 'PRIVATE_OTHER_RUNTIME_ACTIVE' });
            return send(202, await privatePayment.submit(body));
          });
          return send(202, await privatePayment.submit(body));
        }
        if (['/api/native/action', '/api/triple/action'].includes(url.pathname)) return await admitRuntime(async () => {
          if (privateAccounts.snapshot().occupied || privateAccount.snapshot().occupied || privateCohort.snapshot().occupied || privateWallet.snapshot().occupied || privatePayment.snapshot().busy) return send(409, { error: 'PRIVATE_OPERATION_IN_PROGRESS' });
          if (Object.keys(body).length !== 1 || !Object.hasOwn(body, 'action') || typeof body.action !== 'string') throw new Error('INVALID_NATIVE_COMMAND');
          return send(202, (url.pathname === '/api/triple/action' ? triple : native).submit(body.action));
        });
        if (Object.keys(body).some(k => !['action','hash','legId','order'].includes(k))) throw new Error('UNKNOWN_FIELD');
        let result;
        switch (body.action) {
          case 'create':
            if (body.order !== undefined && !['normal','bitcoin-first'].includes(body.order)) throw new Error('INVALID_ORDER');
            result = await sdk.openDemo(body.order === 'bitcoin-first' ? { order: ['bitcoin','solana','ethereum'] } : undefined); break;
          case 'execute': result = await sdk.executeSimulationLeg(body.hash, body.legId); break;
          case 'settle': result = await sdk.settle(body.hash); break;
          case 'fail': result = await sdk.fail(body.hash); break;
          case 'recover': {
            const current = await sdk.snapshot(); const op = current.state.operations.find(o => o.hash === body.hash);
            if (!op) throw new Error('UNKNOWN_GRAPH');
            now = Math.max(now, op.graph.expiresAt); result = await sdk.recover(body.hash); break;
          }
          default: throw new Error('UNKNOWN_ACTION');
        }
        return send(200, { revision: result.revision, hash: result.hash ?? body.hash, currentTime: now,
          ...(result.quarantined ? { quarantined:true,integrated:false,recorded:result.recorded,frozen:true,incidentId:result.incidentId,reason:result.reason } : {}) });
      } finally { if (globalAction) busy = false; }
    } catch (error) {
      // No payloads, keys, passwords, receipt bundles or stacks are logged.
      if (!res.headersSent) { const messageCode = /^([A-Z][A-Z0-9_]{1,100})(?:\n|$)/.exec(error.message ?? '')?.[1]; const safe = messageCode ?? (/^[A-Z][A-Z0-9_]{1,100}$/.test(error.code ?? '') ? error.code : 'REQUEST_REJECTED'); const status = /^(?:PRIVATE_STORE_(?:WRITE_UNCERTAIN|IO)|PRIVATE_STORAGE_UNAVAILABLE|PRIVATE_WALLET_STORAGE_UNAVAILABLE|PC24_STORAGE_UNAVAILABLE|PC24_STORAGE_READBACK|ACCOUNT_COHORT_STORAGE_UNAVAILABLE|ACCOUNT_COHORT_STORAGE_READBACK|ACCOUNT_COHORT_PUBLIC_READBACK|PC26_STORAGE_UNAVAILABLE|PC26_STORAGE_READBACK)$/.test(safe) ? 503 : /CONFLICT|LOCKED|IN_PROGRESS|ALREADY_OPEN|UNAVAILABLE|LIMIT|UNCERTAIN|ADMISSION_BUSY/.test(safe) ? 409 : /NOT_FOUND/.test(safe) ? 404 : 400; send(status, { error: safe }); } else res.destroy();
    }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
  try { await new Promise((done, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', done); }); }
  catch (error) { await Promise.all([privatePayment.close(),privateWallet.close(),privateCohort.close(),privateAccount.close(),privateAccounts.close()]); throw error; }
  origin = `http://127.0.0.1:${server.address().port}`;
  return { server, origin, session, native, triple, privatePayment, privateWallet, privateCohort, privateAccount, privateAccounts, close: async () => { const results = await Promise.allSettled([native.close(), triple.close(), privatePayment.close(), privateWallet.close(), privateCohort.close(), privateAccount.close(), privateAccounts.close()]); await new Promise((done, reject) => { server.closeAllConnections(); server.close(err => err ? reject(err) : done()); }); const failure = results.find(result => result.status === 'rejected'); if (failure) throw failure.reason; } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const instance = await startLocalServer();
  console.log(`Local research client: ${instance.origin}`);
  console.log('Local fake-assets wallet: private owner-independent payment with durable history, plus separate transparent and synthetic research panels. No public networks or real assets.');
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { await instance.close(); process.exit(0); });
}
