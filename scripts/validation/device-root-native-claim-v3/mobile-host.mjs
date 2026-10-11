/** Original mobile SDK/RootNote/protected PoP under declared Node infrastructure.
 * No Expo hardware, phone, React renderer or independent custody is accepted. */
import assert from "node:assert/strict";
import { request as httpsRequest, Agent } from "node:https";
import { createServer } from "node:net";
import { execFile } from "node:child_process";
import { mkdir, readFile, chmod, lstat, realpath } from "node:fs/promises";
import { createHash, X509Certificate } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDeviceRootClaimHostVaultV3 } from "../../../tests/integration/wallet/native/device-owner-reservation-host-vault-v1.mjs";
const PROJECT = fileURLToPath(new URL("../../../", import.meta.url));
const PREFIX = "/v1/mobile/native-claims/root-note/";
const hash = (b) => createHash("sha256").update(b).digest("hex");
async function port() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const n = server.address().port;
  await new Promise((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  return n;
}
export async function openOriginalDeviceRootClaimMobileHostV3(directory) {
  assert.equal(arguments.length, 1);
  assert.equal(await realpath(directory), directory);
  const st = await lstat(directory);
  assert.ok(
    st.isDirectory() &&
      !st.isSymbolicLink() &&
      st.uid === process.getuid() &&
      (st.mode & 0o777) === 0o700,
  );
  const tls = join(directory, "tls"),
    store = join(directory, "mobile-ciphertext");
  await mkdir(tls, { mode: 0o700 });
  const certificatePath = join(tls, "certificate.pem"),
    keyPath = join(tls, "private-key.pem");
  await new Promise((resolve, reject) =>
    execFile(
      "/usr/bin/openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:P-256",
        "-nodes",
        "-keyout",
        keyPath,
        "-out",
        certificatePath,
        "-days",
        "1",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
        "-addext",
        "basicConstraints=critical,CA:FALSE",
        "-addext",
        "keyUsage=critical,digitalSignature",
        "-addext",
        "extendedKeyUsage=serverAuth",
      ],
      { timeout: 5000, maxBuffer: 65536 },
      (e) =>
        e ? reject(Error("ROOT_CLAIM_HOST_TLS_CREATION_FAILED")) : resolve(),
    ),
  );
  await chmod(keyPath, 0o600);
  await chmod(certificatePath, 0o600);
  const certificate = await readFile(certificatePath, "utf8"),
    privateKey = await readFile(keyPath, "utf8"),
    leaf = new X509Certificate(certificate),
    origin = "https://127.0.0.1:" + (await port());
  const agent = new Agent({
      keepAlive: false,
      maxSockets: 1,
      ca: certificate,
      minVersion: "TLSv1.3",
      maxVersion: "TLSv1.3",
    }),
    running = new Set(),
    requests = new Set(),
    rows = [];
  let adapter,
    identity,
    descriptor,
    client,
    closed = false,
    closeWork;
  const drops = new Set(["WITHDRAW_W39", "PAYOUT_NATIVE"]);
  const live = () => assert.equal(closed, false, "ROOT_CLAIM_HOST_CLOSED");
  function fetch(target, options) {
    live();
    const url = new URL(target);
    assert.equal(url.origin, origin);
    assert.ok(url.pathname.startsWith(PREFIX));
    assert.equal(url.search, "");
    assert.equal(options.method, "POST");
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Origin, origin);
    assert.equal(typeof options.body, "string");
    assert.ok(Buffer.byteLength(options.body) <= 65536);
    const payload = JSON.parse(options.body),
      action =
        payload.permission?.action ??
        payload.action ??
        (url.pathname.endsWith("/exit-challenges") ? payload.action : null),
      raw = Buffer.from(options.body);
    let request;
    const work = new Promise((resolve, reject) => {
      let done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true;
        options.signal?.removeEventListener("abort", abort);
        raw.fill(0);
        if (error) reject(error);
        else resolve(value);
      };
      const abort = () => {
        request?.destroy();
        finish(Error("ROOT_CLAIM_HOST_REQUEST_ABORTED"));
      };
      try {
        request = httpsRequest(
          url,
          {
            method: "POST",
            agent,
            headers: { ...options.headers, "Content-Length": raw.length },
            rejectUnauthorized: true,
            minVersion: "TLSv1.3",
            maxVersion: "TLSv1.3",
            checkServerIdentity(_host, peer) {
              return peer.raw?.equals(leaf.raw)
                ? undefined
                : Error("ROOT_CLAIM_HOST_TLS_LEAF_CHANGED");
            },
          },
          (response) => {
            const chunks = [];
            let bytes = 0;
            response.on("data", (b) => {
              bytes += b.length;
              if (bytes > 65536) {
                request.destroy();
                finish(Error("ROOT_CLAIM_HOST_RESPONSE_CAP"));
              } else chunks.push(b);
            });
            response.once("error", (e) => finish(e));
            response.once("end", () => {
              if (done) return;
              try {
                live();
                const body = Buffer.concat(chunks),
                  status = response.statusCode;
                rows.push({
                  path: url.pathname.slice(PREFIX.length),
                  action: typeof action === "string" ? action : null,
                  status,
                  requestSHA256: hash(raw),
                  responseSHA256: hash(body),
                });
                if (status === 200 && drops.delete(action)) {
                  body.fill(0);
                  finish(Error("ROOT_CLAIM_HOST_ORIGINAL_RESPONSE_LOST"));
                  return;
                }
                const value = new Response(body, {
                  status,
                  headers: {
                    "content-type": response.headers["content-type"] ?? "",
                    "content-length": String(body.length),
                  },
                });
                Object.defineProperty(value, "url", { value: target });
                body.fill(0);
                finish(null, value);
              } catch (e) {
                finish(e);
              } finally {
                for (const c of chunks) c.fill(0);
              }
            });
          },
        );
        requests.add(request);
        request.once("close", () => requests.delete(request));
        request.once("error", (e) => finish(e));
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted) abort();
        else request.end(raw);
      } catch (e) {
        finish(e);
      }
    });
    running.add(work);
    work.finally(() => running.delete(work)).catch(() => {});
    return work;
  }
  try {
    adapter = await openDeviceRootClaimHostVaultV3({
      appRoot: join(PROJECT, "apps/mobile"),
      directory: store,
      fetch,
    });
    live();
    identity = await adapter.identity.createDeviceIdentity();
    live();
    return Object.freeze({
      original: adapter.original,
      identity: adapter.identity,
      configuration() {
        live();
        return {
          origin,
          devicePublicKey: identity,
          tls: { certificate, privateKey },
          host: "127.0.0.1",
        };
      },
      bind(next) {
        live();
        assert.equal(client, undefined, "ROOT_CLAIM_HOST_ONE_CLIENT");
        assert.equal(next.claim.origin, origin);
        assert.equal(next.claim.devicePublicKey, identity);
        descriptor = next;
        client = adapter.claim.createDeviceRootNativeClaimApiV2({
          descriptor: next,
          fetchImpl: fetch,
        });
        return client;
      },
      async resetClientAfterOriginalRestart(next) {
        live();
        assert.deepEqual(next, descriptor, "ROOT_CLAIM_HOST_PAIRING_CHANGED");
        client?.close();
        await Promise.allSettled([...running]);
        live();
        client = adapter.claim.createDeviceRootNativeClaimApiV2({
          descriptor: next,
          fetchImpl: fetch,
        });
        return client;
      },
      async sign(permission) {
        live();
        return permission.version === 3
          ? adapter.identity.signDeviceRootNativeClaimExitPermissionV3(
              permission,
              origin,
              descriptor.claim.pairingId,
            )
          : adapter.identity.signDeviceRootNativeClaimPermissionV2(
              permission,
              origin,
              descriptor.claim.pairingId,
            );
      },
      evidence() {
        live();
        return {
          ...adapter.evidence(),
          transport: structuredClone(rows),
          lostOriginalActions: ["WITHDRAW_W39", "PAYOUT_NATIVE"].filter(
            (a) => !drops.has(a),
          ),
          sameDevicePublicKey: identity,
          rootCustody: "DEVICE_ROOT_NOTE",
          nativeCustody: "BACKEND_LOCAL_QUORUM",
          physicalPhoneEstablished: false,
        };
      },
      close() {
        closed = true;
        client?.close();
        for (const r of requests) r.destroy();
        return (closeWork ??= (async () => {
          await Promise.allSettled([...running]);
          agent.destroy();
          adapter.close();
          return { closed: true, originalWorkDrained: true };
        })());
      },
    });
  } catch (error) {
    closed = true;
    client?.close();
    for (const r of requests) r.destroy();
    await Promise.allSettled([...running]);
    agent.destroy();
    adapter?.close();
    throw error;
  }
}
