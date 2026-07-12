import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { SecretStore } from "../apps/api-gateway/src/ai-connections/secret-store.ts";

const masterKey = () => randomBytes(32).toString("base64");

describe("AI connection secret store", () => {
  it("encrypts and decrypts a secret using an environment master key", () => {
    const secret = "sk-live-ai-provider-secret";
    const store = SecretStore.fromEnvironment("ai-key-2026-07", { AI_CONNECTIONS_MASTER_KEY: masterKey() });
    const envelope = store.encrypt(secret);

    assert.equal(envelope.algorithm, "aes-256-gcm");
    assert.equal(envelope.envelopeVersion, 1);
    assert.equal(envelope.keyVersion, "ai-key-2026-07");
    assert.notEqual(envelope.ciphertext, secret);
    assert.equal(store.decrypt(envelope), secret);
  });

  it("fails closed when another master key attempts to decrypt", () => {
    const envelope = new SecretStore({ keyVersion: "v1", masterKeyBase64: masterKey() }).encrypt("provider-token");
    const storeWithWrongKey = new SecretStore({ keyVersion: "v1", masterKeyBase64: masterKey() });

    assert.throws(() => storeWithWrongKey.decrypt(envelope), /Unable to decrypt secret/);
  });

  it("does not expose plaintext in serializable metadata", () => {
    const secret = "this-value-must-never-be-serialized";
    const store = new SecretStore({ keyVersion: "v1", masterKeyBase64: masterKey() });
    const serializedMetadata = JSON.stringify(store.metadata(store.encrypt(secret)));

    assert.doesNotMatch(serializedMetadata, new RegExp(secret));
    assert.doesNotMatch(serializedMetadata, /"ciphertext":/);
    assert.match(serializedMetadata, /ciphertextByteLength/);
  });
});
