/** SOURCE native state framing. This codec owns no journal, runtime, recovery
 * token or authority; its caller owns the authenticated identity and pins.
 * Keep the original V1 key derivation, AAD and AES-GCM wire bytes unchanged.
 */
import assert from "node:assert/strict";
import {
  randomBytes,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";

/** @typedef {'receiver'|'graphNative'} NativeFamily */
/** @typedef {{profile:string,directory:string,runId:string,sourceSHA256:string,deadlineMs:number}} SourceIdentity */
/** @typedef {{password:string,identity:SourceIdentity}} SourceSecrets */
/** @typedef {{generation:number,genesis:string,head:unknown}} NativeStatePin */
const MAGIC = Buffer.from("LIANUM_NATIVE_SOURCE_STATE_V1\0");
const NONCE_BYTES = 12,
  TAG_BYTES = 16;
const OVERHEAD = MAGIC.length + NONCE_BYTES + TAG_BYTES;

/** @param {(value:unknown)=>string} canonical */
export function createNativeSourceStateCipherV1(canonical) {
  assert.equal(arguments.length, 1);
  assert.equal(typeof canonical, "function");

  /** @param {SourceSecrets} source @param {NativeFamily} family @param {number} generation */
  function stateKey(source, family, generation) {
    const secret = Buffer.from(source.password, "hex");
    try {
      return createHmac("sha256", secret)
        .update("LIANUM_NATIVE_SOURCE_STATE_V1/" + family + "/" + generation)
        .digest();
    } finally {
      secret.fill(0);
    }
  }

  /** @param {SourceIdentity} identity @param {NativeFamily} family @param {NativeStatePin} pin */
  function stateAAD(identity, family, pin) {
    return Buffer.from(
      canonical({
        identity,
        family,
        generation: pin.generation,
        genesis: pin.genesis,
        head: pin.head,
      }),
    );
  }

  /** @param {SourceSecrets} source @param {NativeFamily} family
   * @param {NativeStatePin} pin @param {Buffer} plaintext */
  function encryptState(source, family, pin, plaintext) {
    const key = stateKey(source, family, pin.generation);
    const nonce = randomBytes(NONCE_BYTES);
    try {
      const cipher = createCipheriv("aes-256-gcm", key, nonce);
      cipher.setAAD(stateAAD(source.identity, family, pin));
      const encrypted = Buffer.concat([
        cipher.update(plaintext),
        cipher.final(),
      ]);
      try {
        return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), encrypted]);
      } finally {
        encrypted.fill(0);
      }
    } finally {
      key.fill(0);
      nonce.fill(0);
    }
  }

  /** @param {SourceSecrets} source @param {NativeFamily} family
   * @param {NativeStatePin} pin @param {Buffer} bytes */
  function decryptState(source, family, pin, bytes) {
    assert.ok(
      bytes.length > OVERHEAD && bytes.subarray(0, MAGIC.length).equals(MAGIC),
      "NATIVE_SOURCE_NATIVE_FRAME",
    );
    const key = stateKey(source, family, pin.generation);
    try {
      const cipher = createDecipheriv(
        "aes-256-gcm",
        key,
        bytes.subarray(MAGIC.length, MAGIC.length + NONCE_BYTES),
      );
      cipher.setAAD(stateAAD(source.identity, family, pin));
      cipher.setAuthTag(bytes.subarray(MAGIC.length + NONCE_BYTES, OVERHEAD));
      const provisional = cipher.update(bytes.subarray(OVERHEAD));
      try {
        return Buffer.concat([provisional, cipher.final()]);
      } finally {
        // GCM emits provisional plaintext before its final tag check. Release
        // that temporary on success and on authentication failure alike.
        provisional.fill(0);
      }
    } finally {
      key.fill(0);
    }
  }

  return Object.freeze({ overhead: OVERHEAD, encryptState, decryptState });
}
