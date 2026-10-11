/** Exact retained facts validation. The operator owns issuance, keys and maps;
 * this reader cannot create a certificate or restore its private provenance. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { inputUint } from "@lianum/components/plain-input";

/** @typedef {{family:string,recipientIndex:string,nativeId:string,wireKeyCommitment:string}} Request */
/** @typedef {{family:string,nativeGid:string,observation:{observedAt:string,evidenceFrom:string,evidenceUntil:string},[field:string]:unknown}} Facts */
/** @typedef {{schema:string,signerIndex:string,facts:Facts,frameHex:string,digest:string,signature:string}} Certificate */
/** @typedef {{request:Request,facts:Facts,nativeWire:unknown,intent:unknown,maximumEvidenceUntil:string,signature:string|null,status:string,reason:string|null}} Entry */
/** @typedef {{number:string,hash:string,timestamp:string}} Head */
/** @typedef {{head:Head,[field:string]:unknown}} View */
/** @typedef {{certificate:Certificate,request:Request,head:Head,entry:Entry}} Original */
/** @typedef {() => Promise<void>} Freshness */
/** @typedef {{data:{inventories:Record<string,{state:{entries:Entry[]}}>,adverse:Record<string,unknown>}}} RecordState */

/** @param {{schema:string,signerIndex:number,record():RecordState,
 * encodeNativeFacts(facts:Facts,policy:unknown):Buffer,policies:Record<string,unknown>,
 * equal(left:unknown,right:unknown,message?:string):void,sha(bytes:Buffer):string,
 * retained():unknown,original(certificate:Certificate):Original|undefined,
 * serial(pool:number,work:(view:View,freshness:Freshness)=>Promise<void>):Promise<void>,
 * healthAllowed(view:View):void,clearAudit(report:unknown):void,
 * auditAll(view:View,freshness:Freshness):Promise<unknown>,
 * coverageFreshness(view:View,freshness:Freshness):Freshness}} ports */
export function createOriginalFactsRetentionV2(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, [
    "schema",
    "signerIndex",
    "record",
    "encodeNativeFacts",
    "policies",
    "equal",
    "sha",
    "retained",
    "original",
    "serial",
    "healthAllowed",
    "clearAudit",
    "auditAll",
    "coverageFreshness",
  ]);
  const {
    schema,
    signerIndex,
    record,
    encodeNativeFacts,
    policies,
    equal,
    sha,
    retained,
    original: getOriginal,
    serial,
    healthAllowed,
    clearAudit,
    auditAll,
    coverageFreshness,
  } = ports;
  for (const port of [
    record,
    encodeNativeFacts,
    equal,
    sha,
    retained,
    getOriginal,
    serial,
    healthAllowed,
    clearAudit,
    auditAll,
    coverageFreshness,
  ])
    assert.equal(typeof port, "function");

  /** @param {Certificate} certificate @param {Request} request @param {Head} head @param {Original|null} [original] */
  function originalFactsEntry(certificate, request, head, original = null) {
    exactRecord(certificate, [
      "schema",
      "signerIndex",
      "facts",
      "frameHex",
      "digest",
      "signature",
    ]);
    assert.equal(
      certificate.schema,
      schema,
      "FLAT_OPERATOR_ORIGINAL_FACTS_SCHEMA",
    );
    assert.equal(
      certificate.signerIndex,
      String(signerIndex),
      "FLAT_OPERATOR_ORIGINAL_FACTS_SIGNER",
    );
    assert.equal(
      certificate.facts.family,
      request.family,
      "FLAT_OPERATOR_ORIGINAL_FACTS_FAMILY",
    );
    const state = record().data;
    const entry = state.inventories[request.family].state.entries.find(
      (value) => value.facts.nativeGid === certificate.facts.nativeGid,
    );
    assert.ok(entry && entry.signature, "FLAT_OPERATOR_ORIGINAL_FACTS_MISSING");
    equal(entry.request, request);
    equal(entry.facts, certificate.facts);
    assert.equal(
      entry.signature,
      certificate.signature,
      "FLAT_OPERATOR_ORIGINAL_FACTS_SIGNATURE",
    );
    assert.ok(
      entry.status === "live" &&
        entry.reason === null &&
        !state.adverse[entry.facts.nativeGid],
      "FLAT_OPERATOR_ORIGINAL_FACTS_NOT_LIVE",
    );
    const bytes = encodeNativeFacts(entry.facts, policies[request.family]);
    assert.equal(
      certificate.frameHex,
      bytes.toString("hex"),
      "FLAT_OPERATOR_ORIGINAL_FACTS_FRAME",
    );
    assert.equal(
      certificate.digest,
      sha(bytes),
      "FLAT_OPERATOR_ORIGINAL_FACTS_DIGEST",
    );
    const at = inputUint(head.timestamp),
      observation = entry.facts.observation;
    assert.equal(
      observation.observedAt,
      head.timestamp,
      "FLAT_OPERATOR_ORIGINAL_FACTS_HEAD",
    );
    assert.ok(
      inputUint(observation.evidenceFrom) <= at &&
        at < inputUint(observation.evidenceUntil),
      "FLAT_OPERATOR_ORIGINAL_FACTS_EXPIRED",
    );
    assert.ok(
      inputUint(entry.maximumEvidenceUntil) >=
        inputUint(observation.evidenceUntil),
      "FLAT_OPERATOR_ORIGINAL_FACTS_BOUND",
    );
    if (original) {
      equal(certificate, original.certificate);
      equal(request, original.request);
      equal(head, original.head);
      for (const name of /** @type {const} */ ([
        "request",
        "nativeWire",
        "intent",
        "facts",
        "maximumEvidenceUntil",
        "signature",
      ]))
        equal(
          entry[name],
          original.entry[name],
          "FLAT_OPERATOR_ORIGINAL_FACTS_ENTRY_CHANGED",
        );
    }
    return entry;
  }
  /** @param {Certificate} certificate @param {Request} request @param {Head} expectedHead */
  function validateOriginalFacts(certificate, request, expectedHead) {
    retained();
    const original = getOriginal(certificate);
    assert.ok(original, "FLAT_OPERATOR_ORIGINAL_FACTS_REQUIRED");
    equal(request, original.request);
    equal(expectedHead, original.head);
    return serial(0, async (view, freshness) => {
      equal(view.head, original.head);
      healthAllowed(view);
      originalFactsEntry(certificate, request, view.head, original);
      clearAudit(await auditAll(view, freshness));
      await coverageFreshness(view, freshness)();
      originalFactsEntry(certificate, request, view.head, original);
      await freshness();
    });
  }
  return Object.freeze({ originalFactsEntry, validateOriginalFacts });
}
