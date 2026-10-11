/** Exact original public receipt data only. No prover, account lifetime,
 * native node, private opening or economic acceptance is created here. */
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { RELATIONS } from "@lianum/components/encoding/statements";
import {
  createOriginalNativeSourceProofReceiptCodecV1,
  transportProof,
} from "../../../src/accounts/authority/native-value/source-proof-receipts-v1.mjs";

import { sha } from "@lianum/engine/accounts/journal";
import { decodeWalletPoolInputs } from "@lianum/engine/wallet/notes/private-wallet-note-encoding";
const { sourceProofReceiptFrame, restoreSourceProofReceipt } =
  createOriginalNativeSourceProofReceiptCodecV1({
    sha,
    decodeWalletPoolInputs,
  });

const originalD26Frame = Object.freeze({
  relation: "deposit_balance",
  label: "original-d26",
  json: '{"selfVerified":true,"durationMs":1}',
  sha256: "6d84e6431b92611c4b56da58696777b864a3e310fe6f369362ce47811fe94e14",
  proofSHA256:
    "7d96d7695e682db39678927613404cc07f6b0590835a81b9453fed7276854d6e",
  publicInputsSHA256:
    "70fee9b35eef2770ec9d5acdba7440832d8f402bba030b2ccf1cc35eccb67a04",
});
const publicEvidence = () => ({ selfVerified: true, durationMs: 1 });
function fixture(relation = "deposit_balance") {
  const words =
    relation === "deposit_balance"
      ? 26
      : relation === "withdraw_balance"
        ? 39
        : RELATIONS[relation].wordCount;
  return {
    proof: Uint8Array.of(0, 171, 18),
    publicInputs: Array(words).fill("0"),
    metrics: publicEvidence(),
    evidence: publicEvidence(),
    get input() {
      assert.fail("HOST_PRIVATE_INPUT_MUST_NOT_BE_READ");
    },
    get witness() {
      assert.fail("HOST_PRIVATE_WITNESS_MUST_NOT_BE_READ");
    },
    callback() {
      assert.fail("HOST_CALLBACK_MUST_NOT_RUN");
    },
  };
}

test("original V1 D26 representation and hashes remain byte compatible", () => {
  const proof = fixture(),
    frame = sourceProofReceiptFrame("deposit_balance", "original-d26", proof);
  assert.deepEqual(frame, originalD26Frame);
  assert.deepEqual(restoreSourceProofReceipt(originalD26Frame, proof), {
    label: "original-d26",
    relation: "deposit_balance",
    proof: {
      proof: "00ab12",
      publicInputs: Array(26).fill("0"),
      metrics: publicEvidence(),
    },
  });
  const transport = transportProof(proof);
  assert.notEqual(transport.publicInputs, proof.publicInputs);
  assert.equal(typeof transport.proof, "string");
  proof.proof.fill(0);
  proof.publicInputs[0] = "1";
  assert.equal(transport.proof, "00ab12");
  assert.equal(transport.publicInputs[0], "0");
});

test("all four SOURCE receipt families retain only exact public evidence", () => {
  for (const relation of [
    "deposit_balance",
    "authorization",
    "reservation",
    "withdraw_balance",
  ]) {
    const proof = fixture(relation),
      frame = sourceProofReceiptFrame(relation, "original-" + relation, proof),
      restored = restoreSourceProofReceipt(frame, proof);
    const field = ["deposit_balance", "withdraw_balance"].includes(relation)
      ? "metrics"
      : "evidence";
    assert.deepEqual(
      Object.keys(restored.proof).sort(),
      ["proof", "publicInputs", field].sort(),
    );
    assert.deepEqual(restored.proof[field], publicEvidence());
    assert.equal(frame.json, originalD26Frame.json);
    assert.equal(restored.relation, relation);
    const incomplete = {
      ...transportProof(proof),
      metrics: proof.metrics,
      evidence: proof.evidence,
      publicInputs: proof.publicInputs.slice(1),
    };
    assert.throws(() =>
      sourceProofReceiptFrame(relation, "original", incomplete),
    );
  }
});

test("changed proof bytes, public inputs, evidence or receipt fields cannot restore the original", () => {
  const proof = fixture();
  for (const frame of [
    { ...originalD26Frame, json: "{}" },
    { ...originalD26Frame, sha256: "0".repeat(64) },
    { ...originalD26Frame, proofSHA256: "0".repeat(64) },
    { ...originalD26Frame, publicInputsSHA256: "0".repeat(64) },
    { ...originalD26Frame, relation: "node" },
    { ...originalD26Frame, privateInput: {} },
  ])
    assert.throws(() => restoreSourceProofReceipt(frame, proof));
  assert.throws(() =>
    restoreSourceProofReceipt(originalD26Frame, {
      ...transportProof(proof),
      proof: "ffab12",
    }),
  );
  assert.throws(() =>
    restoreSourceProofReceipt(originalD26Frame, {
      ...transportProof(proof),
      publicInputs: ["1", ...proof.publicInputs.slice(1)],
    }),
  );
  const json = '{ "selfVerified": true, "durationMs": 1 }';
  assert.throws(
    () =>
      restoreSourceProofReceipt(
        {
          ...originalD26Frame,
          json,
          sha256: createHash("sha256").update(json).digest("hex"),
        },
        proof,
      ),
    "noncanonical original JSON cannot be replaced by equivalent data",
  );
});

test("retained public evidence remains bounded before framing or restoration", () => {
  const proof = fixture();
  proof.metrics = { description: "x".repeat(1024 * 1024) };
  assert.throws(
    () => sourceProofReceiptFrame("deposit_balance", "original", proof),
    /ORIGINAL_PROOF_RECEIPT_BOUND/,
  );
  assert.throws(
    () =>
      restoreSourceProofReceipt(
        { ...originalD26Frame, json: "x".repeat(1024 * 1024 + 1) },
        proof,
      ),
    /ORIGINAL_PROOF_RECEIPT_BOUND/,
  );
});

test("public receipt DATA cannot become an original account or expose its retained proofs", async () => {
  const authority = await import(
    "../../../src/accounts/authority/native-value-account-authority-v2.mjs"
  );
  const frame = sourceProofReceiptFrame(
    "deposit_balance",
    "original-d26",
    fixture(),
  );
  for (const data of [
    frame,
    restoreSourceProofReceipt(frame, fixture()),
    Object.freeze({ profile: "NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1" }),
  ]) {
    assert.throws(() => authority.assertOwnedNativeValueAccountAuthority(data));
    await assert.rejects(
      authority.readOriginalNativeSourceProofReceiptsV1(data),
    );
  }
});
