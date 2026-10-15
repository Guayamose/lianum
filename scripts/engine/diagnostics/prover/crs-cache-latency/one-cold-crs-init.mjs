/** One frozen fulfill proof and one full proving-CRS encoding per fresh process. Never generates a proof. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateRunDirectory,readDerivedCache,writeDerivedCache} from './cache-files.mjs';
import {join} from 'node:path';
import {root,project,hash,guard,resources,filePin,verifyManifest,modes,capability,safeError} from './common.mjs';

const began = performance.now();
assert.equal(process.env.CC_SUPERVISED,'public-crs-only-v1','CC_SUPERVISOR_REQUIRED');
const emit = message => process.stdout.write(JSON.stringify(message)+'\n');
assert.equal(process.argv.length,6,'CC_FIXED_ARGUMENTS');
const [strategy,runDirectory,derivationSHA256,manifestSHA256] = process.argv.slice(2);
const mode = 'fulfill';
validateRunDirectory(runDirectory);
assert.match(manifestSHA256,/^[0-9a-f]{64}$/,'CC_MANIFEST_DIGEST');
assert.ok(Object.hasOwn(modes,mode),'CC_MODE');
assert.ok(['compressed','cached-uncompressed'].includes(strategy),'CC_STRATEGY');
assert.ok(strategy === 'compressed' ? derivationSHA256 === '-' : /^[0-9a-f]{64}$/.test(derivationSHA256),'CC_DERIVATION_ARGUMENT');
console.log = () => {};
const spec = modes[mode], timings = {}, metrics = {
  mode,strategy,target:spec.target,backend:'Wasm',threads:1,maximumPages:32768,skipSrsInit:true,
  zeroKnowledgeEnabled:true,startedAt:new Date().toISOString(),phase:'entered',
  noNewProof:true,noWitnessRead:true,noPrivateTupleExport:true,timingsMilliseconds:timings,stageResources:[],
};
emit({type:'entered'});
let api, proof, inputs, vk, wrongVK, pointsBuf, g2Point, returnedPoints;
const priorFetch = globalThis.fetch;
const phase = value => { metrics.phase = value; metrics.stageResources.push({phase:value,...guard()}); emit({type:'phase',phase:value}); };
try {
  phase('checking-source-pins'); let t = performance.now();
  metrics.manifestSHA256 = filePin(join(root,'pins.json'),{sha256:manifestSHA256}).sha256;
  const manifest = verifyManifest();
  timings.sourcePinChecks = performance.now() - t;
  globalThis.fetch = async () => { throw Error('CC_OFFLINE_REQUIRED'); };
  phase('module-import'); t = performance.now();
  const [bb,rs,pv,encoding,actors,engine] = await Promise.all([
    import('@aztec/bb.js'),import('../../../../../packages/proofs/programs/wallet-notes/resources.mjs'),import('../../../../../packages/proofs/programs/owner-independent/prover.mjs'),
    import('@lianum/engine/assembly/private-assembly-encoding'),import('@lianum/engine/assembly/private-assembly-actors'),
    import('../../../../../packages/backend/src/payments/private-payment-engine.mjs'),
  ]);
  timings.moduleImport = performance.now() - t;
  const {Barretenberg,BackendType,UltraHonkVerifierBackend,BN254_G1_GENERATOR} = bb;
  phase('checking-complete-capability-and-crs'); t = performance.now();
  metrics.toolchain = rs.verifyToolchain();
  const fixed = await engine.readFixedCapability(); // Existing complete trusted bootstrap checks, unchanged.
  const legacyBytes = readFileSync(join(project,capability.original)), currentBytes = readFileSync(join(project,capability.current));
  assert.equal(hash(legacyBytes),capability.originalSHA256,'CC_ORIGINAL_CAPABILITY_PIN');
  assert.equal(hash(currentBytes),capability.currentSHA256,'CC_CURRENT_CAPABILITY_PIN');
  const legacy = JSON.parse(legacyBytes), current = JSON.parse(currentBytes);
  assert.equal(current.reusedProofs[0].from,capability.originalRun,'CC_ORIGINAL_CAPABILITY_LINEAGE');
  assert.equal(current.previousCapabilitySHA256,hash(legacyBytes),'CC_ORIGINAL_CAPABILITY_LINEAGE');
  const record = fixed.proofs.find(p => p.mode === mode && p.verified === true);
  assert.ok(record,'CC_FIXED_CAPABILITY_MODE');
  metrics.crsIntegrity = rs.verifyCRS(); // Both strategies still validate the full 64 MiB G1 and original G2.
  assert.equal(metrics.crsIntegrity.provenanceSHA256,'99b2c91724ed797815dc0fd12112cf43be6a933b52f318dbf6c922441e4d984f','CC_CRS_PROVENANCE_PIN');
  const pins = pv.assemblyVerificationPins([mode])[mode];
  assert.equal(pins.target,spec.target,'CC_TARGET_PIN');
  assert.equal(pins.statementWords,spec.publicInputCount,'CC_STATEMENT_COUNT');
  const prepared = join(project,'experiments/private-core-proof/owner-independent/.local/prepared');
  const keyRecord = JSON.parse(readFileSync(join(prepared,mode+'.key.json')));
  assert.equal(keyRecord.maximumPages,32768,'CC_KEY_PAGE_PIN');
  assert.equal(keyRecord.circuitSHA256,record.circuitSHA256,'CC_CIRCUIT_PIN');
  assert.equal(keyRecord.sourceSHA256,record.sourceSHA256,'CC_CIRCUIT_SOURCE_PIN');
  assert.equal(keyRecord.keySHA256,record.verificationKeySHA256,'CC_KEY_PIN');
  vk = readFileSync(join(prepared,mode+'.vk'));
  wrongVK = readFileSync(join(prepared,spec.wrongKeyMode+'.vk'));
  const wrongKeyRecord = JSON.parse(readFileSync(join(prepared,spec.wrongKeyMode+'.key.json')));
  assert.equal(wrongKeyRecord.target,spec.target,'CC_WRONG_KEY_SAME_TARGET');
  assert.equal(hash(wrongVK),wrongKeyRecord.keySHA256,'CC_WRONG_KEY_SOURCE_PIN');
  assert.notEqual(hash(wrongVK),pins.keySHA256,'CC_WRONG_KEY_MUST_DIFFER');
  assert.equal(wrongVK.length,vk.length,'CC_WRONG_KEY_SAME_SHAPE');
  proof = readFileSync(join(project,spec.proof)); inputs = JSON.parse(readFileSync(join(project,spec.inputs)));
  filePin(join(project,spec.proof),manifest.files[spec.proof]);
  filePin(join(project,spec.inputs),manifest.files[spec.inputs]);
  assert.equal(proof.length,spec.proofBytes,'CC_PROOF_SIZE');
  assert.equal(inputs.length,spec.publicInputCount,'CC_INPUT_COUNT');
  assert.equal(hash(JSON.stringify(inputs)),spec.publicInputsSHA256,'CC_INPUT_ARRAY_PIN');
  function assertPackage(candidate, candidateVK = vk, target = spec.target) {
    assert.equal(target,pins.target,'CC_PACKAGE_TARGET');
    assert.equal(hash(candidateVK),pins.keySHA256,'CC_PACKAGE_FIXED_KEY');
    assert.ok(candidate.proof instanceof Uint8Array,'CC_PROOF_BYTES');
    assert.equal(candidate.proof.length,spec.proofBytes,'CC_PROOF_SIZE');
    encoding.assertAssemblyStatement(mode,candidate.publicInputs);
    const fields = values => values.map(v => BigInt(v).toString());
    actors.validateAssemblyProofPackage({version:1,mode,target,proofBase64:Buffer.from(candidate.proof).toString('base64'),
      publicInputs:fields(candidate.publicInputs)},mode);
  }
  const genuine = {proof,publicInputs:inputs};
  assertPackage(genuine);
  // Node 24 assertion messages append a diff; match the exact safe first line.
  const expectedGuard = code => error => error?.name === 'AssertionError' && error.message.split('\n',1)[0] === code;
  assert.throws(() => assertPackage(genuine,wrongVK),expectedGuard('CC_PACKAGE_FIXED_KEY'));
  assert.throws(() => assertPackage(genuine,vk,spec.target === 'evm' ? 'noir-recursive' : 'evm'),expectedGuard('CC_PACKAGE_TARGET'));
  metrics.pins = {sourceSHA256:record.sourceSHA256,circuitSHA256:pins.circuitSHA256,keySHA256:pins.keySHA256,
    proofSHA256:hash(proof),publicInputsSHA256:hash(JSON.stringify(inputs)),publicInputFileSHA256:manifest.files[spec.inputs].sha256,
    proofBytes:proof.length,publicInputCount:inputs.length,wrongKeySHA256:hash(wrongVK),
    recursiveVKFields:0,recursiveProofFields:0};
  metrics.hostRejections = {fixedKeyMismatch:true,targetMismatch:true};
  timings.completeCapabilityAndArtifactChecks = performance.now() - t;

  phase('api-construction'); t = performance.now();
  api = await Barretenberg.new({backend:BackendType.Wasm,threads:1,skipSrsInit:true,memory:{initial:37,maximum:32768}});
  timings.apiConstruction = performance.now() - t;
  phase('crs-buffer-preparation'); t = performance.now();
  const sourceLineage = {
    manifestSHA256:metrics.manifestSHA256,
    officialVersion:manifest.officialBarretenbergVersion,officialSourceCommit:manifest.officialSourceCommit,
    officialTarballSHA256:manifest.officialTarballSHA256,toolchain:metrics.toolchain,
    crsIntegrity:metrics.crsIntegrity,
    officialLoader:manifest.files['experiments/pc5-proof-probe/node_modules/@aztec/bb.js/src/barretenberg/index.ts'],
    officialCacheLoader:manifest.files['experiments/pc5-proof-probe/node_modules/@aztec/bb.js/src/crs/node/index.ts'],
    numPoints:2097152,derivedEncoding:'uncompressed-big-endian-x-y',derivedBytes:134217728,
  };
  let derived;
  if (strategy === 'compressed') pointsBuf = readFileSync(rs.CRS+'bn254_g1_compressed.dat');
  else {
    derived = readDerivedCache(runDirectory,derivationSHA256,sourceLineage);
    pointsBuf = derived.points; derived.points = undefined;
    metrics.derivedCache = derived.reference;
  }
  g2Point = readFileSync(rs.CRS+'bn254_g2.dat');
  const g1Pin = strategy === 'compressed' ? metrics.crsIntegrity.records[0] : derived.record.cache;
  assert.equal(pointsBuf.length,g1Pin.bytes,'CC_G1_SIZE'); assert.equal(hash(pointsBuf),g1Pin.sha256,'CC_G1_PIN');
  assert.equal(g2Point.length,128,'CC_G2_SIZE'); assert.equal(hash(g2Point),metrics.crsIntegrity.records[1].sha256,'CC_G2_PIN');
  metrics.initialization = {numPoints:2097152,g1Bytes:pointsBuf.length,g1SHA256:hash(pointsBuf),g2Bytes:g2Point.length,g2SHA256:hash(g2Point)};
  timings.crsBufferPreparation = performance.now() - t;
  phase('crs-initialization'); t = performance.now();
  let response = await api.srsInitSrs({pointsBuf,numPoints:2097152,g2Point});
  timings.crsInitialization = performance.now() - t;
  assert.ok(response.pointsBuf instanceof Uint8Array,'CC_OFFICIAL_RETURN_BUFFER');
  returnedPoints = response.pointsBuf;
  metrics.returnedUncompressedBytes = returnedPoints.length;
  phase('cache-result-validation'); t = performance.now();
  if (strategy === 'compressed') {
    assert.equal(returnedPoints.length,134217728,'CC_DERIVED_SIZE');
    const generator = Buffer.concat([BN254_G1_GENERATOR.x,BN254_G1_GENERATOR.y]);
    assert.deepEqual(Buffer.from(returnedPoints.subarray(0,64)),generator,'CC_DERIVED_FIRST_G1');
    metrics.derivedCache = writeDerivedCache(runDirectory,returnedPoints,sourceLineage);
  } else assert.equal(returnedPoints.length,0,'CC_UNCOMPRESSED_REDECOMPRESSION');
  timings.cacheValidationAndPersistence = performance.now() - t;
  returnedPoints.fill(0); returnedPoints = undefined; response = undefined;
  pointsBuf.fill(0); g2Point.fill(0); pointsBuf = g2Point = undefined;
  phase('verifier-construction'); t = performance.now();
  const verifier = new UltraHonkVerifierBackend(api);
  timings.verifierConstruction = performance.now() - t;
  async function verify(candidate) {
    assertPackage(candidate);
    return verifier.verifyProof({proof:candidate.proof,publicInputs:candidate.publicInputs,verificationKey:vk},{verifierTarget:spec.target});
  }
  phase('verify-genuine'); t = performance.now();
  assert.equal(await verify(genuine),true,'CC_GENUINE_PROOF_REJECTED');
  timings.genuineVerification = performance.now() - t;
  timings.throughPrimaryVerification = performance.now() - began;
  metrics.verified = true;
  emit({type:'primary',metrics});

  phase('reject-mutations'); metrics.cryptographicRejections = {};
  async function reject(name,operation) {
    const started = performance.now(); let verified,via;
    try { verified = await operation(); via = 'boolean'; } catch { verified = false; via = 'exception'; }
    assert.equal(verified,false,'CC_MUTATED_CANDIDATE_ACCEPTED');
    metrics.cryptographicRejections[name] = {rejected:true,via,milliseconds:performance.now()-started};
    const recoveryStarted = performance.now();
    assert.equal(await verify(genuine),true,'CC_VALID_AFTER_NEGATIVE_REJECTED');
    metrics.cryptographicRejections[name].validAfterward = true;
    metrics.cryptographicRejections[name].validAfterwardMilliseconds = performance.now() - recoveryStarted;
  }
  const corrupted = Uint8Array.from(proof); corrupted[corrupted.length-1] ^= 1;
  const corruptedPackage = {...genuine,proof:corrupted};
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
  proof?.fill(0); vk?.fill(0); wrongVK?.fill(0); pointsBuf?.fill(0); g2Point?.fill(0); returnedPoints?.fill(0);
  if (inputs) inputs.fill('0');
  globalThis.fetch = priorFetch;
  timings.workerTotal = performance.now() - began;
  metrics.resourceUsage = process.resourceUsage(); metrics.resourcesAfter = resources(); metrics.completedAt = new Date().toISOString();
  emit({type:'result',metrics});
}
