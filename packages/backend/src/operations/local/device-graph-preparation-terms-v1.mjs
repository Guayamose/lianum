/** DATA validation after the canonical workspace membership check. No journal,
 * provider, proof, recipient or preparation capability is created here. */
import assert from "node:assert/strict";
import { types } from "node:util";
import {
  externalFlatExactV1,
  externalFlatUintV1,
} from "@lianum/mobile-protocol/device/source-note-v1";
/** @typedef {{assetAmount:string,shareAmount:string,payoutAmount:string,validFrom:string,settleBefore:string}} Terms
 * @typedef {{bridge:object,preparing:boolean,poisoned:boolean,maximumSolverInput:string,multi?:unknown,originalAave?:boolean,originalBlue?:boolean}} WorkspaceState */
/** @param {unknown} value @param {string} code */
const need = (value, code) => assert.ok(value, code);
/** @param {WorkspaceState} state @param {object} bridge @param {Terms} input */
export function validateDeviceGraphPreparationTermsV1(state, bridge, input) {
  assert.equal(arguments.length, 3);
  need(
    state.bridge === bridge && !state.preparing && !state.poisoned,
    "DEVICE_EXTERNAL_GRAPH_WORKSPACE_BINDING",
  );
  need(input && !types.isProxy(input), "DEVICE_EXTERNAL_GRAPH_TERMS");
  const raw = externalFlatExactV1(input, [
    "assetAmount",
    "shareAmount",
    "payoutAmount",
    "validFrom",
    "settleBefore",
  ]);
  const q = {
    assetAmount: externalFlatUintV1(raw.assetAmount),
    shareAmount: externalFlatUintV1(raw.shareAmount),
    payoutAmount: externalFlatUintV1(raw.payoutAmount),
    validFrom: externalFlatUintV1(raw.validFrom),
    settleBefore: externalFlatUintV1(raw.settleBefore),
  };
  /** @type {readonly (keyof Terms)[]} */ const amountKeys = [
    "assetAmount",
    "shareAmount",
    "payoutAmount",
  ];
  for (const key of amountKeys)
    need(BigInt(q[key]) > 0n, "DEVICE_EXTERNAL_GRAPH_TERMS");
  need(
    BigInt(q.assetAmount) <= BigInt(state.maximumSolverInput),
    "DEVICE_EXTERNAL_GRAPH_EXPLICIT_SOLVER_ALLOWANCE",
  );
  if (!state.multi && !state.originalAave && !state.originalBlue)
    need(
      q.assetAmount === state.maximumSolverInput,
      "DEVICE_EXTERNAL_GRAPH_EXACT_SOLVER_ALLOWANCE",
    );
  return q;
}
