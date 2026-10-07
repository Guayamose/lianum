/** One fixed target and one SRS strategy per fresh process. Never generates a proof. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {root,project,hash,guard,resources,filePin,verifyManifest,modes,capability,safeError} from './common.mjs';

const began = performance.now();
assert.ok(process.send,'VL_SUPERVISOR_REQUIRED');
assert.equal(process.argv.length,4,'VL_FIXED_ARGUMENTS');
const [mode,strategy] = process.argv.slice(2);
assert.ok(Object.hasOwn(modes,mode),'VL_MODE');
assert.ok(['full','minimal'].includes(strategy),'VL_STRATEGY');
console.log = () => {};
const spec = modes[mode], timings = {}, metrics = {
  mode,strategy,target:spec.target,backend:'Wasm',threads:1,maximumPages:32768,skipSrsInit:true,
  zeroKnowledgeEnabled:true,startedAt:new Date().toISOString(),phase:'entered',
  noNewProof:true,noWitnessRead:true,noPrivateTupleExport:true,timingsMilliseconds:timings,stageResources:[],
};
process.send({type:'entered'});
let api, proof, inputs, vk, wrongVK, vkFields, proofFields, pointsBuf, g2Point;
const priorFetch = globalThis.fetch;
const phase = value => { metrics.phase = value; metrics.stageResources.push({phase:value,...guard()}); process.send({type:'phase',phase:value}); };
try {
  phase('checking-source-pins'); let t = performance.now();
  const manifest = verifyManifest();
  metrics.manifestSHA256 = filePin(join(root,'pins.json')).sha256;
  timings.sourcePinChecks = performance.now() - t;
  globalThis.fetch = async () => { throw Error('VL_OFFLINE_REQUIRED'); };
  phase('module-import'); t = performance.now();
  const [bb,rs,pv,encoding,actors,engine] = await Promise.all([
    import('@aztec/bb.js'),import('../wallet-notes/resources.mjs'),import('../owner-independent/prover.mjs'),
    import('../../../../packages/engine/src/assembly/private-assembly-encoding.mjs'),import('../../../../packages/engine/src/assembly/private-assembly-actors.mjs'),
    import('../../../../packages/engine/src/payments/private-payment-engine.mjs'),
  ]);
  timings.moduleImport = performance.now() - t;
  const {Barretenberg,BackendType,UltraHonkVerifierBackend,BN254_G1_GENERATOR,BN254_FR_MODULUS,deflattenFields} = bb;
  phase('checking-complete-capability-and-crs'); t = performance.now();
  metrics.toolchain = rs.verifyToolchain();
  const fixed = await engine.readFixedCapability(); // Existing complete trusted bootstrap checks, unchanged.
  const legacyBytes = readFileSync(join(project,capability.original)), currentBytes = readFileSync(join(project,capability.current));
  assert.equal(hash(legacyBytes),capability.originalSHA256,'VL_ORIGINAL_CAPABILITY_PIN');
  assert.equal(hash(currentBytes),capability.currentSHA256,'VL_CURRENT_CAPABILITY_PIN');
  const legacy = JSON.parse(legacyBytes), current = JSON.parse(currentBytes);
  assert.equal(current.reusedProofs[0].from,capability.originalRun,'VL_ORIGINAL_CAPABILITY_LINEAGE');
  assert.equal(current.previousCapabilitySHA256,hash(legacyBytes),'VL_ORIGINAL_CAPABILITY_LINEAGE');
  const record = fixed.proofs.find(p => p.mode === mode && p.verified === true);
  assert.ok(record,'VL_FIXED_CAPABILITY_MODE');
  metrics.crsIntegrity = rs.verifyCRS(); // Both strategies still validate the full 64 MiB G1 and original G2.
  assert.equal(metrics.crsIntegrity.provenanceSHA256,'99b2c91724ed797815dc0fd12112cf43be6a933b52f318dbf6c922441e4d984f','VL_CRS_PROVENANCE_PIN');
  const pins = pv.assemblyVerificationPins([mode])[mode];
  assert.equal(pins.target,spec.target,'VL_TARGET_PIN');
  assert.equal(pins.statementWords,spec.publicInputCount,'VL_STATEMENT_COUNT');
  const prepared = join(project,'experiments/private-core-proof/owner-independent/.local/prepared');
  const keyRecord = JSON.parse(readFileSync(join(prepared,mode+'.key.json')));
  assert.equal(keyRecord.maximumPages,32768,'VL_KEY_PAGE_PIN');
  assert.equal(keyRecord.circuitSHA256,record.circuitSHA256,'VL_CIRCUIT_PIN');
  assert.equal(keyRecord.sourceSHA256,record.sourceSHA256,'VL_CIRCUIT_SOURCE_PIN');
  assert.equal(keyRecord.keySHA256,record.verificationKeySHA256,'VL_KEY_PIN');
  vk = readFileSync(join(prepared,mode+'.vk'));
  wrongVK = readFileSync(join(prepared,spec.wrongKeyMode+'.vk'));
  const wrongKeyRecord = JSON.parse(readFileSync(join(prepared,spec.wrongKeyMode+'.key.json')));
  assert.equal(wrongKeyRecord.target,spec.target,'VL_WRONG_KEY_SAME_TARGET');
  assert.equal(hash(wrongVK),wrongKeyRecord.keySHA256,'VL_WRONG_KEY_SOURCE_PIN');
  assert.notEqual(hash(wrongVK),pins.keySHA256,'VL_WRONG_KEY_MUST_DIFFER');
  assert.equal(wrongVK.length,vk.length,'VL_WRONG_KEY_SAME_SHAPE');
  proof = readFileSync(join(project,spec.proof)); inputs = JSON.parse(readFileSync(join(project,spec.inputs)));
  filePin(join(project,spec.proof),manifest.files[spec.proof]);
  filePin(join(project,spec.inputs),manifest.files[spec.inputs]);
  assert.equal(proof.length,spec.proofBytes,'VL_PROOF_SIZE');
  assert.equal(inputs.length,spec.publicInputCount,'VL_INPUT_COUNT');
  assert.equal(hash(JSON.stringify(inputs)),spec.publicInputsSHA256,'VL_INPUT_ARRAY_PIN');
  if (mode === 'authorization') {
    const original = legacy.proofs.find(p => p.mode === mode && p.verified === true);
    assert.equal(original.target,'noir-recursive','VL_ORIGINAL_TARGET');
    assert.equal(hash(proof),original.proofSHA256,'VL_ORIGINAL_PROOF_PIN');
    assert.equal(hash(JSON.stringify(inputs)),original.publicInputsSHA256,'VL_ORIGINAL_INPUT_PIN');
    assert.equal(hash(vk),legacy.artifacts['static-authorization/verification-key.bin'].sha256,'VL_ORIGINAL_VK_PIN');
    vkFields = JSON.parse(readFileSync(join(prepared,'authorization.fields.json')));
    proofFields = deflattenFields(proof);
    assert.equal(vkFields.length,115,'VL_VK_FIELD_COUNT');
    assert.equal(proofFields.length,458,'VL_PROOF_FIELD_COUNT');
    assert.deepEqual(vkFields.map(BigInt),deflattenFields(vk).map(BigInt),'VL_VK_FIELD_BYTES');
    assert.deepEqual(vkFields.map(BigInt),pins.vkFields.map(BigInt),'VL_FIXED_VK_FIELDS');
    for (const field of [...vkFields,...proofFields,...inputs]) assert.ok(BigInt(field) >= 0n && BigInt(field) < BN254_FR_MODULUS,'VL_RECURSIVE_FIELD_RANGE');
  }
  function assertPackage(candidate, candidateVK = vk, target = spec.target) {
    assert.equal(target,pins.target,'VL_PACKAGE_TARGET');
    assert.equal(hash(candidateVK),pins.keySHA256,'VL_PACKAGE_FIXED_KEY');
    assert.ok(candidate.proof instanceof Uint8Array,'VL_PROOF_BYTES');
    assert.equal(candidate.proof.length,spec.proofBytes,'VL_PROOF_SIZE');
    encoding.assertAssemblyStatement(mode,candidate.publicInputs);
    if (mode === 'authorization') {
      assert.deepEqual(candidate.vkFields.map(BigInt),pins.vkFields.map(BigInt),'VL_PACKAGE_FULL_VK');
      assert.equal(candidate.proofFields.length,458,'VL_PACKAGE_PROOF_FIELDS');
      assert.deepEqual(candidate.proofFields.map(BigInt),deflattenFields(candidate.proof).map(BigInt),'VL_PACKAGE_PROOF_FIELD_BYTES');
    }
    const fields = values => values.map(v => BigInt(v).toString());
    actors.validateAssemblyProofPackage({version:1,mode,target,proofBase64:Buffer.from(candidate.proof).toString('base64'),
      publicInputs:fields(candidate.publicInputs),...(mode === 'authorization' ? {vkFields:fields(candidate.vkFields),proofFields:fields(candidate.proofFields)} : {})},mode);
  }
  const genuine = {proof,publicInputs:inputs,...(mode === 'authorization' ? {vkFields,proofFields} : {})};
  assertPackage(genuine);
  // Node 24 assertion messages append a diff; match the exact safe first line.
  const expectedGuard = code => error => error?.name === 'AssertionError' && error.message.split('\n',1)[0] === code;
  assert.throws(() => assertPackage(genuine,wrongVK),expectedGuard('VL_PACKAGE_FIXED_KEY'));
  assert.throws(() => assertPackage(genuine,vk,spec.target === 'evm' ? 'noir-recursive' : 'evm'),expectedGuard('VL_PACKAGE_TARGET'));
  if (mode === 'authorization') {
    const alteredFields = [...proofFields]; alteredFields[alteredFields.length-1] = (BigInt(alteredFields.at(-1)) ^ 1n).toString();
    assert.throws(() => assertPackage({...genuine,proofFields:alteredFields}),expectedGuard('VL_PACKAGE_PROOF_FIELD_BYTES'));
    const alteredVKFields = [...vkFields]; alteredVKFields[alteredVKFields.length-1] = (BigInt(alteredVKFields.at(-1)) ^ 1n).toString();
    assert.throws(() => assertPackage({...genuine,vkFields:alteredVKFields}),expectedGuard('VL_PACKAGE_FULL_VK'));
  }
  metrics.pins = {sourceSHA256:record.sourceSHA256,circuitSHA256:pins.circuitSHA256,keySHA256:pins.keySHA256,
    proofSHA256:hash(proof),publicInputsSHA256:hash(JSON.stringify(inputs)),publicInputFileSHA256:manifest.files[spec.inputs].sha256,
    proofBytes:proof.length,publicInputCount:inputs.length,wrongKeySHA256:hash(wrongVK),
    recursiveVKFields:vkFields?.length ?? 0,recursiveProofFields:proofFields?.length ?? 0};
  metrics.hostRejections = {fixedKeyMismatch:true,targetMismatch:true,...(mode === 'authorization' ? {proofFieldByteMismatch:true,fullVKFieldMismatch:true} : {})};
  timings.completeCapabilityAndArtifactChecks = performance.now() - t;

  phase('api-construction'); t = performance.now();
  api = await Barretenberg.new({backend:BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});
  timings.apiConstruction = performance.now() - t;
  phase('crs-buffer-preparation'); t = performance.now();
  pointsBuf = strategy === 'full' ? readFileSync(rs.CRS+'bn254_g1_compressed.dat') : Buffer.concat([BN254_G1_GENERATOR.x,BN254_G1_GENERATOR.y]);
  g2Point = readFileSync(rs.CRS+'bn254_g2.dat');
  const g1Pin = strategy === 'full' ? metrics.crsIntegrity.records[0] : {bytes:64,sha256:'d6ba9329f8932c12192b37849f772104d20048f76434a3290512d9d814e4116f'};
  assert.equal(pointsBuf.length,g1Pin.bytes,'VL_G1_SIZE'); assert.equal(hash(pointsBuf),g1Pin.sha256,'VL_G1_PIN');
  assert.equal(g2Point.length,128,'VL_G2_SIZE'); assert.equal(hash(g2Point),metrics.crsIntegrity.records[1].sha256,'VL_G2_PIN');
  metrics.initialization = {numPoints:strategy === 'full' ? 2097152 : 1,g1Bytes:pointsBuf.length,g1SHA256:hash(pointsBuf),g2Bytes:g2Point.length,g2SHA256:hash(g2Point)};
  timings.crsBufferPreparation = performance.now() - t;
  phase('crs-initialization'); t = performance.now();
  await api.srsInitSrs({pointsBuf,numPoints:metrics.initialization.numPoints,g2Point});
  timings.crsInitialization = performance.now() - t;
  pointsBuf.fill(0); g2Point.fill(0); pointsBuf = g2Point = undefined;
  phase('verifier-construction'); t = performance.now();
  const verifier = new UltraHonkVerifierBackend(api);
  timings.verifierConstruction = performance.now() - t;
  async function verify(candidate) {
    assertPackage(candidate);
    return verifier.verifyProof({proof:candidate.proof,publicInputs:candidate.publicInputs,verificationKey:vk},{verifierTarget:spec.target});
  }
  phase('verify-genuine'); t = performance.now();
  assert.equal(await verify(genuine),true,'VL_GENUINE_PROOF_REJECTED');
  timings.genuineVerification = performance.now() - t;
  timings.throughPrimaryVerification = performance.now() - began;
  metrics.verified = true;
  process.send({type:'primary',metrics});

  phase('reject-mutations'); metrics.cryptographicRejections = {};
  async function reject(name,operation) {
    const started = performance.now(); let verified,via;
    try { verified = await operation(); via = 'boolean'; } catch { verified = false; via = 'exception'; }
    assert.equal(verified,false,'VL_MUTATED_CANDIDATE_ACCEPTED');
    metrics.cryptographicRejections[name] = {rejected:true,via,milliseconds:performance.now()-started};
    const recoveryStarted = performance.now();
    assert.equal(await verify(genuine),true,'VL_VALID_AFTER_NEGATIVE_REJECTED');
    metrics.cryptographicRejections[name].validAfterward = true;
    metrics.cryptographicRejections[name].validAfterwardMilliseconds = performance.now() - recoveryStarted;
  }
  const corrupted = Uint8Array.from(proof); corrupted[corrupted.length-1] ^= 1;
  const corruptedPackage = {...genuine,proof:corrupted,...(mode === 'authorization' ? {proofFields:deflattenFields(corrupted)} : {})};
  assertPackage(corruptedPackage); // Shape/field guards must pass, so the real verifier decides this negative.
  await reject('mutatedProof',() => verify(corruptedPackage)); corrupted.fill(0);
  const alteredInputs = [...inputs]; alteredInputs[alteredInputs.length-1] = '0x'+(BigInt(alteredInputs.at(-1)) ^ 1n).toString(16).padStart(64,'0');
  const alteredPackage = {...genuine,publicInputs:alteredInputs}; assertPackage(alteredPackage);
  await reject('mutatedPublicInput',() => verify(alteredPackage));
  // A separate backend-level negative, in addition to the unchanged fixed-key host gate.
  // This is the only deliberately mismatched key call and can never report success.
  await reject('differentPinnedSameTargetVK',() => verifier.verifyProof({proof,publicInputs:inputs,verificationKey:wrongVK},{verifierTarget:spec.target}));
  metrics.phase = 'completed';
} catch (error) {
  metrics.failedPhase = metrics.phase; metrics.phase = 'failed'; metrics.failure = safeError(error); process.exitCode = 1;
} finally {
  const t = performance.now();
  if (api) try { await api.destroy(); } catch { metrics.cleanupError = true; process.exitCode = 1; metrics.phase = 'failed'; }
  timings.backendDestroy = performance.now() - t;
  proof?.fill(0); vk?.fill(0); wrongVK?.fill(0); pointsBuf?.fill(0); g2Point?.fill(0);
  if (inputs) inputs.fill('0'); if (vkFields) vkFields.fill('0'); if (proofFields) proofFields.fill('0');
  globalThis.fetch = priorFetch;
  timings.workerTotal = performance.now() - began;
  metrics.resourceUsage = process.resourceUsage(); metrics.resourcesAfter = resources(); metrics.completedAt = new Date().toISOString();
  process.send({type:'result',metrics},() => process.disconnect());
}
