/** Whole retained-facts reader over explicit inert ports. Real actor, codec,
 * collector, key-use and independent-read coverage is in native-operators.evm
 * and combined-native-operators tests. This creates no authority capability. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { FACTS_SCHEMA } from "@lianum/engine/native/native-receipt-binding";

import { createOriginalFactsRetentionV2 } from "../../../src/operations/operators/claims/original-facts-retention-v2.mjs";
const makeRetention = ({ originalFactsCertificates, head, ...deps }) =>
  createOriginalFactsRetentionV2({
    schema: FACTS_SCHEMA,
    signerIndex: 1,
    record: () => {
      throw Error("FIXTURE_RECORD_REQUIRED");
    },
    encodeNativeFacts: deps.encodeNativeFacts,
    policies: { 2: {} },
    equal: assert.deepEqual,
    sha,
    retained() {},
    original: () => undefined,
    async serial(pool, work) {
      return work({ head }, async () => {});
    },
    healthAllowed() {},
    clearAudit() {},
    async auditAll() {},
    coverageFreshness: () => async () => {},
    ...deps,
  });
const makeValidator = (deps) =>
  makeRetention({
    ...deps,
    original: (certificate) => deps.originalFactsCertificates.get(certificate),
  }).validateOriginalFacts;
const copy = structuredClone,
  sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture() {
  const request = {
    family: "2",
    recipientIndex: "0",
    nativeId: "native",
    wireKeyCommitment: "wire",
  };
  const head = { number: "60", hash: "head", timestamp: "1000" };
  const facts = {
    family: "2",
    nativeGid: "gid",
    observation: {
      observedAt: "1000",
      evidenceFrom: "1000",
      evidenceUntil: "1120",
    },
  };
  // The real codec is exercised by original actors; isolate exact byte/window
  // comparison here so impossible retained states can test each private guard.
  const encodeNativeFacts = (facts) => Buffer.from(JSON.stringify(facts));
  const bytes = encodeNativeFacts(facts),
    certificate = {
      schema: FACTS_SCHEMA,
      signerIndex: "1",
      facts,
      frameHex: bytes.toString("hex"),
      digest: sha(bytes),
      signature: "original-signature",
    };
  const entry = {
    request: copy(request),
    facts: copy(facts),
    nativeWire: "original-wire",
    intent: { amount: "100" },
    maximumEvidenceUntil: "1120",
    signature: certificate.signature,
    status: "live",
    reason: null,
  };
  const record = {
    data: { adverse: {}, inventories: { 2: { state: { entries: [entry] } } } },
  };
  const original = copy({ certificate, request, head, entry });
  const deps = { record: () => record, head, encodeNativeFacts };
  const check = makeRetention(deps).originalFactsEntry;
  return {
    certificate,
    request,
    head,
    entry,
    original,
    record,
    check,
    run: () => check(certificate, request, head, original),
  };
}
test("graph facts V2: original retained request, bytes, signer, completed signature and bounds are exact", () => {
  const valid = fixture();
  assert.equal(valid.run(), valid.entry);
  for (const mutate of [
    (f) => {
      f.certificate.schema = "other";
    },
    (f) => {
      f.certificate.signerIndex = "2";
    },
    (f) => {
      f.certificate.frameHex = "00";
    },
    (f) => {
      f.certificate.digest = "changed";
    },
    (f) => {
      f.certificate.signature = "replacement";
    },
    (f) => {
      f.certificate.extra = true;
    },
    (f) => {
      f.request.wireKeyCommitment = "different";
    },
    (f) => {
      f.head.hash = "different";
    },
    (f) => {
      f.record.data.inventories["2"].state.entries = [];
    },
    (f) => {
      f.entry.signature = null;
    },
    (f) => {
      f.entry.signature = "replacement";
    },
    (f) => {
      f.entry.nativeWire = "replacement";
    },
    (f) => {
      f.entry.intent.amount = "101";
    },
    (f) => {
      f.entry.maximumEvidenceUntil = "1121";
    },
    (f) => {
      f.entry.status = "unknown";
    },
    (f) => {
      f.entry.status = "adverse";
    },
    (f) => {
      f.entry.reason = "UNKNOWN";
    },
    (f) => {
      f.record.data.adverse.gid = { reason: "ADVERSE" };
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(f.run);
  }
});
test("graph facts V2: original canonical certificate interval cannot be extended or expired", () => {
  for (const [from, until] of [
    ["1001", "1120"],
    ["990", "1000"],
  ]) {
    const f = fixture();
    Object.assign(f.entry.facts.observation, {
      evidenceFrom: from,
      evidenceUntil: until,
    });
    f.certificate.facts = copy(f.entry.facts);
    const bytes = Buffer.from(JSON.stringify(f.certificate.facts));
    f.certificate.frameHex = bytes.toString("hex");
    f.certificate.digest = sha(bytes);
    assert.throws(
      () => f.check(f.certificate, f.request, f.head),
      /ORIGINAL_FACTS_EXPIRED/,
    );
  }
  const f = fixture();
  f.entry.maximumEvidenceUntil = "1119";
  assert.throws(f.run, /ORIGINAL_FACTS_BOUND/);
});

test("graph facts V2: original object provenance is private and cannot be restored from serialized history", async () => {
  const f = fixture(),
    originals = new WeakMap([[f.certificate, f.original]]);
  let entered = 0,
    audited = 0,
    coverage = 0;
  const deps = {
    record: () => f.record,
    encodeNativeFacts: (value) => Buffer.from(JSON.stringify(value)),
    retained() {},
    originalFactsCertificates: originals,
    equal: assert.deepEqual,
    async serial(pool, work) {
      entered++;
      return work({ head: f.head }, async () => {});
    },
    healthAllowed() {},
    clearAudit() {},
    async auditAll() {
      audited++;
    },
    coverageFreshness: () => async () => {
      coverage++;
    },
  };
  const validate = makeValidator(deps);
  for (const value of [
    copy(f.certificate),
    JSON.parse(JSON.stringify(f.certificate)),
    {},
    null,
  ])
    assert.throws(
      () => validate(value, f.request, f.head),
      /ORIGINAL_FACTS_REQUIRED/,
    );
  assert.equal(entered, 0);
  assert.throws(() =>
    validate(f.certificate, { ...f.request, nativeId: "other" }, f.head),
  );
  assert.throws(() =>
    validate(f.certificate, f.request, { ...f.head, hash: "other" }),
  );
  assert.equal(await validate(f.certificate, f.request, f.head), undefined);
  assert.equal(audited, 1);
  assert.equal(coverage, 1);
  const reopened = makeValidator({
    ...deps,
    originalFactsCertificates: new WeakMap(),
  });
  assert.throws(
    () => reopened(f.certificate, f.request, f.head),
    /ORIGINAL_FACTS_REQUIRED/,
  );
  originals.delete(f.certificate);
  assert.throws(
    () => validate(f.certificate, f.request, f.head),
    /ORIGINAL_FACTS_REQUIRED/,
  );
});

test("graph facts V2: post-await exact original retention guard cannot be bypassed by changed or missing history", async () => {
  for (const mutate of [
    (f) => {
      f.entry.signature = null;
    },
    (f) => {
      f.entry.nativeWire = "changed";
    },
    (f) => {
      f.record.data.inventories["2"].state.entries = [];
    },
    (f) => {
      f.record.data.adverse.gid = {};
    },
  ]) {
    const f = fixture();
    let coverage = 0;
    const validate = makeValidator({
      record: () => f.record,
      encodeNativeFacts: (value) => Buffer.from(JSON.stringify(value)),
      retained() {},
      originalFactsCertificates: new WeakMap([[f.certificate, f.original]]),
      equal: assert.deepEqual,
      async serial(pool, work) {
        return work({ head: f.head }, async () => {});
      },
      healthAllowed() {},
      clearAudit() {},
      async auditAll() {},
      coverageFreshness: () => async () => {
        coverage++;
        mutate(f);
      },
    });
    await assert.rejects(validate(f.certificate, f.request, f.head));
    assert.equal(coverage, 1);
  }
});
