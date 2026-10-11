/** Read access to an EVM backend's private recovery state. It owns no registry
 * and cannot install state or brand a runtime. The owner binds both readers. */
import assert from 'node:assert/strict';
import {exactRecord} from '@lianum/components/encoding/commitments';
/** @typedef {{preflight():void,fence(authority:unknown):void,
 * capture(token:unknown):Promise<unknown>,abort(token:unknown):Promise<unknown>}} RecoveryFence */
/** @param {{assertDistinctReceiver(runtime:object):void,readOriginalFence(runtime:object):RecoveryFence|undefined}} ports */
export function createNativeEconomicRecoveryAccessV1(ports){
  assert.equal(arguments.length,1);exactRecord(ports,['assertDistinctReceiver','readOriginalFence']);
  const {assertDistinctReceiver,readOriginalFence}=ports;
  /** @param {object} runtime */
  function original(runtime){assertDistinctReceiver(runtime);const state=readOriginalFence(runtime);assert.ok(state,'EVM_ECONOMIC_ORIGINAL_RUNTIME_REQUIRED');return state;}
  return Object.freeze({
    /** @param {object} runtime */
    assertRecoverable(runtime){assert.equal(arguments.length,1);original(runtime).preflight();},
    /** @param {object} runtime @param {unknown} authority */
    fence(runtime,authority){assert.equal(arguments.length,2);original(runtime).fence(authority);},
    /** @param {object} runtime @param {unknown} token */
    async capture(runtime,token){assert.equal(arguments.length,2);return original(runtime).capture(token);},
    /** @param {object} runtime @param {unknown} token */
    async abort(runtime,token){assert.equal(arguments.length,2);return original(runtime).abort(token);}
  });
}
