/** Actual isolated observation owner and real device signatures. Lower controllers
 * and readers are inert: no proof, funding, send or private credit is accepted. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createECDH, createPrivateKey, sign } from "node:crypto";
import * as DeviceClaim from "@lianum/mobile-protocol/device/native-claim-v1";
import { buildDeviceRootClaimObservationV3 as build } from "../../../src/claims/controller/device-root-claim-observation-v3.mjs";
import * as canonical from "../../../src/claims/controller/controller.mjs";
const h = (label) =>
  createHash("sha256")
    .update("SYNTHETIC-NATIVE-CLAIMS/" + label)
    .digest("hex");
const ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function fixtureSigner(index) {
  const d = Buffer.from(index.toString(16).padStart(64, "0"), "hex");
  const curve = createECDH("secp256k1");
  curve.setPrivateKey(d);
  const point = curve.getPublicKey(null, "uncompressed"),
    x = point.subarray(1, 33),
    y = point.subarray(33);
  const key = createPrivateKey({
    format: "jwk",
    key: {
      kty: "EC",
      crv: "secp256k1",
      d: d.toString("base64url"),
      x: x.toString("base64url"),
      y: y.toString("base64url"),
    },
  });
  return {
    publicKey: { x: x.toString("hex"), y: y.toString("hex") },
    sign(frame) {
      const signature = sign("sha256", frame, {
        key,
        dsaEncoding: "ieee-p1363",
      });
      const s = BigInt("0x" + signature.subarray(32).toString("hex"));
      if (s > ORDER / 2n)
        Buffer.from((ORDER - s).toString(16).padStart(64, "0"), "hex").copy(
          signature,
          32,
        );
      return signature.toString("hex");
    },
  };
}
test("HOST device-root original replacement observes SAME source, missing D27 binding stays UNKNOWN and effects stay denied", async () => {
  const controllers = new WeakMap(),
    intakes = new WeakMap();
  let resourceLoads = 0;
  const lower = {
    controllerState: (value) => controllers.get(value),
    intakeState: (value) => intakes.get(value),
    registerIntakeReference: (api, reference) => intakes.set(api, reference),
    loadAccountValidation: async () => {
      resourceLoads++;
      throw Error("HOST_NO_NEW_TRANSACTION_RESOURCE");
    },
  };
  const {
    controllerState,
    intakeState,
    registerIntakeReference,
    loadAccountValidation,
  } = lower;
  const signer = fixtureSigner(9),
    descriptor = DeviceClaim.normalizeDeviceRootClaimDescriptorV2({
      profile: DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_NOTE_V2,
      claim: {
        version: 1,
        profile: DeviceClaim.NATIVE_CLAIM_DEVICE_PAIRING_V1,
        origin: "https://127.0.0.1:2443",
        pairingId: h("root-pair"),
        devicePublicKey: "04" + signer.publicKey.x + signer.publicKey.y,
        accountScopeSHA256: h("scope"),
        lifetimeSHA256: h("lifetime"),
        claimDomain: h("domain"),
        nativeFamily: "1",
        nativeGenesis: h("genesis"),
        nativeAsset: h("native"),
        wrapperAssetIdentity: h("wrapper"),
        nativeSymbol: "BTC",
        claimSymbol: "cBTC",
        decimals: 8,
        atomicUnit: "satoshi",
        nativeAssetKind: null,
        mint: null,
      },
      pool: "11".repeat(20),
      scope: "12".repeat(32),
      policy: "13".repeat(32),
      recipient: "14".repeat(20),
      noteCustody: "DEVICE_ROOT_NOTE",
      nativeCustody: "BACKEND_LOCAL_QUORUM",
    });
  const old = Object.freeze({}),
    originalRuntime = Object.freeze({}),
    originalClaims = Object.freeze({}),
    originalKeeper = Object.freeze({}),
    originalReplacement = Object.freeze({
      async reconcile() {
        reconciles++;
      },
    });
  let reconciles = 0,
    reads = 0,
    financialPorts = 0;
  const source = {
      profile: descriptor.profile,
      descriptor,
      ownerIdentitySHA256: h("owner"),
      phase: "BORN",
      intentId: null,
      admissions: [],
    },
    data = {
      apiDeviceRootClaims: [structuredClone(source)],
      deposits: [],
      tickets: [],
    },
    journal = {
      async read() {
        return structuredClone(data);
      },
      async update() {
        financialPorts++;
        throw Error("HOST_NO_WRITE_PORT");
      },
      requiresReconciliation: () => false,
    };
  const ctx = {
    input: {
      runtime: originalRuntime,
      claims: originalClaims,
      keeper: originalKeeper,
    },
    live() {},
    journal,
    serial: async (f) => f(),
    controller: {
      async reconcile() {
        reconciles++;
      },
    },
    readers: [
      {
        async read() {
          reads++;
          return {
            head: { number: "0", hash: h("head"), timestamp: "0" },
            ledger: { commitments: [], nullifiers: [] },
          };
        },
        async assertCurrent() {},
      },
    ],
  };
  // These identities model the original producer's private map memberships;
  // they confer no owned runtime/claim/controller brand outside this HOST.
  controllers.set(old, { replacement: originalReplacement });
  controllers.set(originalReplacement, ctx);
  const seed = {
    controller: old,
    runtime: originalRuntime,
    claims: originalClaims,
    keeper: originalKeeper,
    descriptor,
    source: structuredClone(source),
    i: 0,
    asset: { assetId: h("asset") },
    ownerIdentitySHA256: source.ownerIdentitySHA256,
    used: false,
  };
  const contracts = {
      controllerState,
      intakeState,
      registerIntakeReference,
      loadAccountValidation,
    },
    owner = build(contracts),
    other = build(contracts),
    token = owner.issueOriginalObservationV3(seed),
    reopen = owner.reopenOriginalDeviceRootClaimObservationV3;
  assert.throws(() => build({ ...contracts, callerIssuer: () => ({}) }));
  assert.throws(() => build(contracts, {}));
  await assert.rejects(
    other.reopenOriginalDeviceRootClaimObservationV3(
      token,
      originalReplacement,
    ),
    /ORIGINAL_RESTART_REQUIRED/,
  );
  await assert.rejects(
    canonical.reopenOriginalDeviceRootClaimObservationV3(
      token,
      originalReplacement,
    ),
    /ORIGINAL_RESTART_REQUIRED/,
  );
  assert.throws(
    () => owner.retainOriginalDeviceRootClaimObservationV3({}),
    /ORIGINAL_INTAKE_REQUIRED/,
  );
  await assert.rejects(
    reopen({ ...token }, originalReplacement),
    /ORIGINAL_RESTART_REQUIRED/,
  );
  ctx.input = { ...ctx.input, runtime: Object.freeze({}) };
  await assert.rejects(
    reopen(token, originalReplacement),
    /ORIGINAL_RESTART_SOURCE/,
  );
  ctx.input.runtime = originalRuntime;
  const api = await reopen(token, originalReplacement);
  assert.throws(
    () => canonical.assertOriginalDeviceRootClaimIntakeV2(api),
    /ORIGINAL_INTAKE_REQUIRED/,
  );
  assert.throws(
    () => canonical.retainOriginalDeviceRootClaimObservationV3(api),
    /ORIGINAL_INTAKE_REQUIRED/,
  );
  await assert.rejects(
    reopen(token, originalReplacement),
    /ORIGINAL_RESTART_REQUIRED/,
  );
  assert.throws(() => api.quoteW39(), /REOPENED_OBSERVE_ONLY/);
  assert.throws(() => api.reviewD27(), /REOPENED_OBSERVE_ONLY/);
  assert.throws(() => api.effectChallenge(), /REOPENED_OBSERVE_ONLY/);
  const permission = api.challenge("READ"),
    signature = signer.sign(
      DeviceClaim.deviceRootClaimPermissionMessageV2(permission),
    ),
    view = await api.read({ permission, signature });
  assert.equal(view.note.state, "UNKNOWN");
  assert.equal(view.availablePrivateClaims, null);
  assert.equal(view.commitment, null);
  assert.equal(view.nullifier, null);
  assert.equal(reconciles, 1);
  assert.equal(reads, 1);
  assert.equal(financialPorts, 0);
  await assert.rejects(
    api.read({ permission, signature }),
    /ORIGINAL_PERMISSION/,
  );
  const changed = api.challenge("READ");
  data.apiDeviceRootClaims[0].ownerIdentitySHA256 = h("foreign-owner");
  await assert.rejects(
    api.read({
      permission: changed,
      signature: signer.sign(
        DeviceClaim.deviceRootClaimPermissionMessageV2(changed),
      ),
    }),
    /RETAINED_OBSERVATION_CHANGED/,
  );
  assert.equal(financialPorts, 0);
  assert.equal(resourceLoads, 0);
  await api.close();
  assert.throws(() => api.challenge("READ"), /INTAKE_CLOSED/);
});
