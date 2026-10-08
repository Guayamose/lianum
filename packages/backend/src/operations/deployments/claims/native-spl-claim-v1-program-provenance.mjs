/** Pure provenance check of NEW public compiler output. No file is rewritten,
 * no historical programme is published and no key/proof authority is minted. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {ROOT,NOIR_VERSION} from '../../../../../proofs/src/catalog.mjs';
export const NATIVE_SPL_CLAIM_V1_PRODUCED_PROGRAM_PINS=Object.freeze({"rawBytes":1265928,"rawSHA256":"c2def3ef9056a339521de1e580e46abaf6dacca15f2f9b0b9687db5aa869f6a5","bytecodeSHA256":"97b8ee566479f1e13c1ee7cb45135128bfbb310763309cbc6f5a3c6ee1b702b4","bytecodeBytes":605684,"uncompressedBytecodeSHA256":"ac0c09cf8ac426ae4da0da621a93f7db5de2615205f92502d955f9de6fdd9020","uncompressedBytecodeBytes":9289617,"abiSHA256":"72cf6e7bcdcaef5197debc822b3a134ab712cff0c5872e1322b48e42aeaff8bd","noirVersion":"1.0.0-beta.25+75061fab15986eedee4e7d9104ff87dd9fa4ca10","programHash":"1753768340","debugSymbolsSHA256":"2826d4fd556acccd20c81b49aa443c4995e806550ecefa58db5d96da7e03e73e","fileMapSHA256":"916d047949f58a112baa251fd347ada9996cba4464cb563dcd24192da7d558a2","originalProgrammeSHA256":"c418794daae0160e0f5acfe1dc5f3a1f65bb6a8312c2118a9b4e05a39cc44edf","originalProgrammeBytes":1265865,"originalMainPath":"/workspace/scratch/770c47ebf757/omnichain-flat-profile/flat-wallet/proof-relations/native-claim-ingress/src/main.nr"});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Fixed literal pins; the input is public bytes, never a caller path/profile.
 * Returning this metadata alone establishes no original artifact authority. */
export function assertNativeSplClaimV1ProducedProgramBytesV1(raw){
 assert.equal(arguments.length,1,'SPL_CLAIM_V1_PROGRAM_NO_OPTIONS');assert.ok(Buffer.isBuffer(raw),'SPL_CLAIM_V1_PROGRAM_BYTES');const p=NATIVE_SPL_CLAIM_V1_PRODUCED_PROGRAM_PINS;
 assert.equal(raw.length,p.rawBytes,'SPL_CLAIM_V1_NEW_RAW_PROGRAM_SIZE');assert.equal(sha(raw),p.rawSHA256,'SPL_CLAIM_V1_NEW_RAW_PROGRAM_PIN');
 const program=JSON.parse(raw);assert.deepEqual(Object.keys(program),['noir_version','hash','abi','bytecode','debug_symbols','file_map']);assert.equal(program.noir_version,NOIR_VERSION);assert.equal(program.noir_version,p.noirVersion);assert.equal(program.hash,p.programHash);
 const compressed=Buffer.from(program.bytecode,'base64');assert.equal(compressed.toString('base64'),program.bytecode);assert.equal(compressed.length,p.bytecodeBytes);assert.equal(sha(compressed),p.bytecodeSHA256);const acir=gunzipSync(compressed,{maxOutputLength:p.uncompressedBytecodeBytes});assert.equal(acir.length,p.uncompressedBytecodeBytes);assert.equal(sha(acir),p.uncompressedBytecodeSHA256);
 assert.equal(sha(JSON.stringify(program.abi)),p.abiSHA256);assert.equal(sha(program.debug_symbols),p.debugSymbolsSHA256);assert.equal(sha(JSON.stringify(program.file_map)),p.fileMapSHA256);
 const currentPath=join(ROOT,'proof-relations/native-claim-ingress/src/main.nr');assert.equal(program.file_map['52'].path,currentPath,'SPL_CLAIM_V1_ACTUAL_MAIN_PATH');
 const before=Buffer.from(currentPath),first=raw.indexOf(before);assert.ok(first>=0&&raw.indexOf(before,first+before.length)===-1,'SPL_CLAIM_V1_EXACTLY_ONE_DIAGNOSTIC_PATH');
 // This bounded in-memory preimage verifies the independently recovered hash.
 // It is neither returned nor written; all consumers keep the fresh raw bytes.
 const historicalPreimage=Buffer.concat([raw.subarray(0,first),Buffer.from(p.originalMainPath),raw.subarray(first+before.length)]);
 assert.equal(historicalPreimage.length,p.originalProgrammeBytes);assert.equal(sha(historicalPreimage),p.originalProgrammeSHA256,'SPL_CLAIM_V1_ORIGINAL_PATH_PREIMAGE');
 return Object.freeze({classification:'NEW_ORIGINAL_CI51_V1_RAW_PROGRAM_WITH_PATH_PROVENANCE',rawProgrammeSHA256:p.rawSHA256,rawProgrammeBytes:p.rawBytes,originalProgrammeSHA256:p.originalProgrammeSHA256,originalProgrammeBytes:p.originalProgrammeBytes,bytecodeSHA256:p.bytecodeSHA256,abiSHA256:p.abiSHA256,uncompressedBytecodeSHA256:p.uncompressedBytecodeSHA256,debugSymbolsSHA256:p.debugSymbolsSHA256,difference:Object.freeze({field:'file_map.52.path',currentPath,originalPath:p.originalMainPath,occurrences:1}),originalPathPreimageVerified:true,historicalProgrammeRawBytesRecovered:false,historicalRawProgrammeEqualityEstablished:false,historicalVkEqualityEstablished:false,programmeRewritten:false});
}
