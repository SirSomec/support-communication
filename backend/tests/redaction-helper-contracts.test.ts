import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  redactSensitiveText,
  redactSensitiveValue,
  sensitiveRedactionLabel
} from "@support-communication/redaction";
import { canonicalSecretBearingFixtures, assertLogRecordsDoNotLeakCanonicalSecrets } from "@support-communication/testing";

describe("shared redaction helper contracts", () => {
  it("redacts canonical secret carriers without depending on envelope or observability packages", () => {
    const redacted = redactSensitiveValue({
      authorization: canonicalSecretBearingFixtures.publicApiKey.carriers[0].value,
      descriptorText: canonicalSecretBearingFixtures.publicApiKey.carriers[3].value,
      objectKey: canonicalSecretBearingFixtures.objectKey.raw,
      providerFailure: canonicalSecretBearingFixtures.providerToken.carriers[2].value,
      webhookSignature: canonicalSecretBearingFixtures.webhookSignature.carriers[3].value,
      nested: [
        canonicalSecretBearingFixtures.objectKey.carriers[3].value,
        `Storage rejected objectKey=${canonicalSecretBearingFixtures.objectKey.raw}`
      ]
    });

    const serialized = JSON.stringify(redacted);
    assertLogRecordsDoNotLeakCanonicalSecrets([serialized]);
    assert.match(serialized, /\[REDACTED:api_key\]/);
    assert.match(serialized, /\[REDACTED:object_key\]/);
    assert.match(serialized, /\[REDACTED:provider_token\]/);
    assert.match(serialized, /\[REDACTED:webhook_signature\]/);
  });

  it("redacts every canonical carrier when received as already-serialized text", () => {
    const carrierTexts = Object.values(canonicalSecretBearingFixtures).flatMap((fixture) =>
      fixture.carriers.map((carrier) => redactSensitiveText(carrier.value))
    );

    assertLogRecordsDoNotLeakCanonicalSecrets(carrierTexts);
  });

  it("redacts bare canonical API keys and provider tokens in free text", () => {
    const redacted = redactSensitiveText([
      "provider returned raw token",
      canonicalSecretBearingFixtures.publicApiKey.raw,
      canonicalSecretBearingFixtures.providerToken.raw
    ].join(" "));

    assertLogRecordsDoNotLeakCanonicalSecrets([redacted]);
    assert.match(redacted, /\[REDACTED:api_key\]/);
    assert.match(redacted, /\[REDACTED:provider_token\]/);
  });

  it("preserves error codes that contain secret field names", () => {
    assert.equal(redactSensitiveText("api_key_not_found"), "api_key_not_found");
    assert.equal(redactSensitiveText("provider_token_invalid"), "provider_token_invalid");
  });

  it("preserves ordinary route URLs while redacting storage-like object-key paths", () => {
    assert.equal(
      redactSensitiveText("/operations/restore-checks/backup-postgres-nightly/artifact"),
      "/operations/restore-checks/backup-postgres-nightly/artifact"
    );
    assert.equal(
      redactSensitiveText("/api/v1/reports/export-2418/download"),
      "/api/v1/reports/export-2418/download"
    );
    assert.equal(
      redactSensitiveText("https://app.local/reports/usage"),
      "https://app.local/reports/usage"
    );
    assert.equal(
      redactSensitiveText("scanner failed to read object tenant-volga/private/export/canonical-object-key-secret.csv"),
      "scanner failed to read object [REDACTED:object_key]"
    );
  });

  it("classifies sensitive field names for package consumers", () => {
    assert.equal(sensitiveRedactionLabel("authorization"), "api_key");
    assert.equal(sensitiveRedactionLabel("objectKey"), "object_key");
    assert.equal(sensitiveRedactionLabel("providerToken"), "provider_token");
    assert.equal(sensitiveRedactionLabel("webhookSignature"), "webhook_signature");
    assert.equal(sensitiveRedactionLabel("downloadUrl"), null);
  });
});
