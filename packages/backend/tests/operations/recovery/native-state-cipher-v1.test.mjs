/** Real AES-GCM state reads, with no filesystem, runtime or proof authority.
 * This synthetic V1 frame was captured from the SOURCE implementation before
 * extraction. Its fixed test key and nonce contain no application state.
 */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "node:crypto";
import { canonical } from "@lianum/engine/crypto/privacy";
// Keep real AES/HMAC/entropy. Observe only the temporary emitted by the real
// decipher, so authentication failures cannot leave provisional data behind.
const provisionalBuffers = [];
mock.module("node:crypto", {
  exports: {
    randomBytes: crypto.randomBytes,
    createHmac: crypto.createHmac,
    createCipheriv: crypto.createCipheriv,
    createDecipheriv(...args) {
      const decipher = crypto.createDecipheriv(...args);
      const update = decipher.update.bind(decipher);
      decipher.update = (...input) => {
        const buffer = update(...input);
        provisionalBuffers.push(buffer);
        return buffer;
      };
      return decipher;
    },
  },
});
const { createNativeSourceStateCipherV1 } = await import(
  "../../../src/operations/recovery/source-journal/native-state-cipher-v1.mjs"
);
const vector = {
  secrets: {
    password:
      "1111111111111111111111111111111111111111111111111111111111111111",
    identity: {
      profile: "HOST_SOURCE_CIPHER_VECTOR_V1",
      directory: "/host-inert-source-vector",
      runId: "00000000-0000-4000-8000-000000000000",
      sourceSHA256:
        "5555555555555555555555555555555555555555555555555555555555555555",
      deadlineMs: 2000000000000,
    },
  },
  pin: {
    generation: 3,
    genesis: "7777777777777777777777777777777777777777777777777777777777777777",
    head: {
      number: "0x7",
      hash: "8888888888888888888888888888888888888888888888888888888888888888",
    },
  },
  plaintext: "public synthetic V1 state vector",
  ciphertext:
    "4c49414e554d5f4e41544956455f534f555243455f53544154455f563100000102030405060708090a0b18783fd9e1b3fac537e0a077edd063a2adc0f40c7a10b25e3da23434c240a382ef6ab42b61f72c0fa3a96e0480bf8c40",
};
const codec = createNativeSourceStateCipherV1(canonical);

test("the retained original V1 state frame remains readable", () => {
  const original = Buffer.from(vector.ciphertext, "hex");
  const clear = codec.decryptState(
    vector.secrets,
    "receiver",
    vector.pin,
    original,
  );
  try {
    assert.equal(clear.toString("utf8"), vector.plaintext);
  } finally {
    clear.fill(0);
    original.fill(0);
  }
});

test("state authentication binds the key, SOURCE identity, family, generation, genesis and head", () => {
  const original = Buffer.from(vector.ciphertext, "hex");
  try {
    for (const field of [
      "profile",
      "directory",
      "runId",
      "sourceSHA256",
      "deadlineMs",
    ]) {
      const secrets = structuredClone(vector.secrets);
      secrets.identity[field] =
        typeof secrets.identity[field] === "number"
          ? secrets.identity[field] + 1
          : secrets.identity[field] + "other";
      assert.throws(
        () => codec.decryptState(secrets, "receiver", vector.pin, original),
        field,
      );
    }
    assert.throws(() =>
      codec.decryptState(
        { ...vector.secrets, password: "22".repeat(32) },
        "receiver",
        vector.pin,
        original,
      ),
    );
    assert.throws(() =>
      codec.decryptState(vector.secrets, "graphNative", vector.pin, original),
    );
    for (const change of [
      (pin) => pin.generation++,
      (pin) => (pin.genesis = "99".repeat(32)),
      (pin) => (pin.head.number = "0x8"),
      (pin) => (pin.head.hash = "aa".repeat(32)),
    ]) {
      const pin = structuredClone(vector.pin);
      change(pin);
      assert.throws(() =>
        codec.decryptState(vector.secrets, "receiver", pin, original),
      );
    }
  } finally {
    original.fill(0);
  }
});

test("native state frames reject truncation and damaged header, nonce, tag or body", () => {
  const original = Buffer.from(vector.ciphertext, "hex");
  try {
    for (const length of [
      0,
      codec.overhead - 1,
      codec.overhead,
      original.length - 1,
    ])
      assert.throws(() =>
        codec.decryptState(
          vector.secrets,
          "receiver",
          vector.pin,
          original.subarray(0, length),
        ),
      );
    // The first nonce/tag positions and the final ciphertext byte exercise
    // distinct parts of the retained original frame, not only its header.
    for (const position of [
      0,
      codec.overhead - 28,
      codec.overhead - 16,
      original.length - 1,
    ]) {
      const damaged = Buffer.from(original);
      damaged[position] ^= 1;
      try {
        assert.throws(() =>
          codec.decryptState(vector.secrets, "receiver", vector.pin, damaged),
        );
      } finally {
        damaged.fill(0);
      }
    }
  } finally {
    original.fill(0);
  }
});

test("both native families use fresh frames without modifying caller plaintext", () => {
  const plaintext = Buffer.from(vector.plaintext),
    before = Buffer.from(plaintext);
  try {
    for (const family of ["receiver", "graphNative"]) {
      const first = codec.encryptState(
          vector.secrets,
          family,
          vector.pin,
          plaintext,
        ),
        second = codec.encryptState(
          vector.secrets,
          family,
          vector.pin,
          plaintext,
        );
      try {
        assert.equal(first.length, plaintext.length + codec.overhead);
        assert.notDeepEqual(first, second);
        const clear = codec.decryptState(
          vector.secrets,
          family,
          vector.pin,
          first,
        );
        try {
          assert.deepEqual(clear, before);
        } finally {
          clear.fill(0);
        }
        assert.deepEqual(plaintext, before);
      } finally {
        first.fill(0);
        second.fill(0);
      }
    }
  } finally {
    plaintext.fill(0);
    before.fill(0);
  }
});

test("authenticated and rejected reads erase provisional plaintext", () => {
  const original = Buffer.from(vector.ciphertext, "hex");
  try {
    const clear = codec.decryptState(
      vector.secrets,
      "receiver",
      vector.pin,
      original,
    );
    try {
      assert.equal(clear.toString(), vector.plaintext);
    } finally {
      clear.fill(0);
    }
    assert.ok(provisionalBuffers.at(-1).length > 0);
    assert.ok(provisionalBuffers.at(-1).every((byte) => byte === 0));
    assert.throws(() =>
      codec.decryptState(
        vector.secrets,
        "receiver",
        { ...vector.pin, genesis: "99".repeat(32) },
        original,
      ),
    );
    assert.ok(provisionalBuffers.at(-1).length > 0);
    assert.ok(provisionalBuffers.at(-1).every((byte) => byte === 0));
  } finally {
    original.fill(0);
  }
});
