/** One private receiver family per EVM backend. Constructors adopt only the
 * frames returned by their fixed core ports; no registration or brand setter is
 * exposed. SOURCE and ordered recovery share the same distinct issuer mark. */
import assert from 'node:assert/strict';
import {exactRecord} from '@lianum/components/encoding/commitments';

/** Synchronous capture fencing and exact-token cleanup. This mechanism owns no
 * runtime brand. The core supplies its original pin, quiescence and close ports. */
/** @typedef {{assertLive():void,preflight():void,capture(token:unknown):Promise<unknown>,abort(token:unknown):Promise<{closed:boolean,recoveryIncomplete:boolean}>}} CaptureControl */
/** @typedef {{close():Promise<unknown>}} ReceiverRuntime */
/** @typedef {{observationOnly:boolean,preflight():void,snapshot(opening:boolean):Promise<unknown>}} SourceControl */
/** @typedef {{runtime:ReceiverRuntime,capture:CaptureControl,source:SourceControl|null}} CoreFrame */
/** @param {{captureIdentity(token:unknown):unknown,assertAliveAndPin():void,assertUnfenced():void,assertQuiescent():void,
 * installFence(identity:unknown):void,captureRetained():Promise<unknown>,closeCaptured():Promise<void>}} ports
 * @returns {CaptureControl} */
export function createDeviceReceiverCaptureControlV1(ports){
  assert.equal(arguments.length,1);exactRecord(ports,['captureIdentity','assertAliveAndPin','assertUnfenced','assertQuiescent','installFence','captureRetained','closeCaptured']);
  const {captureIdentity,assertAliveAndPin,assertUnfenced,assertQuiescent,installFence,captureRetained,closeCaptured}=ports;
  /** @type {unknown} */
  let originalToken=null;
  return Object.freeze({
    // Identity/liveness is valid during the same original mutation. It cannot
    // enter capture, adopt a recovery token or bypass an installed fence.
    assertLive(){assertAliveAndPin();assert.ok(originalToken===null,'DEVICE_EXTERNAL_FLAT_RECEIVER_CAPTURE_FENCED');assertUnfenced();},
    preflight(){assertAliveAndPin();assertQuiescent();},
    capture(token){const identity=captureIdentity(token);assertAliveAndPin();
      assert.ok(originalToken===null,'DEVICE_EXTERNAL_FLAT_RECEIVER_CAPTURE_REQUIRES_QUIESCENCE');assertQuiescent();
      originalToken=token;installFence(identity);return captureRetained();},
    async abort(token){assert.ok(originalToken!==null,'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_CAPTURE_TOKEN');
      assert.equal(token,originalToken,'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_CAPTURE_TOKEN');
      await closeCaptured();return{closed:true,recoveryIncomplete:true};}
  });
}

/** @param {{createOrderedCore(record:object|null):Promise<CoreFrame>,createSourceCore(seed:unknown):Promise<CoreFrame>,
 * armRetention(runtime:ReceiverRuntime):Promise<unknown>,consumeOrderedSection(token:unknown):unknown,
 * consumeSourceSection(token:unknown):unknown,consumeSourceCheckpoint(token:unknown,runtime:unknown):{opening:boolean}}} ports */
export function buildDeviceReceiverFamilyV1(ports){
  assert.equal(arguments.length,1);exactRecord(ports,['createOrderedCore','createSourceCore','armRetention','consumeOrderedSection','consumeSourceSection','consumeSourceCheckpoint']);
  const {createOrderedCore,createSourceCore,armRetention,consumeOrderedSection,consumeSourceSection,consumeSourceCheckpoint}=ports;
  /** @type {WeakMap<object,CoreFrame>} */
  const originals=new WeakMap();
  /** @param {CoreFrame} frame @param {boolean} source */
  function adopt(frame,source){
    exactRecord(frame,['runtime','capture','source']);
    assert.ok(frame.runtime&&typeof frame.runtime.close==='function');
    assert.ok(frame.capture&&typeof frame.capture.assertLive==='function'&&typeof frame.capture.preflight==='function'&&typeof frame.capture.capture==='function'&&typeof frame.capture.abort==='function');
    assert.ok(!originals.has(frame.runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_REQUIRED');
    if(source)assert.ok(frame.source&&typeof frame.source.observationOnly==='boolean'&&typeof frame.source.preflight==='function'&&typeof frame.source.snapshot==='function','DEVICE_GRAPH_SOURCE_ORIGINAL_RECEIVER');
    else assert.equal(frame.source,null,'DEVICE_GRAPH_SOURCE_ORIGINAL_RECEIVER');
    originals.set(frame.runtime,frame);return frame.runtime;
  }
  /** @param {unknown} runtime */
  function original(runtime){assert.ok(runtime&&typeof runtime==='object','DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_REQUIRED');const frame=originals.get(runtime);assert.ok(frame,'DEVICE_EXTERNAL_FLAT_RECEIVER_ORIGINAL_REQUIRED');return frame;}
  /** @param {unknown} runtime */
  function source(runtime){assert.ok(runtime&&typeof runtime==='object','DEVICE_GRAPH_SOURCE_ORIGINAL_RECEIVER');const frame=originals.get(runtime);assert.ok(frame?.source,'DEVICE_GRAPH_SOURCE_ORIGINAL_RECEIVER');return frame.source;}
  async function create(){
    assert.equal(arguments.length,0);const runtime=adopt(await createOrderedCore(null),false);
    try{await armRetention(runtime);return runtime;}
    catch(error){try{await runtime.close();}catch(cleanup){throw new AggregateError([error,cleanup],'DEVICE_EXTERNAL_FLAT_RECEIVER_INITIAL_RETENTION_FAILED',{cause:error});}throw error;}
  }
  /** @param {unknown} token */
  async function reopen(token){
    assert.equal(arguments.length,1);const record=consumeOrderedSection(token);
    assert.ok(record&&typeof record==='object'&&'schema' in record&&'family' in record);assert.equal(record.schema,'OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3','DEVICE_EXTERNAL_FLAT_RECEIVER_FIXED_V3');assert.equal(record.family,'receiver');
    return adopt(await createOrderedCore(record),false);
  }
  /** @param {unknown} runtime */
  function assertReceiver(runtime){assert.equal(arguments.length,1);original(runtime).capture.preflight();}
  /** @param {unknown} runtime */
  function assertReceiverLive(runtime){assert.equal(arguments.length,1);original(runtime).capture.assertLive();}
  /** @param {unknown} runtime @param {unknown} token */
  function capture(runtime,token){assert.equal(arguments.length,2);return original(runtime).capture.capture(token);}
  /** @param {unknown} runtime @param {unknown} token */
  async function abort(runtime,token){assert.equal(arguments.length,2);return original(runtime).capture.abort(token);}
  /** @param {unknown} runtime */
  function assertDistinct(runtime){assert.equal(arguments.length,1);assert.ok(!runtime||typeof runtime!=='object'||!originals.has(runtime),'DEVICE_EXTERNAL_FLAT_RECEIVER_DISTINCT_ISSUER_REQUIRED');}
  async function createSource(){assert.equal(arguments.length,0);return adopt(await createSourceCore(null),true);}
  /** @param {unknown} token */
  async function reopenSource(token){assert.equal(arguments.length,1);return adopt(await createSourceCore(consumeSourceSection(token)),true);}
  /** @param {unknown} runtime */
  function assertSource(runtime){assert.equal(arguments.length,1);source(runtime).preflight();}
  /** @param {unknown} runtime @param {unknown} token */
  async function checkpointSource(runtime,token){assert.equal(arguments.length,2);const request=consumeSourceCheckpoint(token,runtime),state=source(runtime);assert.equal(state.observationOnly,request.opening,'DEVICE_GRAPH_SOURCE_ORIGINAL_RECEIVER');return state.snapshot(request.opening);}
  return Object.freeze({create,reopen,assertReceiver,assertReceiverLive,capture,abort,assertDistinct,createSource,reopenSource,assertSource,checkpointSource});
}
