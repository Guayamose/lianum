/** Public proof-receipt framing for the original SOURCE account. These hashes
 * bind retained evidence to its exact proof and public inputs; they grant no
 * proof job, verification, custody, account or economic permission. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { decodeStatement } from "@lianum/components/encoding/statements";

/** @typedef {'deposit_balance'|'authorization'|'reservation'|'withdraw_balance'} SourceProofRelation */
/** @typedef {{proof:string|Uint8Array,publicInputs:readonly string[],metrics?:unknown,evidence?:unknown}} SourceProof */
/** @typedef {{proof:string,publicInputs:string[]}} TransportProof */
/** @typedef {{relation:SourceProofRelation,label:string,json:string,sha256:string,proofSHA256:string,publicInputsSHA256:string}} SourceProofReceiptFrame */
/** @param {Uint8Array} value */
const sourceReceiptSHA = (value) =>
  createHash("sha256").update(value).digest("hex");

/** @param {SourceProof} proof @returns {TransportProof} */
export const transportProof = (proof) => ({
  proof:
    Buffer.isBuffer(proof.proof) || proof.proof instanceof Uint8Array
      ? Buffer.from(proof.proof).toString("hex")
      : proof.proof,
  publicInputs: [...proof.publicInputs],
});

/** @param {{sha:(value:unknown)=>string,decodeWalletPoolInputs:(mode:'withdraw_balance',words:string[])=>unknown}} ports */
export function createOriginalNativeSourceProofReceiptCodecV1(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, ["sha", "decodeWalletPoolInputs"]);
  const { sha, decodeWalletPoolInputs } = ports;
  assert.equal(typeof sha, "function");
  assert.equal(typeof decodeWalletPoolInputs, "function");
  /** @param {SourceProofRelation} relation @param {string} label @param {SourceProof} proof
   * @returns {SourceProofReceiptFrame} */
  function sourceProofReceiptFrame(relation, label, proof) {
    assert.ok(
      [
        "deposit_balance",
        "authorization",
        "reservation",
        "withdraw_balance",
      ].includes(relation),
    );
    const transport = transportProof(proof);
    if (relation === "deposit_balance")
      assert.equal(transport.publicInputs.length, 26);
    else if (relation === "withdraw_balance") {
      assert.equal(transport.publicInputs.length, 39);
      decodeWalletPoolInputs(relation, transport.publicInputs);
    } else decodeStatement(relation, transport.publicInputs);
    // Fixed prover public metrics/evidence only; never the input, witness,
    // private job or callback envelope on the returned proof object.
    const evidence = ["deposit_balance", "withdraw_balance"].includes(relation)
      ? proof.metrics
      : proof.evidence;
    assert.ok(evidence && typeof evidence === "object");
    const json = JSON.stringify(evidence);
    assert.ok(
      Buffer.byteLength(json) <= 1024 * 1024,
      "NATIVE_SOURCE_ORIGINAL_PROOF_RECEIPT_BOUND",
    );
    return {
      relation,
      label,
      json,
      sha256: sourceReceiptSHA(Buffer.from(json)),
      proofSHA256: sourceReceiptSHA(Buffer.from(transport.proof, "hex")),
      publicInputsSHA256: sha(transport.publicInputs),
    };
  }

  /** @param {SourceProofReceiptFrame} frame @param {SourceProof} proof
   * @returns {{label:string,relation:SourceProofRelation,proof:TransportProof & {metrics?:unknown,evidence?:unknown}}} */
  function restoreSourceProofReceipt(frame, proof) {
    exactRecord(frame, [
      "relation",
      "label",
      "json",
      "sha256",
      "proofSHA256",
      "publicInputsSHA256",
    ]);
    assert.ok(
      [
        "deposit_balance",
        "authorization",
        "reservation",
        "withdraw_balance",
      ].includes(frame.relation),
    );
    assert.equal(typeof frame.json, "string");
    assert.ok(
      Buffer.byteLength(frame.json) <= 1024 * 1024,
      "NATIVE_SOURCE_ORIGINAL_PROOF_RECEIPT_BOUND",
    );
    assert.equal(sourceReceiptSHA(Buffer.from(frame.json)), frame.sha256);
    const transport = transportProof(proof);
    assert.equal(
      sourceReceiptSHA(Buffer.from(transport.proof, "hex")),
      frame.proofSHA256,
    );
    assert.equal(sha(transport.publicInputs), frame.publicInputsSHA256);
    /** @type {unknown} */
    const evidence = JSON.parse(frame.json);
    assert.equal(JSON.stringify(evidence), frame.json);
    return {
      label: frame.label,
      relation: frame.relation,
      proof: {
        ...transport,
        ...(["deposit_balance", "withdraw_balance"].includes(frame.relation)
          ? { metrics: evidence }
          : { evidence }),
      },
    };
  }

  return Object.freeze({ sourceProofReceiptFrame, restoreSourceProofReceipt });
}
