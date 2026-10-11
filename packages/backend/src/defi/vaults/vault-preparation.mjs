/** Durable vault preparation and manual requoting. The original adapter owns
 * custody, locking and persistence; these methods cannot submit a transaction. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
/** @typedef {{kind:string,amount:string,minimumOutput:string,deadline:string}} Intent */
/** @typedef {Intent & {nonce:string,previewOutput:string,[field:string]:unknown}} Action */
/** @typedef {{reference:string,action:Action,commitment:string,calldata:string,phase:string,approval:unknown,execution:unknown,quoteHistory?:Array<{action:Action,commitment:string,calldata:string}>}} Entry */
/** @typedef {{operations:Entry[],sendBlocked?:boolean,[field:string]:unknown}} State */
/** @typedef {{snapshot:unknown,senderAssets:string,senderShares:string,usedNonce:string}} View */
/** @template Result @param {{copy:<T>(value:T)=>T,id:unknown,sender:string,receiver:string,
 * maximumOperations:number,record():State,operation(reference:string):Entry,
 * update(reference:string,change:Partial<Entry>):Promise<void>,fresh():string,
 * prepareVaultAction(value:Record<string,unknown>):Action,vaultActionCommitment(action:Action):string,
 * encodeVaultCall(action:Action):string,readAt(at?:string,nonce?:string):Promise<{view:View}>,
 * result(reference:string):Result,write(transform:(state:State)=>State):Promise<void>,
 * hex(value:unknown):void,exclusive:<T>(work:()=>Promise<T>)=>Promise<T>,isSendUncertain():boolean}} ports */
export function createVaultPreparation(ports) {
  assert.equal(arguments.length, 1);
  exactRecord(ports, [
    "copy",
    "id",
    "sender",
    "receiver",
    "maximumOperations",
    "record",
    "operation",
    "update",
    "fresh",
    "prepareVaultAction",
    "vaultActionCommitment",
    "encodeVaultCall",
    "readAt",
    "result",
    "write",
    "hex",
    "exclusive",
    "isSendUncertain",
  ]);
  const {
    copy,
    id,
    sender,
    receiver,
    maximumOperations: MAX_OPERATIONS,
    record,
    operation,
    update,
    fresh,
    prepareVaultAction,
    vaultActionCommitment,
    encodeVaultCall,
    readAt,
    result,
    write,
    hex,
    exclusive,
    isSendUncertain,
  } = ports;
  for (const port of [
    copy,
    record,
    operation,
    update,
    fresh,
    prepareVaultAction,
    vaultActionCommitment,
    encodeVaultCall,
    readAt,
    result,
    write,
    hex,
    exclusive,
    isSendUncertain,
  ])
    assert.equal(typeof port, "function");
  /** @param {Intent} intent @param {string} reference */
  async function prepareOriginal(intent, reference) {
    const existing = record().operations.find(
      (item) => item.reference === reference,
    );
    if (existing) {
      // The caller's durable idempotency key binds the entire first request.
      // A new quote, deadline, amount or kind cannot replace that original.
      for (const key of /** @type {const} */ ([
        "kind",
        "amount",
        "minimumOutput",
        "deadline",
      ]))
        assert.equal(
          existing.action[key],
          intent[key],
          "OWNED_VAULT_PREPARATION_REBOUND",
        );
      return result(reference);
    }
    assert.ok(
      record().operations.length < MAX_OPERATIONS,
      "OWNED_VAULT_OPERATION_CAPACITY",
    );
    const nonce = fresh(),
      { view } = await readAt("latest", nonce);
    const action = prepareVaultAction({
      identity: id,
      ...intent,
      sender,
      owner: sender,
      receiver,
      nonce,
      quote: view.snapshot,
    });
    assert.ok(
      BigInt(action.amount) <=
        BigInt(
          action.kind === "deposit" ? view.senderAssets : view.senderShares,
        ),
      "OWNED_VAULT_SPEND_BALANCE",
    );
    const commitment = vaultActionCommitment(action),
      calldata = encodeVaultCall(action);
    await write((old) => ({
      ...old,
      operations: [
        ...old.operations,
        {
          reference,
          action,
          commitment,
          calldata,
          phase: "PREPARED",
          approval: null,
          execution: null,
        },
      ],
    }));
    return result(reference);
  }
  return Object.freeze({
    /** @param {Intent} request */
    async prepare(request) {
      assert.equal(arguments.length, 1);
      exactRecord(request, ["kind", "amount", "minimumOutput", "deadline"]);
      const intent = copy(request);
      return exclusive(() => prepareOriginal(intent, fresh()));
    },
    /** @param {Intent & {reference:string}} request */
    async prepareOnce(request) {
      assert.equal(arguments.length, 1);
      exactRecord(request, [
        "reference",
        "kind",
        "amount",
        "minimumOutput",
        "deadline",
      ]);
      hex(request.reference);
      const { reference, ...intent } = copy(request);
      return exclusive(() => prepareOriginal(intent, reference));
    },
    /** @param {{reference:string,minimumOutput:string,deadline:string}} request */
    async requoteUnsubmitted(request) {
      assert.equal(arguments.length, 1);
      exactRecord(request, ["reference", "minimumOutput", "deadline"]);
      hex(request.reference);
      const intent = copy(request);
      return exclusive(async () => {
        const entry = operation(intent.reference);
        assert.equal(
          entry.action.kind,
          "redeem",
          "OWNED_VAULT_REQUOTE_REDEEM_ONLY",
        );
        assert.ok(
          entry.phase === "PREPARED" &&
            entry.execution === null &&
            entry.approval === null,
          "OWNED_VAULT_REQUOTE_NEVER_SUBMITTED_REQUIRED",
        );
        assert.ok(
          !record().sendBlocked && !isSendUncertain(),
          "OWNED_VAULT_RUNTIME_SEND_BLOCKED",
        );
        if (
          entry.action.minimumOutput === intent.minimumOutput &&
          entry.action.deadline === intent.deadline
        )
          return result(intent.reference);
        assert.ok(
          (entry.quoteHistory?.length ?? 0) < 8,
          "OWNED_VAULT_REQUOTE_CAPACITY",
        );
        const { view } = await readAt("latest", entry.action.nonce);
        assert.equal(view.usedNonce, "0", "OWNED_VAULT_NONCE_ALREADY_USED");
        assert.ok(
          BigInt(view.senderShares) >= BigInt(entry.action.amount),
          "OWNED_VAULT_SPEND_BALANCE",
        );
        const { previewOutput: _previousPreview, ...previous } = entry.action;
        const action = prepareVaultAction({
          ...previous,
          minimumOutput: intent.minimumOutput,
          deadline: intent.deadline,
          quote: view.snapshot,
        });
        await update(intent.reference, {
          action,
          commitment: vaultActionCommitment(action),
          calldata: encodeVaultCall(action),
          quoteHistory: [
            ...(entry.quoteHistory ?? []),
            {
              action: entry.action,
              commitment: entry.commitment,
              calldata: entry.calldata,
            },
          ],
        });
        return result(intent.reference);
      });
    },
  });
}
