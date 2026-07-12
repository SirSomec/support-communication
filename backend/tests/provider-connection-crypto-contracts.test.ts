import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import {
  ProviderConnectionCrypto,
  type ProviderCredentialEnvelope
} from "../apps/api-gateway/src/integrations/provider-connection-crypto.ts";

const masterKey = () => randomBytes(32).toString("base64");

describe("provider connection credential encryption", () => {
  it("encrypts and decrypts a credential with AES-256-GCM", () => {
    const crypto = ProviderConnectionCrypto.fromEnvironment("key-2026-07", {
      PROVIDER_CREDENTIAL_MASTER_KEY: masterKey()
    });

    const encrypted = crypto.encrypt("provider-secret-token");

    assert.equal(encrypted.algorithm, "aes-256-gcm");
    assert.equal(encrypted.envelopeVersion, 1);
    assert.equal(encrypted.keyVersion, "key-2026-07");
    assert.notEqual(encrypted.ciphertext, "provider-secret-token");
    assert.equal(crypto.decrypt(encrypted), "provider-secret-token");
  });

  it("uses a fresh IV for every encryption", () => {
    const crypto = new ProviderConnectionCrypto({ keyVersion: "v1", masterKeyBase64: masterKey() });

    const first = crypto.encrypt("same-token");
    const second = crypto.encrypt("same-token");

    assert.notEqual(first.iv, second.iv);
    assert.notEqual(first.ciphertext, second.ciphertext);
  });

  it("fails closed with a different master key", () => {
    const encrypted = new ProviderConnectionCrypto({ keyVersion: "v1", masterKeyBase64: masterKey() }).encrypt("secret");
    const otherCrypto = new ProviderConnectionCrypto({ keyVersion: "v1", masterKeyBase64: masterKey() });

    assert.throws(() => otherCrypto.decrypt(encrypted), /Unable to decrypt provider credential/);
  });

  it("fails closed when ciphertext, authentication tag, or IV is damaged", () => {
    const crypto = new ProviderConnectionCrypto({ keyVersion: "v1", masterKeyBase64: masterKey() });
    const encrypted = crypto.encrypt("secret");

    for (const field of ["ciphertext", "authTag", "iv"] as const) {
      const damaged: ProviderCredentialEnvelope = { ...encrypted, [field]: "AAAA" };
      assert.throws(() => crypto.decrypt(damaged), /Unable to decrypt provider credential/);
    }
  });

  it("authenticates the key version and rejects another version", () => {
    const key = masterKey();
    const encrypted = new ProviderConnectionCrypto({ keyVersion: "v1", masterKeyBase64: key }).encrypt("secret");
    const rotated = new ProviderConnectionCrypto({ keyVersion: "v2", masterKeyBase64: key });

    assert.throws(() => rotated.decrypt(encrypted), /Unable to decrypt provider credential/);
    assert.throws(
      () => new ProviderConnectionCrypto({ keyVersion: "v1", masterKeyBase64: key }).decrypt({ ...encrypted, keyVersion: "v2" }),
      /Unable to decrypt provider credential/
    );
  });

  it("rejects missing, malformed, and incorrectly sized master keys", () => {
    assert.throws(() => ProviderConnectionCrypto.fromEnvironment("v1", {}), /must be configured/);
    assert.throws(
      () => ProviderConnectionCrypto.fromEnvironment("v1", { PROVIDER_CREDENTIAL_MASTER_KEY: "not base64!" }),
      /valid base64/
    );
    assert.throws(
      () => ProviderConnectionCrypto.fromEnvironment("v1", { PROVIDER_CREDENTIAL_MASTER_KEY: randomBytes(31).toString("base64") }),
      /exactly 32 bytes/
    );
  });

  it("rejects empty credentials and key versions", () => {
    const key = masterKey();
    assert.throws(() => new ProviderConnectionCrypto({ keyVersion: "", masterKeyBase64: key }), /key version/);
    assert.throws(
      () => new ProviderConnectionCrypto({ keyVersion: "v1", masterKeyBase64: key }).encrypt(""),
      /must not be empty/
    );
  });
});
